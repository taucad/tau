# @taucad/testing

Geometry analysis, grading, and Tau-specific GeoSpec utilities for `@taucad` packages.

## Tau GeoSpec Helpers

Tau parameter files stay in their existing `.tau/parameters/<entry>.json` location. GeoSpec tests import them as real JSON modules through project `package.json#imports`:

```json
{
  "type": "module",
  "imports": {
    "#params/*.json": "./.tau/parameters/*.json"
  }
}
```

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel, parameterGroups } from 'geospec/model';
import mainParams from '#params/main.ts.json' with { type: 'json' };

const groups = parameterGroups(mainParams, { defaults: defaultParams });

describe('main parameter variants', () => {
  for (const group of groups) {
    it(`should render ${group.name}`, async () => {
      const model = await loadModel({
        file: 'main.ts',
        parameters: group.values,
        parameterSource: group,
      });

      expectGeo(model).toHaveBoundingBox({
        size: { x: group.values.base.width },
        tolerance: 1,
      });
    });
  }
});
```

Use `params(...)`, `activeParams(...)`, and `parameterGroups(...)` from `geospec/model` to merge stored group overrides with source defaults and preserve parameter provenance for diagnostics. `@taucad/testing/tau` remains a runner compatibility adapter, not the recommended authoring import.
