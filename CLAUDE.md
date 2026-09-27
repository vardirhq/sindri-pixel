# CLAUDE.md

Guidance for working in this repository.

## What this is

Sindri Pixel is a local-first desktop pixel-art & sprite-animation studio — the
sprite editor for the Sindri 2D game engine. It's a **Tauri 2** app: a **React
18 + TypeScript 5** frontend (`src/`) over a compiled **Rust** backend
(`src-tauri/`). Rendering-heavy work (PNG/GIF encoding, integer upscaling, image
import) runs in Rust; everything else is in the web layer.

The app **degrades gracefully to a plain web page** when Tauri isn't present
(dev server, demos, tests). `src/lib/platform.ts` gates on `IS_TAURI` and
provides browser fallbacks — keep new native features behind that check so the
web build keeps working.

## Toolchain

- Package manager is **pnpm** (`pnpm@10.30.3`) — not npm. Node 22.
- `package-lock.json` is vestigial; the source of truth is `pnpm-lock.yaml`.
  If you change dependencies, update `pnpm-lock.yaml` via pnpm.

## Commands

Frontend:

- `pnpm dev` — Vite dev server on port 1420 (strict port).
- `pnpm test` — Vitest (unit tests).
- `pnpm build` — `tsc && vite build`.
- `pnpm dev:web` / `pnpm build:web` — the standalone web tool (see below),
  port 1421, output `dist-web/`.
- `pnpm check` — tests + both bundles. **This is the CI quality gate for the
  frontend; run it before pushing.**

Desktop / Rust (all Cargo commands target `src-tauri/Cargo.toml`):

- `pnpm tauri` — Tauri CLI wrapper (`scripts/tauri.mjs`); sets
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Wayland automatically.
- `pnpm tauri:build` — build native bundles.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings`
  (CI denies warnings.)
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`

## Layout

Frontend (`src/`):

- `components/` — React UI. `import/ImportAiArtDialog.tsx` drives the AI-art
  import flow; with several images it embeds `aiArt/FrameWorkspace`.
- `components/aiArt/` — the AI-art frame workspace (stage with onion skin,
  transport, per-frame inspector, frame strip, undo history, Web Worker
  engine). **Shared by the editor dialog and the web tool** — build features
  here so both get them. Styles are `aa-`-prefixed in `aiArt.css`, using only
  design tokens.
- `lib/project-format.ts` — the versioned `.spr` project format (with
  legacy-file migration and strict validation). Has tests.
- `lib/sprite.ts` — sprite model, layer compositing, sprite-sheet layout. Has tests.
- `lib/tilemap.ts` — tilemap layers (`Layer.tilemap`): the tileset is derived
  from the pixels (distinct tiles, flips reused), auto-editing spreads a
  stroke to every copy of the tiles it touched (`propagateTileEdit`, wired in
  `App.updateActiveLayerPixels` against the layer as it was at `pushHistory`),
  tile-size guessing, and tileset PNG + Tiled `.tmj` export. Has tests.
  `components/TilesPanel.tsx` is its UI under the selected layer.
- `lib/pixelReconstruction/` — reconstructs AI-generated rasters into true
  low-res sprites; `gridDetection.ts` is the core: it fits grid lines
  to the art's edges (so they follow drift and phase) and picks the cell size
  where the fitted grid's within-cell variance jumps. Has tests; synthetic
  image builders live in `__fixtures__/synthetic.ts`.
- `lib/animation/` — pure animation assembly: splitting AI sprite sheets
  into poses (`splitSheet.ts`: foreground blobs + valley/ratio cuts, no grid
  assumed), anchoring frames on a shared canvas (feet/center), sprite-sheet
  packing + Aseprite-style JSON, a GIF encoder, `.spr` export, and the
  shared-pixel-size grid policy. Has tests.
- `lib/lessons/` — the tutorial system as data: the lesson format
  (`types.ts`), the pure check engine that evaluates a step against the
  editor state (`checks.ts`), lesson-file validation (`validate.ts`) and the
  built-in lessons (`builtin.ts`, whose tests play each step against its own
  example art). `maker.ts` is the lesson maker's model: recording
  a step from a before/after snapshot, drafts, and draft → lesson;
  `components/maker/` is its UI (course strip, step inspector, maker bar). `shelf.ts` is the list logic for the *My lessons* shelf (drafts, and
  imported `.sindri-lesson` files, validated on the way in). `components/Tutorial.tsx` renders the library and the player
  lane; `App.tsx` puts the learner's sprite aside while a lesson runs.
