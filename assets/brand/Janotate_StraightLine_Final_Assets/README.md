# Janotate — straight-line approved brand assets

This package uses the **approved straight-edged, faceted Janus icon**, with two outward-looking profiles, a central arch, and a speech bubble containing the code symbol. The purple-to-cyan gradients are preserved.

## Canonical source

- `masters/approved-app-icon.png` — **PRIMARY APPROVED IMAGE**. Exact original raster image, unmodified.
- `masters/latest-app-icon-variant.png` — newer render of the same sharp-edged concept; an alternate, not the primary source of truth.
- `masters/transparent-color-emblem.png` — transparent-background emblem, useful for overlays.
- `masters/horizontal-wordmark.png` — latest wordmark treatment. Original transparent PNG.
- `masters/monochrome-deep-navy-emblem.png` — very dark single-color emblem; use on **light backgrounds only**.

## Production exports

- `app-icons/` — resized raster icons (16–1024 px), Apple touch icon, Android icons, and `favicon.ico`.
- `logos/` — transparent emblem exports and background-safe logo variants.
- `social/` — Open Graph artwork (1200×630).
- `developer/` — CSS/JSON palette, PWA manifest.
- `previews/` — visual asset overview.

## Important implementation notes

- These are **raster PNG masters**, even though the artwork looks vector-like. They are not editable SVG paths; no vector conversion is claimed. Do not take SVGs from the previous Janotate bundle, which followed a rejected visual direction.
- Preserve both outward-facing heads, the faceted hard-edged outlines, purple/blue/cyan color split, central gateway, and the centered code-in-chat bubble.
- **Do not add a separate checkmark or separate code glyph outside the bubble**; the code glyph is already inside the bubble.
- If UI needs smaller/lighter marks, derive those only from approved assets, and verify at target size rather than redesigning the faces.
- The approved app icon has a dark background and border integrated into the image; do not automatically remove its dark pixels when exporting.
- `developer/tokens.css` values are convenient references and are not the exact per-pixel gradient recipe from the original image generation.
- Icons in `developer/site.webmanifest` assume you copy the Android files into `/icons/`.

## File integrity

`ASSET_MANIFEST.json` includes SHA-256 checksums, image sizes, alpha-channel information, and original image provenance.
