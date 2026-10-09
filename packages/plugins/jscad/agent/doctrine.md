## Workflow

1. Author `main.ts` with ES module imports from `@jscad/modeling`, exported `defaultParams`, and a default `main(params)` returning geometry.
2. Compose holes, slots, ears, sockets, and teeth in a 2D profile, then call `extrudeLinear` once.
3. Choose segment counts deliberately because curves become mesh evidence.
4. Name every returned part, and keep each standalone test target renderable through its own default `main`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; the entry point owns assembly.

## Kernel rules

- Prefer `circle`, `cylinder`, and `extrudeRotate` with roughly `max(16, Math.PI * diameter / 0.3)` segments over manual point loops.
- Prefer `extrudeRotate` or `extrudeLinear` when the profile has a regular form.
- Avoid 3D mesh CSG between overlapping, touching, or contained primitives when the equivalent 2D profile operation exists; the preview can hide a non-manifold `geom3`.
- Attach a stable name, for example with `Object.assign(shape, { name })`.
- When returning multiple shapes, return one flat array of named geometries; never nest arrays or wrap them in a result object.

## Canonical pattern

```ts
import { booleans, extrusions, primitives, type geometries } from '@jscad/modeling';

export const defaultParams = { radius: 18, holeRadius: 5, height: 6, segments: 48 };

export default function main(p = defaultParams): geometries.geom3.Geom3 {
  const profile = booleans.subtract(
    primitives.circle({ radius: p.radius, segments: p.segments }),
    primitives.circle({ radius: p.holeRadius, segments: 32 }),
  );
  return Object.assign(extrusions.extrudeLinear({ height: p.height }, profile), { name: 'Plate' });
}
```

Check import paths, vector shapes, invalid dimensions, failed booleans, and segment proliferation first.

## Wrong / Correct

- Wrong: `primitives.cylinder(10, 5)`. Correct: every primitive takes one options object: `primitives.cylinder({ height: 10, radius: 5, segments: 48 })`.
- Wrong: `transforms.translate(shape, [x, y, z])`. Correct: options or vector first, geometry last: `transforms.translate([x, y, z], shape)`, `extrusions.extrudeLinear({ height }, profile)`.