- `lib/platform.ts` — Tauri detection and web fallbacks (download/file-pick).
- `lib/storage.ts` — persistence helpers.

Standalone web app (`web/`):

- A second Vite entry point (`vite.config.web.ts`, root `web/`) that ships
  **only** `lib/pixelReconstruction`, `lib/animation`, `components/aiArt` and
  the design tokens as a static GitHub Pages site: <https://pixel.vardir.no>.
  Two modes: Downscale (one image) and Animate (several frames → sheet/GIF/
  `.spr`). No editor, no Tauri — don't import anything Tauri-gated into it.
- The layout is viewport-filling (masthead / sidebar + canvases / status bar),
  not a scrolling page: `body` is `overflow: hidden` above 820px wide, and the
  preview canvases are sized by a `ResizeObserver` rather than fixed pixels.
- `base` is `/` for the custom domain; `web/public/CNAME` carries the domain
  into every deploy so re-deploying can't reset the Pages setting. Override
  with `VITE_WEB_BASE=/sindri-pixel/` to serve from the project-Pages subpath.
- Deployed by `.github/workflows/pages.yml` on pushes to `main`. Needs
  Settings → Pages → Source = "GitHub Actions" plus the custom-domain and DNS
  setup listed in that workflow's header comment.
- `pixelReconstruction/uiOptions.ts` holds the choice types, presets, and
  choice → `PixelArtOptions` mapping shared with `ImportAiArtDialog`. Change
  knobs there, not in one front-end.

Backend (`src-tauri/src/`):

- `commands.rs` — Tauri commands invoked from the frontend:
  `read_sprite_file`, `write_sprite_file`, `write_palette_file`, `export_png`, `export_gif`,
  `import_png`. Registered in `lib.rs` via `generate_handler!`.
- `lib.rs` / `main.rs` — app setup and entry point.
- `tauri.conf.json` — window, bundle, and CSP config. The CSP is deliberately
  tight and offline (no remote fonts/requests); don't loosen it casually.

## Versioning & releases

The version lives in **three files that must always agree**:

- `package.json`
- `src-tauri/Cargo.toml` (also mirror it in `src-tauri/Cargo.lock`'s
  `sindri-pixel` entry)
- `src-tauri/tauri.conf.json`

Two UI strings also show the marketing version: `src/components/StatusBar.tsx`
and `src/components/AppMenu.tsx` (short form, e.g. `v0.1.0`). Update them when
the major/minor changes.

**Prereleases and the MSI bundle.** WiX/MSI requires a numeric-only
`major.minor.patch[.build]` version, so a semver prerelease with a
non-numeric identifier (`0.1.0-beta.1`) makes `tauri build` fail on Windows
with *"optional pre-release identifier in app version must be numeric-only"*.
Only the MSI target is strict — NSIS, deb, AppImage, and dmg all accept the
full semver string. `bundle.windows.wix.version` in `tauri.conf.json`
overrides the version for MSI alone, encoding the prerelease number as the
fourth field (`0.1.0-beta.1` → `0.1.0.1`). Bump it alongside the three files
above whenever the version has a prerelease identifier. Note that Windows
Installer ignores the fourth field when comparing versions for upgrades, so
it distinguishes betas cosmetically, not for upgrade detection.

CI/release workflows (`.github/workflows/`):

- `desktop.yml` — **CI only**: quality gate + native package build on pull
  requests, pushes to `main`, and manual dispatch.
- `release.yml` — **releases**: triggered by pushing a `v*` tag (or manual
  dispatch with an existing tag). Runs the quality gate, builds Linux/macOS/
  Windows bundles, writes `SHA256SUMS.txt`, and publishes the GitHub release.
  Any tag containing a `-` (e.g. `v0.1.0-beta.1`) is auto-marked as a
  prerelease.

To cut a release: bump the version files above, update `CHANGELOG.md`, merge to
`main`, then `git tag vX.Y.Z[-beta.N] && git push origin vX.Y.Z[-beta.N]`.
Bundles are currently **unsigned** (see `docs/release-checklist.md` for the
full checklist and stable-release blockers).

## Conventions

- Keep `CHANGELOG.md` updated for user-facing changes; its top heading tracks
  the current version.
- Prefer running the exact CI commands above locally before pushing — CI mirrors
  them and denies Clippy warnings.
