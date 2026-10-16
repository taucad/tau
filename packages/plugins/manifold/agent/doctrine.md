## Workflow

1. Author `main.ts` with ES module imports from `manifold-3d/manifoldCAD`, exported `defaultParams`, and a default `main(params)` returning a `Manifold` or a flat array of `Manifold`/GLTF nodes.
2. Use positive dimensions and built-in primitives, revolves, and booleans.
3. Choose segment counts deliberately because all curves become mesh geometry.
4. Keep every standalone test target renderable through a default `main` returning geometry.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; keep assembly orchestration in `main.ts`.

## Kernel rules

- For cylinders, spheres, and revolves, start near `max(16, Math.PI * diameter / 0.3)` segments for visible parts; 32 suits small features and 64 large ones.
- Prefer `Manifold.cylinder`, `Manifold.sphere`, and `Manifold.revolve` over manual point loops.
- Combine arrays once with `Manifold.compose` or n-ary boolean methods instead of nested Manifold-of-Manifold construction.
- Do not proliferate segments on small features.

## Canonical pattern

```ts
import { Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = { width: 80, depth: 40, height: 20, holeRadius: 6 };

export default function main(p = defaultParams): Manifold {
  const body = Manifold.cube([p.width, p.depth, p.height], true);
  const hole = Manifold.cylinder(p.height + 2, p.holeRadius, -1, 64, true);
  return body.subtract(Manifold.union([hole.translate([-20, 0, 0]), hole.translate([20, 0, 0])]));
}
```

The kernel adds normals, creased at 30°, unless a material already names `NORMAL`; call `calculateNormals` yourself only to choose a different crease angle.

Check missing imports, undefined returns, invalid boolean inputs, and non-positive dimensions first.

## Tessellation

Views and exports take `options.tessellation` as a quality preset or an explicit object, never both. Pick `low` for a first look, thumbnails or large assemblies, `medium` (the default for `evaluate_model`, `screenshot` and the viewer) for ordinary review, `high` (the export default) for printing and GeoSpec evidence, and `extra-high` only when asked. Presets scale with the model's size, so a 5 mm pin and a 5 m frame cost about the same. The explicit object uses segments, millimetres and degrees and does not scale. Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint yet, so keep it out of model parameters; resolution written into the geometry itself is covered below. Results report the effective `tessellation` (requested form, resolution, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M is refused rather than coarsened.

In Manifold the explicit object is `{ segments?, linearTolerance?, angularTolerance? }`: a fixed circle segment count, the minimum circular edge length and the minimum circular angle. A segment count passed to a primitive is the model's own and stays.

## Wrong / Correct

- Wrong: `Manifold.cylinder(radius, height)`. Correct: height first: `Manifold.cylinder(height, radiusLow, radiusHigh, segments, center)`; pass `-1` for `radiusHigh` to match `radiusLow`.
- Wrong: chaining `a.add(b).add(c)…` over many parts. Correct: `Manifold.union([a, b, c])` once.
- Wrong: capturing a model while `show()` or `only()` is active. Correct: remove them first; debug views render in the viewer only, and screenshots and thumbnails of them fail with "TRIANGLES primitive missing NORMAL".
- Wrong: `.asOriginal()` on a boolean result so GeoSpec reads it as one solid. Correct: return it as it is; GeoSpec already reads a Manifold mesh's runs as one solid.
