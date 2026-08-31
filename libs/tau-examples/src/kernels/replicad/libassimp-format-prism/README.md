# libassimp Fold Stack Logo

Parametric 2D brandmark for [libassimp](https://github.com/taucad/libassimp),
the Assimp WebAssembly package. Four format strata occupy the left face of an
isometric scene cube. At the fold they resolve into one unified right face:
many model formats in, one normalized Assimp scene out.

Nothing is drawn twice. `main.ts` is the source of truth for both the gallery
render and the generated repository assets.

## Construction

| Region          | Count | Construction                                |
| --------------- | ----: | ------------------------------------------- |
| Format strata   |     4 | Parallel quadrilaterals clipped to the left |
| Top fold        |     2 | Triangles meeting at the scene-cube centre  |
| Unified scene   |     2 | One right face plus its lower depth facet   |
| Inter-band gaps |     1 | The exposed ember-coloured left-face ground |

The `512 × 512` coordinate system leaves a compact safe area around the cube.
All vertices derive from the seven cube datums; the strata interpolate along
the left and centre edges, so their spacing cannot drift independently.

## Palette

| Role            | Colour    |
| --------------- | --------- |
| Cream highlight | `#fff0c2` |
| Gold            | `#ffc53d` |
| Orange          | `#ff6b00` |
| Flame           | `#f0440a` |
| Ember gaps      | `#9f2d0b` |
| Banner ground   | `#24130d` |

## Verification

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/libassimp-format-prism/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/libassimp-format-prism/generate-logo.ts --check
pnpm exec tsx libs/tau-examples/scripts/generate-thumbnails.mts --only=replicad/libassimp-format-prism
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; the
generated-asset check and thumbnail drift gate cover this example instead.

## Render Packet

- `libassimp.svg` — canonical transparent square mark, copied to the package
  repository as its logo and SVG favicon.
- `banner.svg` — wide README lockup with the same mark, outlined Geist Bold
  wordmark, and orange rule on a dark ground.
- `wordmark.ts` — committed outlines so the banner renders identically on
  GitHub without depending on an installed font.
- `thumbnail.webp` — Tau examples gallery preview.

## Favicon-First Explorations

`variants/` holds four punchier Fold Stack directions, each generated from
`variants.ts` and reviewed in both large-mark and 24 px nav contexts:

1. **Full-Bleed Stack** — tighter crop and three broader strata.
2. **Ember Spine** — a dark central fold with hotter face contrast.
3. **Signal Ribbon** — one oversized band wrapping the fold.
4. **Foundry Frame** — a heavy outer keyline for small-size definition.

Regenerate them with:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/libassimp-format-prism/generate-variants.ts
```
