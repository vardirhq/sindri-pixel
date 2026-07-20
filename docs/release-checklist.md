# Desktop release checklist

## Automated gates

- [ ] TypeScript build passes.
- [ ] Project-format and sprite-export tests pass.
- [ ] Rust formatting and Clippy pass with warnings denied.
- [ ] Rust tests pass with the committed lockfile.
- [ ] Linux, macOS, and Windows native bundles build successfully.
- [ ] Release assets include `SHA256SUMS.txt`.

## Manual workflow checks

- [ ] Create a project, draw on multiple layers, and add at least three frames.
- [ ] Save, reopen, edit, and save over the existing `.spr` file.
- [ ] Force-close with dirty work and verify crash recovery.
- [ ] Open a legacy unversioned `.spr` fixture and save it as format version 1.
- [ ] Verify malformed and future-version files show a useful error without changing editor state.
- [ ] Export a transparent PNG at 1× and an integer-upscaled PNG.
- [ ] Export an animated GIF and confirm timing and transparent-frame disposal.
- [ ] Export a non-square sprite-sheet grid and verify frame order.
- [ ] Import RGB, RGBA, grayscale, and indexed PNG fixtures.
- [ ] Confirm the app starts without network access and uses bundled fonts.

## Distribution checks

- [ ] Install each native bundle on a clean machine or VM.
- [ ] Confirm OS warnings accurately reflect the current unsigned beta status.
- [ ] Verify application name, identifier, icon, version, and uninstall behavior.
- [ ] Compare every downloaded asset against `SHA256SUMS.txt`.
- [ ] Mark prerelease tags such as `sindri-pixel-v0.2.0-beta.1` as GitHub prereleases.
- [ ] Add known limitations and Dream Pixel migration guidance to the release notes.

## Stable-release blockers

- Code signing and notarization for macOS.
- Authenticode signing for Windows.
- Successful clean-install testing on all supported operating systems.
- A fixture-backed `.spr` compatibility policy and recovery test suite.
