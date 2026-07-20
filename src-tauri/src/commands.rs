use tauri::command;

const MAX_PROJECT_DIMENSION: u32 = 512;
const MAX_OUTPUT_DIMENSION: u32 = 16_384;
const MAX_OUTPUT_BYTES: usize = 512 * 1024 * 1024;
const MAX_SCALE: u32 = 32;

fn checked_rgba_len(width: u32, height: u32) -> Result<usize, String> {
    if width == 0 || height == 0 || width > MAX_OUTPUT_DIMENSION || height > MAX_OUTPUT_DIMENSION {
        return Err(format!(
            "dimensions must be between 1 and {MAX_OUTPUT_DIMENSION} pixels"
        ));
    }
    let bytes = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "pixel dimensions are too large".to_string())?;
    if bytes > MAX_OUTPUT_BYTES {
        return Err("pixel buffer exceeds the safe export limit".to_string());
    }
    Ok(bytes)
}

fn validate_project_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 || width > MAX_PROJECT_DIMENSION || height > MAX_PROJECT_DIMENSION
    {
        return Err(format!(
            "imported images must be between 1 and {MAX_PROJECT_DIMENSION} pixels per side"
        ));
    }
    Ok(())
}

fn validated_scale(scale: Option<u32>) -> Result<u32, String> {
    let scale = scale.unwrap_or(1);
    if !(1..=MAX_SCALE).contains(&scale) {
        return Err(format!("scale must be between 1 and {MAX_SCALE}"));
    }
    Ok(scale)
}

fn validate_rgba(pixels: &[u8], width: u32, height: u32) -> Result<(), String> {
    let expected = checked_rgba_len(width, height)?;
    if pixels.len() != expected {
        return Err(format!(
            "pixel buffer has {} bytes; expected {expected}",
            pixels.len()
        ));
    }
    Ok(())
}

fn atomic_write(path: &std::path::Path, content: &[u8]) -> Result<(), String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    let parent = path.parent().unwrap_or_else(|| std::path::Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "project path has no valid file name".to_string())?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let temporary = parent.join(format!(".{file_name}.{}.{}.tmp", std::process::id(), nonce));

    let result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(content).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);

        #[cfg(not(windows))]
        {
            fs::rename(&temporary, path).map_err(|error| error.to_string())?;
        }

        #[cfg(windows)]
        {
            if path.exists() {
                let backup = parent.join(format!(".{file_name}.backup"));
                if backup.exists() {
                    fs::remove_file(&backup).map_err(|error| error.to_string())?;
                }
                fs::rename(path, &backup).map_err(|error| error.to_string())?;
                if let Err(error) = fs::rename(&temporary, path) {
                    let _ = fs::rename(&backup, path);
                    return Err(error.to_string());
                }
                let _ = fs::remove_file(backup);
            } else {
                fs::rename(&temporary, path).map_err(|error| error.to_string())?;
            }
        }

        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

/// Read a .spr file from disk. Returns raw JSON bytes as string.
#[command]
pub async fn read_sprite_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}

/// Write a .spr file to disk.
#[command]
pub async fn write_sprite_file(path: String, content: String) -> Result<(), String> {
    use std::path::PathBuf;

    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("refusing to save invalid project JSON: {error}"))?;

    let path = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || atomic_write(&path, content.as_bytes()))
        .await
        .map_err(|error| error.to_string())?
}

/// Nearest-neighbor upscale of a flat RGBA buffer by an integer factor.
fn upscale_rgba(pixels: &[u8], width: u32, height: u32, scale: u32) -> Vec<u8> {
    if scale <= 1 {
        return pixels.to_vec();
    }
    let (w, h, s) = (width as usize, height as usize, scale as usize);
    let mut out = vec![0u8; w * h * s * s * 4];
    let out_w = w * s;
    for y in 0..h {
        for x in 0..w {
            let src = (y * w + x) * 4;
            let px = &pixels[src..src + 4];
            for dy in 0..s {
                for dx in 0..s {
                    let dst = ((y * s + dy) * out_w + x * s + dx) * 4;
                    out[dst..dst + 4].copy_from_slice(px);
                }
            }
        }
    }
    out
}

