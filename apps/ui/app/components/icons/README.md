# SVG Icons

SVG icons are packed into a single sprite (`generated/sprite.svg`) and inlined once
at the app shell via `<SvgSpriteMount />` (mounted in
[`apps/ui/app/root.tsx`](../../root.tsx)). Every `<SvgIcon id="...">` then renders
a same-document `<use href="#id">` reference, so all browsers — including Safari —
correctly materialise the symbol's `<filter>`, `<mask>`, and `<linearGradient>`
definitions.

The previous external `<use href="sprite.svg#id">` form silently dropped those
`<defs>` in WebKit, breaking icons such as `opencascadejs`, `meta`, `autodesk`,
and `cursor`. See [`docs/research/safari-svg-rendering-compatibility.md`](../../../../../docs/research/safari-svg-rendering-compatibility.md)
for the root-cause analysis.

## Usage

`<SvgIcon>` renders the icon by id; all SVG props are forwarded to the wrapper
`<svg>` element.

```tsx
<SvgIcon id='kcl' />
```

## Raw Icons

The `raw/` directory contains the source SVG icons. Add an SVG file there and it
will be picked up by the SVG sprite generator, with the filename becoming the icon
id used by `<SvgIcon id="iconName" />`.

## Generated Icons

The `generated/` directory contains the build output of the sprite generator
(`sprite.svg` + `svg-icons.d.ts`). DO NOT edit these files directly.

These files are checked into source control. Refresh them after editing or adding
a raw icon, then commit the regenerated artefacts:

```bash
pnpm nx run ui:generate-svg-sprite
```

## Notes

- The sprite is inlined into the SSR HTML, so its raw size matters. Keep
  `sprite.svg` below ~125 KB (compressed in transit, but uncompressed in the
  initial document). If it grows further, split icons into multiple sprites or
  move large/rare icons to lazy-loaded React components.
- For raster brand assets (e.g. `manifold.png`), `<SvgIcon>` already supports a
  PNG fallback via the `pngIcons` map — use it when an asset cannot be expressed
  cleanly as path data.

## Attribution

- `kimi.svg` is sourced from Lobe Icons' `kimi-color.svg` at commit
  `fbd2d56e3f734e889f1373e71c8368cc4e60e0d7`, licensed under MIT (Copyright 2023 LobeHub),
  with a Tau-specific rounded black background.
