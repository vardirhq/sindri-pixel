# Changelog

## Unreleased

### Added

- Added a **standalone AI Pixel-Art Downscaler web app** (`web/`), published as a static GitHub Pages site at <https://pixel.vardir.no>. It runs the same reconstruction pipeline as the editor's Import AI Art dialog — grid detection, per-cell sampling, palette quantization, cleanup — with drag-drop, clipboard paste, side-by-side previews, a palette readout, and PNG export at 1×–16× nearest-neighbor scale. The layout fills the viewport like an application: a thin masthead, a controls sidebar, preview canvases that take all remaining height and repaint at an integer zoom whenever the window resizes, and a status bar that carries the export controls and a single line pointing at the desktop editor. Nothing is uploaded: the image is decoded and processed entirely in the browser tab, and the build contains no Tauri code. Built with `pnpm build:web` and deployed by the `Pages` workflow on pushes to `main`.
- Added a **Pixel size** grid option to both AI-art front ends. Enter the size of one art pixel in source pixels (decimals allowed) instead of output dimensions. The grid is phase-aligned to the image's edges, so cells land on real pixel boundaries even when the art doesn't start at the origin.
- **Animate AI-generated frames**, in the web tool (<https://pixel.vardir.no>, new *Animate* mode) and in the desktop editor (pick several images in *Import AI art…*). Both use one shared frame workspace:
  - **One pixel size and one palette** for every frame, so the sprite neither pulses in size nor flickers in color.
  - **Solid backdrops cleared**, so white or grey backgrounds become transparent.
  - **Frames aligned by the character's feet** (or center), measured from each sprite's own pixels, so poses the generator drew in different places stand on one ground line.
  - A **stage** with onion skin, a pixel grid, loop or ping-pong playback, and drag-to-position.
  - **Per-frame position, scale, mirroring and hold time.** Scale re-reads the source at a new pixel size, so it stays crisp.
  - A **reorderable frame strip**: drag frames around, or drop files between them.
  - **Undo/redo** and keyboard shortcuts (`?` lists them).
  - Reconstruction runs in a **Web Worker**, so the page stays responsive.
  - The web tool **exports** a sprite sheet (PNG with Aseprite-style JSON), an animated GIF, or a `.spr` project for the editor. In the desktop app the frames land in the editor's timeline.
- **Split AI sprite sheets into frames.** Drop a generated sheet into the web tool or the editor's *Import AI art…* and it offers **Split into N frames**. The poses go straight into the Animate workspace in reading order, one frame each.
  - **No grid assumed**, because generated sheets rarely have one. It finds the poses themselves as blobs of foreground: pixels on transparency, or pixels that stand out from a flat backdrop.
  - **Stacked rows:** rows packed so close that hair touches the feet above are cut at the near-empty rows between them.
  - **Touching poses:** poses touching side by side are cut, and each side keeps the pixels it reaches first from its own body, so a fist reaching across stays with its arm.
  - **Fragments and labels:** detached bits (a sword flash) rejoin their pose; far-off specks and text labels are dropped.
  - **Clean crops:** each frame is cut out with only its own pixels plus what they enclose, such as the whites of the eyes.
  - **Result:** a real 1983×793 AI walk-cycle sheet splits into its 16 poses in under 0.1s.
- Added a **Remove solid background** option to both AI-art front ends. It clears a flat backdrop by flood-filling from the image edges, so enclosed areas of the same color, like the white of an eye, stay.

### Fixed

- **Sprite-sheet splitting no longer moves a boot or a fist to the wrong pose.** The splitter works on a coarse grid, which can join poses that are only a few pixels apart, like a boot hanging down beside the hair of the pose below. The cut between them could then give the boot to the lower pose, leaving one frame footless and another with a floating boot. Every separate shape on the sheet now goes whole to the pose it belongs to. Only poses that really touch are divided by the cut.
- **Sprite-sheet splitting no longer glues whole poses together.** When a few poses touched (hair reaching the feet above), their combined blob made every separate pose look like a small fragment, and those were attached to a neighbour. A frame could then hold two or four poses. Poses are now judged against the size of a typical pose after touching ones are cut apart. A real 8×4 run-cycle sheet now splits into all 32 poses instead of 29.
- Sprites with soft, semi-transparent edges no longer come out with a faint dark halo or see-through pixels. AI images often store their "solid" pixels at 94–99% opacity with a darkened, half-transparent fringe. Each art pixel is now filled or cleared by how much of it is covered, and takes its colour only from its solid pixels. On a transparent background every pixel ends up fully opaque or fully clear.
- **Colours of very small pixels.** When one art pixel is only 2–4 source pixels wide, the image's softening reaches its centre, so the tool used to return blends of neighbouring colours. It now un-blurs small pixels before reading their colours, and never pushes a colour past its neighbours, so already-crisp art is untouched. Soft 2px art goes from about 53% to 79% of pixels correct with default settings.
- Playing an animation on a phone no longer drags the page down to the frame strip on every frame, which made it impossible to scroll back up to the stage. The strip now scrolls only itself, sideways. On desktop the tool is also pinned to the window, so nothing can scroll the page away from the stage.
- Grid detection no longer misses the pixel size of sprites on a **white background**. The anti-aliased fringe against white spreads the telltale jump in cell variance over a few sizes, and looking only one or two sizes ahead missed it. A real ~15px sprite on white was read as 2.8px (459×512) and is now read correctly at 15px. It is covered by a test on curves measured from that image.
- The Import AI Art dialog's previews now scale large images down to fit, where they used to be cropped, and no longer overflow the dialog.
- **AI-art reconstruction no longer quietly shrinks large scenes to 128 px.** A low-confidence detection over 128 cells is still held to that size, but the result is now flagged (`capped`, with the pre-cap `detectedCellSize`). Both the Import AI Art dialog and the web downscaler explain what happened and offer the detected pixel size as a one-click **Use N px** fix. Low-confidence results that weren't capped also carry a notice. Medium-confidence detections are no longer capped at all, only by the 512 px output limit. That limit now scales both axes together, so a very tall or wide grid keeps its aspect ratio.
- **Grid detection fits its lines to the art itself.** AI output rarely has one even grid: pixel sizes drift across the image (one apparent pixel 14px, the next 18px), the grid seldom starts at the corner, and some edges separate colors of equal brightness. Detection now places every grid line on the art's own edges, with spacing free to vary ±25%, and reads the pixel size from where that fitted grid stops being uniform. All of that is automatic, including for edge-to-edge art (which used to be divided evenly from the corner) and with the **Pixel size** override. The edge signal is color-aware and ignores whatever RGB hides in fully transparent pixels. On a real ~15px AI sprite (1187×1325) this gives the art's true 81×87 grid, where the previous detector guessed 8px at low confidence and output a doubled-up 116×128. Soft 2px pixels, and 3px pixels under a heavy blur, are now found without a manual pixel size.
- Grid detection now recognizes **small, soft pixels** (about 3 source px, anti-aliased), which previously read as low confidence or as a coarse multiple of the real size. Cells like that give no variance "dip", because a slightly smaller cell is just as uniform. Instead they show a knee: variance stays flat up to the true size, then jumps. A soft 3px scene that used to come out 128×85 now comes out at its real 512×341.

## 0.1.0-beta.2

### Changed

- Made `mode` cell sampling in AI-art reconstruction center-weighted: each cell's dominant-color vote now weights source pixels by their distance from the cell centre, so a slightly-misaligned or fractional grid boundary can no longer let an edge color outvote the cell's true central color. Small central details (like an eye pixel) survive where a plain pixel count would blend them away. Clean, well-aligned cells are unaffected.

## 0.1.0-beta.1

### Added

- Added an **Import AI Art** flow that reconstructs AI-generated pixel-art rasters into true low-resolution sprites. Grid detection works the way a human "counts pixels": it sweeps candidate cell sizes, phase-aligns each, and finds the size where within-cell variance collapses to a sharp minimum (a real grid makes every cell internally uniform), accelerated with integral images. The depth of that variance dip is the confidence — a strong dip means genuine pixel art (detected exactly, high confidence), while a flat curve means a smooth/anti-aliased render with no true grid (reported low confidence and capped to a usable size rather than emitting a noisy downscale). It also recovers the sub-pixel cell size and grid-line phase for sprites inset on a background, so resampling lands on the source's real pixel boundaries instead of assuming the grid starts at the origin — small offsets otherwise smear fine detail like eyes. Reconstruction offers selectable per-cell sampling (`mode` for clean flat pixels or `average` for a detail-preserving downscale), median-cut palette quantization, and a rule-based cleanup pass (isolated-pixel removal, near-duplicate color merging). The import dialog offers a side-by-side preview plus one-click **Clean sprite** and **High detail** presets. All processing runs client-side.
- Added a versioned `.spr` project format with legacy unversioned-file migration and strict validation.
- Added automated tests for project compatibility, pixel conversion, layer compositing, and sprite-sheet layout.
- Added cross-platform GitHub Actions checks, native Tauri bundle builds, prerelease publishing, and SHA-256 release checksums.
- Added bundled application fonts and complete native desktop icon assets.
- Added Dream Pixel Editor migration guidance and a desktop release checklist.

### Changed

- Changed project saving to use temporary-file replacement instead of writing directly over the current file.
- Added validation for native PNG/GIF dimensions, scale factors, frame data, and pixel-buffer sizes.
- Added visible file-open and save errors instead of logging failures only to the developer console.
- Tightened the Tauri content security policy and removed runtime Google Fonts requests.
