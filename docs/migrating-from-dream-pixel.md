# Migrating from Dream Pixel Editor

Sindri Pixel replaces the archived Dream Pixel Editor project. The applications use different project formats: Dream Pixel Editor stores `.dreampixel` documents, while Sindri Pixel uses versioned `.spr` files.

Direct `.dreampixel` import is not available in this beta. Keep the original project file and use this safe migration path:

1. Open the project in Dream Pixel Editor.
2. Export important frames as PNG files and animations as sprite sheets or GIFs.
3. In Sindri Pixel, use **Open sprite** to import a PNG.
4. Recreate frame timing and layers where the flattened export cannot preserve them.
5. Save the result as a new `.spr` project without overwriting the archived source.

PNG import preserves pixel colors and transparency. Flattened images cannot preserve layer names, hidden layers, per-layer opacity, tutorial data, or editing history.

The archived repository remains readable at [vardirhq/dream-pixel-editor](https://github.com/vardirhq/dream-pixel-editor) for users who need to export an older project.

## Planned compatibility work

A future importer should parse a representative set of real `.dreampixel` fixtures, preserve frames and layers where possible, produce a migration report, and never modify the source file. Until that work is covered by compatibility tests, Sindri Pixel will not claim direct project compatibility.
