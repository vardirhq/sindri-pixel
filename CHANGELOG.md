# Changelog

## Unreleased

### Added

- Added a **standalone AI Pixel-Art Downscaler web app** (`web/`), published as a static GitHub Pages site at <https://vardirhq.github.io/sindri-pixel/>. It runs the same reconstruction pipeline as the editor's Import AI Art dialog — grid detection, per-cell sampling, palette quantization, cleanup — as a single page with drag-drop, clipboard paste, side-by-side previews, a palette readout, and PNG export at 1×–16× nearest-neighbor scale. Nothing is uploaded: the image is decoded and processed entirely in the browser tab, and the build contains no Tauri code. Built with `pnpm build:web` and deployed by the `Pages` workflow on pushes to `main`.

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
