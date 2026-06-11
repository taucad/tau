# geospec

GeoSpec is a CAD geometry testing library with Vitest-style authoring APIs.

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

const code = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    return makeBaseBox(40, 20, 8);
  }
`;

describe('bracket', () => {
  it('has expected measurements', async () => {
    const model = await loadModel({
      code: { 'main.ts': code },
      file: 'main.ts',
      format: 'glb',
    });

    expectGeo(model).toHaveBoundingBox({ size: { x: 0.04, y: 0.008, z: 0.02 }, tolerance: 0.001 });
    expectGeo(model).toHaveSurfaceArea({ value: 0.002_56, tolerance: 0.000_1 });
    expectGeo(model).toHaveVolume({ value: 0.000_006_4, tolerance: 0.000_001 });
  });
});
```

Run standalone GeoSpec modules from Node:

```bash
geospec run .
geospec run . --include "parts/**/*.geospec.ts"
geospec run . --exclude "**/*.slow.geospec.ts"
geospec run . --file main.geospec.ts --test-name-pattern volume
geospec run . -t "^(?!.*no meshing interference).*"
geospec run . --file lib
geospec run . --json
```

The CLI and Tau `test_model` tool share the same execution filters:

- `files`: GeoSpec files or directory roots to run (`--file` in the CLI). Empty input recursively discovers from the project root.
- `include`: GeoSpec file include globs (`--include` in the CLI), defaulting to `["**/*.geospec.{ts,js}"]`
- `exclude`: GeoSpec file exclude globs (`--exclude` in the CLI)
- `testNamePattern`: JavaScript regular expression matched against full `suite > test` names
- `testTimeout`: async test timeout in milliseconds (`--test-timeout` in the CLI)

The Tau runtime contract remains file/bytes based: render or export geometry, then pass GLB/glTF or STEP bytes into GeoSpec loaders. `geospec/model` is built on `@taucad/runtime` as a package dependency for CAD-source loading, while direct GLB/glTF and STEP loaders remain usable for already-exported evidence. Tau project tests should use `loadModel` and parameter helpers from `geospec/model`; `@taucad/testing/tau` remains an internal compatibility adapter for Tau runners.

Runtime-originated diagnostics keep their runtime issue codes, such as `GEOMETRY_INVALID`, inside `GeometrySubject.diagnostics`. GeoSpec adds matcher-facing facets and spatial evidence around those diagnostics instead of remapping them into kernel-specific or GeoSpec-only aliases.

When several tests inspect the same file and parameter set, keep each test readable with its own `loadModel()` call. The GeoSpec runner deduplicates identical runtime-backed `loadModel()` calls within one run, including across selected files in one Node CLI invocation, so this style keeps the same warm-path performance without module-level promise plumbing:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('assembly', () => {
  it('has no global part overlap', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoComponentOverlap({ tolerance: 0.1 });
  });

  it('keeps the ring and planet clearance pair clean', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoComponentOverlap({
      tolerance: 0.05,
      pairs: [{ left: /ring/i, right: /planet gear/i }],
    });
  });
});
```

STEP/BRep evidence is imported by GeoSpec's own OpenCascade.js build:

```ts
import { loadStep } from 'geospec/step';

const subject = await loadStep({ source: stepBytes });
```

Replicad can author and export deterministic fixtures through `loadModel({ file: 'main.ts', format: 'step' })` or inline `loadModel({ code, file: 'main.ts', format: 'step' })`. Tau runtime infers the kernel from the source file and imports; GeoSpec does not use Replicad's STEP importer. STEP bytes are read by `GeoSpecStepStreamReader`, which records native-stream or filesystem-fallback provenance and produces GeoSpec-owned BRep and mesh evidence.

Measurement matchers currently support mesh evidence and prefer exact BRep evidence when it is present:

```ts
expectGeo(subject).toHaveSurfaceArea({ value: 12_345, tolerance: 1 });
expectGeo(subject).toHaveVolume({ value: 120_000, tolerance: 10 });
expectGeo(subject).toHaveMass({ value: 94.2, density: 0.000_785, tolerance: 0.5 });
expectGeo(subject).toHaveCenterOfMass({ point: { x: 0, y: 0, z: 10 }, tolerance: 0.05 });
expectGeo(actual).toHaveChamferDistanceTo(expected, {
  mean: { lessThan: 0.02 },
  max: { lessThan: 0.2 },
  p95: { lessThan: 0.08 },
  samples: 100_000,
});
```

Initial BRep feature matchers are available when a loader provides BRep evidence:

```ts
import { loadModel } from 'geospec/model';

const subject = await loadModel({ file: 'main.ts', format: 'step' });

expectGeo(subject).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 20, tolerance: 0.05 });
expectGeo(subject).toHaveCylindricalFace({ radius: 15, axis: 'z', tolerance: 0.05 });
expectGeo(subject).toHaveCircularHole({ diameter: 8, through: true, axis: 'z', center: { x: 25, y: 15 } });
expectGeo(subject).toHaveChamferFeature({ distance: 2, selection: 'outer top perimeter', tolerance: 0.05 });
expectGeo(subject).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 2 }, tolerance: 0.05 });
```

Large sampled mesh-distance checks use GeoSpec's canonical native/WASM mesh
backend. The root import remains lazy; callers that need explicit lifecycle
control can mount the backend through `geospec/mesh` with an initialized WASM
module.

```ts
import { createOpenCascadeMeshBackend } from 'geospec/mesh';
import initOpenCascade from 'geospec/native/opencascade/single';

const oc = await initOpenCascade();
const backend = createOpenCascadeMeshBackend(oc);
```

The custom C++ wrapper and Docker build config live in
`native/opencascade/`. GeoSpec does not run a production JavaScript
triangle-distance fallback; native backend failures are returned as structured
diagnostics.

Tau projects import existing parameter files as real JSON modules through project `package.json#imports`:

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

describe('parameter variants', () => {
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
