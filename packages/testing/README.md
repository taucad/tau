# @taucad/testing

Geometry analysis, grading, and Tau-specific GeoSpec utilities for `@taucad` packages.

## Tau GeoSpec Adapter

GeoSpec tests use the model's authored defaults when `parameters` is omitted. Tests that need a variant pass it directly to `loadModel`:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main parameter variants', () => {
  it('uses the model defaults', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 40 }, tolerance: 1 });
  });

  it('accepts explicit parameters', async () => {
    const width = 80;
    const model = await loadModel({
      file: 'main.ts',
      parameters: { width },
    });

    expectGeo(model).toHaveBoundingBox({ size: { x: width }, tolerance: 1 });
  });
});
```

`@taucad/testing/tau` forwards those direct parameters to Tau's renderer and preserves them in geometry provenance. It remains a runner compatibility adapter, not the recommended authoring import.
