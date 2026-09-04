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
- Every icon is path data. The `pngIcons` `<image>` fallback that once carried
  `manifold.png` is gone, along with the raster: the Manifold mark is now
  generated as an SVG from the model itself, in
  `libs/tau-examples/src/kernels/manifold/manifold-logo`.

## Attribution

- `kimi.svg` is sourced from Lobe Icons' `kimi-color.svg` at commit
  `fbd2d56e3f734e889f1373e71c8368cc4e60e0d7`, licensed under MIT (Copyright 2023 LobeHub).
- `build123d.svg` is sourced from build123d's `docs/assets/build123d_logo/logo.svg` at
  commit `0f0e021b602e14347cb07d8aad051db0a345650b`, licensed under Apache-2.0 (Copyright Roger Maitland).
- `csharp.svg` is sourced from [Simple Icons](https://simpleicons.org/)' `csharp.svg`
  (vendored at `repos/nx/astro-docs/public/images/icons/csharp.svg`), licensed under
  CC0-1.0, recoloured to the C# brand purple `#68217A`.
- `picogk.svg` is a vector reconstruction of the official PicoGK mark published only as
  raster at <https://picogk.org/images/PicoGK_sm.png> (Copyright LEAP 71). The wordmark is
  typeset from the `Jost` variable font PicoGK itself bundles
  (`repos/PicoGK/assets/Jost.ttf`, SIL OFL 1.1) at `wght 300` with the `GK` pair
  conjoined, and the frame redrawn to match.
- `python.svg` uses the official Python Software Foundation two-snake glyph (vendored at
  `repos/convex-backend/npm-packages/docs/static/img/python-logo.svg`), its gradients
  flattened to the brand's `#FFD43B`/white and set on a `#306998` rounded square so it
  matches the `typescript.svg` / `javascript.svg` treatment. The Python logo is a PSF
  trademark, used here to denote the language.
