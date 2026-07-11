use tauri::command;

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
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| e.to_string())
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
    let s = scale.unwrap_or(1).max(1);
    let scaled = upscale_rgba(&pixels, width, height, s);
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let w = BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, width * s, height * s);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(&scaled).map_err(|e| e.to_string())?;
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

    let s = scale.unwrap_or(1).max(1);
    let (out_w, out_h) = (width * s, height * s);

    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let buf = BufWriter::new(file);
    // Empty global palette — each frame carries its own local palette
    let mut encoder = Encoder::new(buf, out_w as u16, out_h as u16, &[])
        .map_err(|e| e.to_string())?;
    encoder.set_repeat(Repeat::Infinite).map_err(|e| e.to_string())?;

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
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).map_err(|e| e.to_string())?;
    let w = info.width;
    let h = info.height;
    // Normalise to RGBA
    let rgba: Vec<u8> = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            let src = &buf[..info.buffer_size()];
            src.chunks(3).flat_map(|c| [c[0], c[1], c[2], 255u8]).collect()
        }
        png::ColorType::GrayscaleAlpha => {
            let src = &buf[..info.buffer_size()];
            src.chunks(2).flat_map(|c| [c[0], c[0], c[0], c[1]]).collect()
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
            if c[3] == 0 { 0u32 }
            else { ((c[0] as u32) << 16) | ((c[1] as u32) << 8) | (c[2] as u32) | 0xFF00_0000u32 }
        })
        .collect();
    Ok(serde_json::json!({ "w": w, "h": h, "pixels": pixels }))
}