/// Export a sprite as PNG. `pixels` is a flat RGBA array (width * height * 4 bytes).
/// `scale` optionally upscales the output by an integer factor (nearest-neighbor).
#[command]
pub async fn export_png(
    path: String,
    width: u32,
    height: u32,
    pixels: Vec<u8>,
    scale: Option<u32>,
) -> Result<(), String> {
    use std::io::BufWriter;
    validate_rgba(&pixels, width, height)?;
    let s = validated_scale(scale)?;
    let output_width = width
        .checked_mul(s)
        .ok_or_else(|| "scaled PNG width is too large".to_string())?;
    let output_height = height
        .checked_mul(s)
        .ok_or_else(|| "scaled PNG dimensions are too large".to_string())?;
    checked_rgba_len(output_width, output_height)?;
    let scaled = upscale_rgba(&pixels, width, height, s);
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let w = BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, output_width, output_height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer
        .write_image_data(&scaled)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Export an animated GIF.
/// `frames` is a list of flat RGBA byte arrays (one per animation frame).
/// `delays_ms` holds the per-frame duration in milliseconds; if it has fewer
/// entries than `frames`, the last entry (or 120 ms) is reused.
/// `scale` optionally upscales the output by an integer factor.
#[command]
pub async fn export_gif(
    path: String,
    frames: Vec<Vec<u8>>,
    width: u32,
    height: u32,
    delays_ms: Vec<u32>,
    scale: Option<u32>,
) -> Result<(), String> {
    use gif::{Encoder, Frame, Repeat};
    use std::io::BufWriter;

    if frames.is_empty() {
        return Err("animated GIF export requires at least one frame".to_string());
    }
    for frame in &frames {
        validate_rgba(frame, width, height)?;
    }
    let s = validated_scale(scale)?;
    let out_w = width
        .checked_mul(s)
        .ok_or_else(|| "scaled GIF width is too large".to_string())?;
    let out_h = height
        .checked_mul(s)
        .ok_or_else(|| "scaled GIF height is too large".to_string())?;
    if out_w > u16::MAX as u32 || out_h > u16::MAX as u32 {
        return Err("scaled GIF dimensions exceed the format limit".to_string());
    }
    checked_rgba_len(out_w, out_h)?;

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let buf = BufWriter::new(file);
    // Empty global palette — each frame carries its own local palette
    let mut encoder =
        Encoder::new(buf, out_w as u16, out_h as u16, &[]).map_err(|e| e.to_string())?;
    encoder
        .set_repeat(Repeat::Infinite)
        .map_err(|e| e.to_string())?;

    for (i, frame_rgba) in frames.into_iter().enumerate() {
        let delay_ms = delays_ms
            .get(i)
            .or_else(|| delays_ms.last())
            .copied()
            .unwrap_or(120);
        // GIF delay is in units of 10 ms (centiseconds); clamp to ≥ 1
        let delay = ((delay_ms + 5) / 10).max(1) as u16;

        // gif crate's from_rgba_speed quantises to a ≤256-colour palette.
        // Pixel art rarely exceeds that limit, so quality is lossless.
        let mut pixels = upscale_rgba(&frame_rgba, width, height, s);
        let mut frame = Frame::from_rgba_speed(out_w as u16, out_h as u16, &mut pixels, 10);
        frame.delay = delay;
        // Dispose=Background so transparent pixels don't ghost across frames
        frame.dispose = gif::DisposalMethod::Background;
        encoder.write_frame(&frame).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Read a PNG from disk. Returns width, height, and flat RGBA pixel array.
/// Each pixel is 4 bytes: [r, g, b, a]. Transparent pixels (a == 0) are
/// returned with rgb == 0 so the frontend can treat them as null.
#[command]
pub async fn import_png(path: String) -> Result<serde_json::Value, String> {
    use std::io::BufReader;
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut decoder = png::Decoder::new(BufReader::new(file));
    // Expand indexed/palette and sub-byte-depth images to RGB/RGBA automatically
    decoder.set_transformations(png::Transformations::EXPAND);
    let mut reader = decoder.read_info().map_err(|e| e.to_string())?;
    validate_project_dimensions(reader.info().width, reader.info().height)?;
    checked_rgba_len(reader.info().width, reader.info().height)?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let w = info.width;
    let h = info.height;
    // Normalise to RGBA
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            let src = &buf[..info.buffer_size()];
            src.chunks(3)
                .flat_map(|c| [c[0], c[1], c[2], 255u8])
                .collect()
        }
        png::ColorType::GrayscaleAlpha => {
            let src = &buf[..info.buffer_size()];
            src.chunks(2)
                .flat_map(|c| [c[0], c[0], c[0], c[1]])
                .collect()
        }
        png::ColorType::Grayscale => {
            let src = &buf[..info.buffer_size()];
            src.iter().flat_map(|&v| [v, v, v, 255u8]).collect()
        }
        _ => return Err("unsupported PNG color type".to_string()),
    };
    // Convert flat RGBA bytes to Vec<u32> where 0 == transparent
    let pixels: Vec<u32> = rgba
        .chunks(4)
        .map(|c| {
            if c[3] == 0 {
                0u32
            } else {
                ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | (c[2] as u32) | 0xFF00_0000u32
            }
        })
        .collect();
    Ok(serde_json::json!({ "w": w, "h": h, "pixels": pixels }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nearest_neighbor_upscale_is_exact() {
        let source = [255, 0, 0, 255, 0, 255, 0, 255];
        let scaled = upscale_rgba(&source, 2, 1, 2);
        assert_eq!(
            scaled,
            vec![
                255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255,
                255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
            ]
        );
    }

    #[test]
    fn rejects_mismatched_pixel_buffers() {
        let error = validate_rgba(&[0; 4], 2, 2).unwrap_err();
        assert!(error.contains("expected 16"));
    }

    #[test]
    fn rejects_unsafe_import_and_export_sizes() {
        assert!(validate_project_dimensions(513, 32).is_err());
        assert!(checked_rgba_len(16_384, 16_384).is_err());
    }

    #[tokio::test]
    async fn project_writes_replace_atomically() {
        let directory =
            std::env::temp_dir().join(format!("sindri-pixel-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("hero.spr");
        write_sprite_file(
            path.to_string_lossy().into_owned(),
            "{\"version\":1}".to_string(),
        )
        .await
        .unwrap();
        write_sprite_file(
            path.to_string_lossy().into_owned(),
            "{\"version\":2}".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(std::fs::read_to_string(path).unwrap(), "{\"version\":2}");
        std::fs::remove_dir_all(directory).unwrap();
    }
}
