# nanoraster Logo

Parametric 2D brandmark for [nanoraster](https://github.com/taucad/nanoraster), the headless WebGPU GLTF renderer. A sphere — the canonical render-test subject — resolved the way a rasteriser resolves it: one scanline at a time. Each row spans the sphere's chord at its own height, so the curve of the silhouette is described entirely by the changing length of straight lines.

The shading is the library's own model rather than a stand-in: glTF metallic-roughness, evaluated per bar. A specular lobe is a two-dimensional feature and a flat fill can only vary with height, so every bar carries a gradient sampled across its own chord.

Nothing is drawn by hand. Every bar's length comes from the circle equation and every bar's tone from the BRDF — the same division of labour the library itself runs.

## Part Census

| Region    | Count | Construction                                      |
| --------- | ----: | ------------------------------------------------- |
| Scanlines |    13 | One rectangle per row, chord-length × pitch − gap |

13 filled paths, one per drawing. The bars are emitted top to bottom, the order a rasteriser would write them. There are no BRep parts, interfaces, or GeoSpec selectors.

## Construction Datums

| Datum                   | Value                                                     |
| ----------------------- | --------------------------------------------------------- |
| Brand coordinate system | `512 × 512` SVG view box, shared with the Tau logo        |
| Sphere                  | Radius `240` about the box centre, a ~6% safe area        |
| Rows                    | `13` — the mark's entire rhythm is this number            |
| Pitch                   | `2 × radius / rows`, so the stack always spans the sphere |
| Bar height              | `pitch − gap`, with `gap` defaulting to `7`               |
| Chord                   | `2 × radius × √(1 − dy²)` at each row's midpoint          |
| Gradient stops          | `11` samples across each chord                            |
| Light                   | `(−0.45, −0.60, 0.66)`, three-quarter key                 |

Because pitch is derived from the row count, changing `rows` re-spaces the whole mark without moving the silhouette, and `gap` opens or closes the scanlines without changing where they sit.

## Shading

The mark carries no ground of its own, so it takes the colour of whatever it is placed on and needs to hold its silhouette on both. That constrains the lighting: the environment's floor carries real bounce rather than falling to black, because a near-black bottom row would disappear against a dark page and cost the sphere its lowest scanlines.

Every colour in the mark is the output of one evaluation of the glTF metallic-roughness BRDF, so the palette is a material rather than a list of swatches.

| Term         | Model                                                               |
| ------------ | ------------------------------------------------------------------- |
| Distribution | GGX / Trowbridge-Reitz                                              |
| Visibility   | Smith, Schlick-GGX form                                             |
| Fresnel      | Schlick — `4%` head-on, rising to `100%` at grazing                 |
| Environment  | Analytic sky-to-floor gradient, sampled along normal and reflection |
| Tone map     | Reinhard, then `2.2` gamma                                          |

| Parameter | Value                       |
| --------- | --------------------------- |
| Base      | `(0.04, 0.66, 0.92)` linear |
| Metallic  | `0` — a dielectric          |
| Roughness | `0.15` — polished           |
| Rule      | `#22d3ee`, banner only      |

A dielectric was chosen over a metal because a metal has no diffuse lobe: its body colour is entirely reflected environment, which reads as grey once the mark is small. The Fresnel term is what brightens both ends of every bar, since a chord's ends sit on the silhouette where the surface turns away from the viewer.

## Verification

Regenerate the SVG artifacts, then check that they have not drifted:

```bash
pnpm exec tsx libs/tau-examples/src/kernels/replicad/nanoraster-logo/generate-logo.ts
pnpm exec tsx libs/tau-examples/src/kernels/replicad/nanoraster-logo/generate-logo.ts --check
pnpm nx check-thumbnails tau-examples
```

GeoSpec currently accepts mesh and BRep evidence, not 2D SVG drawings; the generated-asset check and runtime thumbnail drift gate cover this example instead.

## Benchmark Prompt

> Draw a sphere as a parametric 2D Replicad drawing in a 512 by 512 coordinate system, rasterised into horizontal scanlines. Divide the sphere's vertical extent into thirteen rows and emit one rectangle per row, each spanning the chord the sphere subtends at that height and separated from its neighbours by a constant gap. Shade it with the glTF metallic-roughness model — GGX distribution, Smith visibility, Schlick Fresnel, an analytic sky-to-floor environment, Reinhard tone mapping and 2.2 gamma — as a polished dielectric lit by a three-quarter key. Since a specular lobe varies in two dimensions and a flat fill cannot, give each bar a gradient sampled across its own chord. Return only the 2D drawing and export it as SVG.

## Render Packet

- `nanoraster.svg` - canonical generated vector render, one filled path per scanline, on no ground. Shipped verbatim as the repository's logo and favicon.
- `banner.svg` - wide README lockup: the same scanlines, the wordmark, and a rule. The banner supplies the dark ground its white wordmark needs; the mark itself still carries none.
- `wordmark.ts` - the name as committed outlines, set in Geist Bold and converted to paths by Replicad's own text support. Committed as artwork because the banner has to draw identically on GitHub, where no font can be assumed.
- `thumbnail.webp` - 768 by 576 preview rasterized from the runtime's 2D SVG artifact, which strokes drawings rather than filling them, and verified by the thumbnail drift gate.
