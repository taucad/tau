# libassimp Logo

Parametric 2D brandmark for [libassimp](https://github.com/taucad/libassimp),
Assimp for TypeScript and WebAssembly. A hexagonal aperture: the opening is a
regular hexagon, and each of its edges, extended outward, becomes the slit
between two blades, exactly as a camera iris is built. Six blades admit every
format through one opening; the gold core inside is the one scene that comes
out.

Nothing is drawn by hand. `main.ts` is the source of truth for the gallery
render and for every generated repository asset.

## Part Census

| Region | Count | Construction                                                                   |
| ------ | ----: | ------------------------------------------------------------------------------ |
| Blades |     6 | Rim ∩ wedge between two consecutive edge lines, minus opening, minus two slits |
| Core   |     1 | The opening hexagon inset by the core gap                                      |

Seven filled paths. There are no BRep parts, interfaces, or GeoSpec selectors.

## Construction Datums

| Datum                   | Value                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Brand coordinate system | `512 × 512` SVG view box, shared with the Tau logo            |
| Rim                     | Hexagon, circumradius `236`, flat top: a ~6% safe area        |
| Opening                 | Hexagon, circumradius `88`, same orientation                  |
| Slit                    | `18` wide, on the interior side of each extended opening edge |
| Twist                   | `60°` from radial, fixed by the hexagon; not a free parameter |
| Core                    | Opening inset `16` (measured across the flats)                |
| Light                   | `(−0.45, 0.60, 0.66)`, three-quarter key                      |

`blades`, `opening`, `slitWidth` and `coreGap` are runtime parameters. Eight
blades give an octagonal iris with a shallower `135°` twist; a larger opening
thins the blades and grows the core.

## Shading

The mark carries no ground of its own and must hold on both a white page and
a black one. Each blade is treated as a hinged flat facet; its exposure to
the key light orders the blades, and the ranks are spaced evenly along a
seven-stop warm ramp. Ranking rather than sampling guarantees no two blades
share a tone, which a clamped Lambert sample cannot.

| Stop    | Colour    | Use                                  |
| ------- | --------- | ------------------------------------ |
| Oxblood | `#7a220c` | Blade furthest from the light        |
| Ember   | `#a32f0c` | Blade                                |
| Rust    | `#c93e0b` | Blade                                |
| Flame   | `#ea520a` | Blade                                |
| Orange  | `#ff6f12` | Blade                                |
| Amber   | `#ff9a2e` | Blade nearest the light; banner rule |
| Gold    | `#ffc53d` | Core only                            |
| Cream   | `#fff0c2` | Reserved for banner highlights       |

## Verification

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/libassimp-logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/libassimp-logo/generate-logo.ts --check
pnpm exec tsx libs/tau-examples/scripts/generate-thumbnails.mts --only=replicad/libassimp-logo
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; the
generated-asset check and thumbnail drift gate cover this example instead.

## Render Packet

- `libassimp.svg` — canonical transparent square mark, shipped verbatim as
  the repository logo and SVG favicon.
- `banner.svg` — wide README lockup: the same mark, the outlined Geist Bold
  wordmark and an amber rule on a dark ground.
- `wordmark.ts` — the name as committed outlines, converted to paths by
  Replicad's text support, so the banner renders identically on GitHub.
- `thumbnail.webp` — Tau examples gallery preview.
- `generate-logo.ts --install <checkout>` — writes the pack into a libassimp
  checkout: `images/{logo,banner}.svg`, `docs-site/public/{logo,favicon}.svg`,
  a PNG-in-ICO favicon at 16/32/48 and an opaque 180 px Apple touch icon.

## Benchmark Prompt

> Draw a camera iris as a parametric 2D Replicad drawing in a 512 by 512
> coordinate system: a flat-topped hexagonal rim of radius 236 around a
> hexagonal opening of radius 88. Extend each edge of the opening outward
> past its end vertex to cut an 18-unit slit, keeping the slit on the
> opening's interior side of the edge line, so six blades remain between
> consecutive slits. Inset the opening by 16 for a gold core. Rank the
> blades by a hinged facet's exposure to a three-quarter key light and
> space them evenly along a warm ramp from oxblood to amber. Return only the
> 2D drawing and export it as SVG.
