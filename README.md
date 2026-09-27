<div align="center">

# ✦ Sindri Pixel

**A local-first desktop pixel-art & sprite-animation studio.**
Draw sprites, choreograph frame-by-frame animation, follow interactive lessons, and export production-ready PNG, GIF, and sprite sheets — all in a single native app.

[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-backend-CE422B?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
![License](https://img.shields.io/badge/status-early%20preview-f0c050)

</div>

---

## What is Sindri Pixel?

Sindri Pixel is the sprite editor for the **Sindri** 2D game engine. It pairs a fast, keyboard-driven drawing surface with a real animation timeline and a batteries-included export pipeline. The rendering-heavy work — PNG/GIF encoding, integer upscaling, image import — runs in a compiled **Rust** backend, while the interface is a crisp **React + TypeScript** frontend delivered through **Tauri 2** as a small, native, offline-capable desktop app.

The design ethos is deliberately **local-first and AI-as-peer**: your files live on your disk, everything works offline, and the AI compose surface is an optional collaborator — never a dependency. The whole thing degrades gracefully to a plain web page when Tauri isn't present, so the editor still runs in a browser for demos and development.

> The default project greets you with a 4-frame hover-bob animation of a patrol drone on a 32×32 canvas — a working example of every core feature the moment you open the app.

### Release status

Sindri Pixel is preparing its first cross-platform beta. Native Linux, macOS, and Windows bundles are built and tested by GitHub Actions; tagged builds are published on the [Releases](https://github.com/vardirhq/sindri-pixel/releases) page with SHA-256 checksums. Beta builds are currently unsigned, so operating systems may show an unverified-publisher warning.

---

## Highlights

| | |
|---|---|
| 🎨 **13 drawing tools** | Pencil, eraser, shade, flood fill, color picker, line, rectangle, circle, marquee select, magic wand, lasso, move, and pan. Freehand strokes are pixel-perfect (no doubled corner pixels). |
| 🎞️ **Real animation timeline** | Multi-frame sprites with per-frame timing (ms), reordering, play/pause, and **onion skinning** of adjacent frames. |
| 🧅 **Layers per frame** | Independent layers with visibility and opacity, composited live on the canvas. |
| 🔁 **Symmetry & tiling** | Vertical, horizontal, or four-way mirrored drawing, plus a tile-preview mode for seamless textures. |
| 🎯 **Precision surface** | Zoom levels from 4× to 32×, pixel grid overlay, a draggable minimap, and full undo/redo history. |
| 🧩 **Palette profiles** | Ship-ready **Sindri**, **NES**, and **Game Boy** palettes, or start from an empty swatch set. |
| 🏷️ **Animation tags** | Name frame ranges (idle, run, attack) with forward, reverse or ping-pong playback; loop one while you work. Sheet export writes Aseprite-format JSON with the tags for engine importers. |
| ▦ **Tilemaps** | Turn any layer into a tilemap (the tile size is guessed from the art): repeated and flipped tiles are found for you, drawing on one tile draws on every copy, tiles can be stamped from the tileset, and the map exports as a tileset PNG plus a Tiled `.tmj`. |
| 🔗 **Linked cels** | Frames can share a layer's drawing — duplicate a frame as linked, or link a layer to the previous frame — so parts that don't move are drawn and fixed once. |
| 🎨 **Palette tools** | Double-click a swatch to recolour it everywhere, live, in one undo step. Import and export `.gpl`, `.hex` (Lospec) and `.pal` palettes. |
| 🎓 **Lessons** | Hands-on tutorials inside the editor: each step spotlights what it's about, shows an example to trace, and checks your drawing live, moving on when you've got it. Your own sprite waits untouched. |
| 🛠️ **Lesson maker** | Make lessons by doing them: record a step on the canvas and the maker turns it into goals, a highlighted area and an example to trace. Play from any step, and clear your own lesson before you can share it. Your lessons live on a *My lessons* shelf, and lessons people share with you import into the library. |
| ⌨️ **Command palette + shortcuts** | `⌘K` fuzzy command palette and a complete keyboard map for tools, files, view, and timeline. |
| 💾 **Autosave & crash recovery** | Work is continuously snapshotted; reopen after a crash and pick up exactly where you left off. |
| 📚 **Interactive lessons** | A built-in tutorial library with a guided player *and* an authoring mode to build your own lessons. |
| ✦ **Compose with Sindri** | An AI-assisted surface that scaffolds a sprite, palette, and animation frames as reviewable proposals. |
| 📤 **Export pipeline** | PNG (single frame), animated **GIF**, and grid **sprite sheets** — each with integer nearest-neighbor upscaling. |
| 🖼️ **PNG import** | Bring in existing art; RGBA, RGB, grayscale, and indexed PNGs are all normalized automatically. |

---

## Screens & Workflow

Sindri Pixel opens on a **Welcome** screen — recent files, saved templates, a new-project wizard, one-click access to lessons and the Compose flow, and a crash-recovery prompt when there's unsaved work to restore. From there you drop into the editor:

```
┌───────────────────────────── Topbar (menus · title · view controls) ─────────────────────────────┐
├──────────────┬──────────────────────────────────────────────────────────────┬────────────────────┤
│              │                                                                │                    │
│  Tools /     │                                                                │   Layers /         │
│  Files /     │                    Canvas  (editor · preview · split)          │   Palette /        │
│  History     │                    grid · minimap · onion skin · AI ghost      │   Inspector        │
│              │                                                                │                    │
├──────────────┴──────────────────────────────────────────────────────────────┴────────────────────┤
│                              Timeline  (frames · per-frame timing · playback)                       │
├───────────────────────────────────────── Status bar ──────────────────────────────────────────────┤
```

Right-click context menus, a `⌘K` command palette, and a frameless custom window round out a UI tuned for staying in flow — dark "forge" palette, `Pixelify Sans` display type, and `JetBrains Mono` for anything code-shaped.

---

## Getting Started

### Prerequisites

- **[Node.js](https://nodejs.org)** 18+ and **[pnpm](https://pnpm.io)** (the repo is pnpm-first; npm works too)
- **[Rust](https://www.rust-lang.org/tools/install)** toolchain (stable) — required for the desktop build
- Platform prerequisites for Tauri 2 — see the [Tauri setup guide](https://tauri.app/start/prerequisites/)

### Install

```bash
pnpm install
```

### Run the desktop app (recommended)

```bash
pnpm tauri dev
```

This launches the native window with the full feature set, including GIF export and native file dialogs. On Wayland, the launcher automatically sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` so rendering behaves.

### Run in the browser (frontend only)

```bash
pnpm dev          # Vite dev server on http://localhost:1420
```

The editor detects when Tauri is absent and falls back to browser-native file pickers and canvas-based PNG encoding. Some capabilities (e.g. animated GIF export) are desktop-only.

### Run the standalone AI pixel-art tool

```bash
pnpm dev:web      # Vite dev server on http://localhost:1421
```

The **AI Pixel-Art Studio** is a second, self-contained entry point (`web/`) that ships only the reconstruction pipeline and the animation workspace — no editor, no Tauri. It fills the viewport like an application rather than scrolling like a page, and is published as a static site at **<https://pixel.vardir.no>**. It has two modes:

- **Downscale**: one AI image turned into a true low-resolution sprite.
- **Animate**: drop several AI-generated frames (a walk cycle, an attack…) and it builds the animation.
  - **Sprite sheets** from a generator work too. Drop one and it offers **Split into N frames**. It finds the poses themselves rather than assuming a grid, so uneven spacing, sagging rows, poses that touch, detached bits like a sword flash, and stray labels are all handled.
  - Every frame is read at **one shared pixel size**, with **one shared palette**, and solid white or grey **backdrops are cleared**.
  - Frames are **aligned by the character's feet**, so poses the generator drew in different places stand on the same ground.
  - The stage has **onion skin**, a pixel grid and loop or ping-pong playback. Drag a frame, or nudge it with the arrow keys.
  - Per frame you can set **position, scale** (re-read from the source, so it stays crisp), **mirror** and **hold time**. Reorder frames by dragging them in the strip.
  - Everything is undoable. Press `?` for the keyboard shortcuts.
  - **Export** a sprite sheet (PNG plus Aseprite-style JSON that Phaser, Godot and most engine importers read), an animated GIF, or a `.spr` project for the desktop editor.

The desktop editor offers the same flow: pick several images in **Import AI art…** and the dialog opens this same workspace. The frames then land in the editor's timeline as an animation.

Grid detection is automatic. It lays grid lines along the art's own pixel edges, so it follows AI output whose pixel size drifts across the image, doesn't assume the grid starts at the corner, and sees edges between colors of equal brightness. You can always override it. **Grid size → Pixel size** takes the size of one art pixel in source pixels (e.g. `3` for a 1536×1024 scene drawn in ~3px pixels). The grid is still phase-aligned to the image's edges. When auto-detection is unsure, the tool says so instead of passing off a coarse guess as the answer. If it had to hold the output to a small size, it offers the detected pixel size as a one-click fix.

### Build for production

```bash
pnpm build        # type-check + bundle the frontend
pnpm build:web    # type-check + bundle the standalone web tool → dist-web/
pnpm tauri build  # produce a native installer/binary
```

`pnpm check` (the CI quality gate) runs the unit tests and both bundles.

---

## Tools & Shortcuts

<table>
<tr><th align="left">Tool</th><th>Key</th><th align="left">Tool</th><th>Key</th></tr>
<tr><td>Pencil</td><td align="center"><code>P</code></td><td>Magic wand</td><td align="center"><code>W</code></td></tr>
<tr><td>Eraser</td><td align="center"><code>E</code></td><td>Lasso</td><td align="center"><code>A</code></td></tr>
<tr><td>Fill (flood)</td><td align="center"><code>G</code></td><td>Line</td><td align="center"><code>L</code></td></tr>
<tr><td>Color picker</td><td align="center"><code>I</code></td><td>Rectangle</td><td align="center"><code>R</code></td></tr>
<tr><td>Marquee select</td><td align="center"><code>V</code></td><td>Circle</td><td align="center"><code>C</code></td></tr>
<tr><td>Move</td><td align="center"><code>M</code></td><td>Pan</td><td align="center"><code>H</code></td></tr>
<tr><td>Shade</td><td align="center"><code>D</code></td><td></td><td></td></tr>
</table>

Tool options include brush size, pixel-perfect strokes, filled vs. outlined shapes, "perfect" shape snapping, contiguous fill, and a fill tolerance threshold.

**Shade** steps each pixel you drag over one shade darker (or lighter) along its colour ramp; hold Shift to reverse. Ramps are found automatically, with no palette sorting needed: the next colour of the same family (similar hue and saturation, or both greys) in the palette or already in the frame. Each pixel changes once per stroke, however often you pass over it.

| Action | Shortcut | | Action | Shortcut |
|---|---|---|---|---|
| New sprite | `⌘N` | | Undo / Redo | `⌘Z` / `⇧⌘Z` |
| Open… | `⌘O` | | Copy / Cut / Paste | `⌘C` / `⌘X` / `⌘V` |
| Save / Save as… | `⌘S` / `⇧⌘S` | | Zoom in / out | `⌘+` / `⌘−` |
| Export PNG | `⌘E` | | Fit / Actual size | `⌘0` / `⌘1` |
| Export animated GIF | `⇧⌘E` | | Toggle grid / onion skin | `⇧G` / `⇧O` |
| Command palette | `⌘K` | | Prev / next frame · play | `[` / `]` · `Space` |

---

## Export Formats

| Format | Description |
|---|---|
| **PNG** | The current frame, encoded losslessly with an optional integer upscale (nearest-neighbor, so pixels stay crisp). |
| **Animated GIF** | Every frame with its own per-frame delay, looping infinitely; transparent pixels are disposed to background so nothing ghosts across frames. *(Desktop only.)* |
| **Sprite sheet** | All frames tiled into a single grid PNG with a configurable column count — ready to drop into a game engine. |
| **Sindri** | Straight into a Sindri engine project: texture + `.sheet.json` + a prefab with the sprite and one animation clip per tag, or with a `sindri.tilemap` per tilemap layer. |

Projects save to a `.spr` file — a plain, human-readable JSON document describing frames, layers, and palette, so your work is never locked behind a binary format.

The format is versioned from `v1`. Current releases still open the original unversioned `.spr` files and save them back in the versioned form. Files created by a newer unsupported format version are rejected rather than guessed at or partially loaded.

Coming from the archived Dream Pixel Editor? See [Migrating from Dream Pixel Editor](docs/migrating-from-dream-pixel.md).

---

## Architecture

```
sindri-pixel/
├── src/                      # React + TypeScript frontend
│   ├── App.tsx               # top-level editor state, history, file & export flows
│   ├── data.ts               # default sprite, palettes, seed lessons
│   ├── types.ts              # shared domain types (Frame, Layer, Tool, Lesson…)
│   ├── components/
│   │   ├── aiArt/            # AI-art frame workspace (stage, timeline, inspector,
│   │   │                     #   worker engine) — shared by the web tool and the editor
│   │   ├── import/           # Import AI Art dialog
│   │   ├── CanvasView.tsx    # the drawing surface: grid, minimap, onion skin, symmetry
│   │   ├── ToolsPane.tsx     # tool selection + options
│   │   ├── RightPane.tsx     # layers · palette · inspector
│   │   ├── Timeline.tsx      # frames, per-frame timing, playback
│   │   ├── CmdK.tsx          # ⌘K command palette
│   │   ├── Tutorial.tsx      # lesson library, player & spotlight overlay
│   │   ├── maker/            # lesson maker: panel, course strip, maker bar
│   │   └── Welcome.tsx       # welcome screen, new-project wizard, recovery
│   ├── lib/
│   │   ├── pixelReconstruction/ # AI raster → true low-res sprite (grid fitting, palette)
│   │   ├── animation/        # sheet splitting, frame alignment, sprite sheets + JSON, GIF, .spr
│   │   ├── platform.ts       # Tauri detection + browser fallbacks
│   │   ├── project-format.ts # versioned .spr parsing, migration & validation
│   │   ├── sprite.ts         # compositing and sprite-sheet layout
│   │   └── storage.ts        # recents, templates & autosave (localStorage)
│   └── styles/tokens.css     # the Sindri design system (color + type)
│
├── web/                      # standalone AI Pixel-Art Studio (GitHub Pages)
│   ├── App.tsx               # Downscale / Animate modes around the shared workspace
│   ├── ExportPanel.tsx       # sprite sheet, JSON, GIF and .spr export
│   └── main.tsx              # entry point — pipeline + tokens only, no Tauri
│
└── src-tauri/                # Rust backend (Tauri 2)
    ├── src/commands.rs       # read/write .spr, export_png, export_gif, import_png
    └── src/lib.rs            # command registration & app bootstrap
```

**Frontend → backend contract.** The UI invokes a small set of Rust commands over Tauri's IPC:

| Command | Responsibility |
|---|---|
| `read_sprite_file` / `write_sprite_file` | Load & save `.spr` project JSON. |
| `export_png` | Encode a frame to PNG with integer upscaling. |
| `export_gif` | Encode a multi-frame, per-delay looping GIF (≤256-color quantization — effectively lossless for pixel art). |
| `import_png` | Decode any PNG (RGBA/RGB/grayscale/indexed) into a normalized pixel buffer. |

When Tauri isn't available, `src/lib/platform.ts` transparently substitutes canvas-based encoders and browser file pickers so the same UI keeps working on the web.

**Two frontends, one pipeline.** `src/lib/pixelReconstruction/` and `src/lib/animation/` are pure TypeScript with no DOM or Tauri dependencies, and the frame workspace UI lives once in `src/components/aiArt/`. Together they power both the desktop editor's *Import AI Art* dialog and the standalone web tool, which get the same features from one implementation. The shared knob vocabulary (grid/palette/pixel-size choices, the *Clean sprite* and *High detail* presets, the mapping from those choices to pipeline options, and the wording of low-confidence notices) lives in `pixelReconstruction/uiOptions.ts` so the two front-ends can't drift apart.

Project writes use a temporary file and atomic replacement so an interrupted save does not truncate the existing project. The Rust export boundary validates dimensions, scaling, frame counts, and pixel-buffer lengths before allocating or encoding output.

---

## Tech Stack

- **[Tauri 2](https://tauri.app)** — native shell, IPC, and bundling (with the dialog plugin)
- **[React 18](https://react.dev)** + **[TypeScript 5](https://www.typescriptlang.org)** — strict-mode frontend
- **[Vite 5](https://vitejs.dev)** — dev server and build tooling
- **[Rust](https://www.rust-lang.org)** — `png` and `gif` crates for encoding, `tokio` for async file I/O

Run the release checks locally with:

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

---

## Roadmap

Sindri Pixel `v0.1.0-beta.1` is a release-readiness beta. The editor feature set is in place; current work prioritizes file safety, export correctness, native packaging, compatibility, and real workflow testing over adding more tools.

---

<div align="center">
<sub>Built for the Sindri engine · local-first · pixels first.</sub>
</div>
