# @taucad/spatial

Dependency-free coordinate and render-frame contracts for CAD, scientific viewers, and render adapters.

The package separates persistent physical truth from a viewport's derived GPU representation:

- coordinate conventions describe axis orientation and physical unit scale;
- render frames choose a nearby physical origin and metres-per-render-unit scale;
- reversible point, bounds, and plane conversions keep interaction results physical.

```ts
import { resolveMetersPerRenderUnit, toRenderPoint } from '@taucad/spatial';

const renderFrame = {
  anchorFrameId: 'tau:root',
  originMeters: [0, 0, 0],
  metersPerRenderUnit: resolveMetersPerRenderUnit({ characteristicLengthMeters: 20e-9 }),
};
const renderPoint = toRenderPoint({ renderFrame, point: [8e-9, 0, 0] });
```

All physical translations and lengths are metres. `RenderFrame` is per viewport, ephemeral, and must not be persisted as project truth. Native Three.js types belong in `@taucad/three/spatial`; display-unit parsing belongs in `@taucad/units`; camera projection belongs in `@taucad/camera`.

Runtime support: Node.js 24 or newer and modern browsers. The package has no runtime dependencies and is Apache-2.0 licensed.
