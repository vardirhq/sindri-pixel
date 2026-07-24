# Changelog

## 0.2.0-beta.1

### Added

- Added an **Import AI Art** flow that reconstructs AI-generated pixel-art rasters into true low-resolution sprites: confidence-scored autocorrelation grid detection (distrusts texture-heavy images and caps oversized output instead of returning a noisy downscale), selectable per-cell sampling (`mode` for clean flat pixels or `average` for a detail-preserving downscale), median-cut palette quantization, and a rule-based cleanup pass (isolated-pixel removal, near-duplicate color merging). The import dialog offers a side-by-side preview plus one-click **Clean sprite** and **High detail** presets. All processing runs client-side.
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
