# geospec

GeoSpec is a CAD geometry testing library with one host-independent authoring API:
`loadModel` from `geospec/model` and `expectGeo` from `geospec`.

This package is the **matcher-API substrate** (Apache-2.0): the authoring DSL,
the selector language, the diagnostics and evidence schemas, the matcher
registry, and host integration. It executes no geometry on its own: every claim
is evaluated by the compiled
[`@taucad/geospec-engine-native`](../geospec-engine-native/README.md) core that
the host passes to the runner. Tau's desktop/browser composition and the
[`geospec` CLI](../geospec-engine/README.md) supply that engine. Authored tests
do not import or select an engine, and nothing registers one globally.

The following is a `*.geospec.ts` module for the CLI or Tau `test_model`:

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

    expectGeo(model).toHaveBoundingBox({ size: { x: 40, y: 20, z: 8 }, tolerance: 0.1 });
    expectGeo(model).toHaveSurfaceArea({ value: 2560, tolerance: 10 });
    expectGeo(model).toHaveVolume({ value: 6400, tolerance: 10 });
  });
});
```

## Running specs

### Subjects and host lifetime

Await `loadModel`, then make synchronous `expectGeo` assertions. Its
`GeoSpecSubject` is opaque: do not read mesh fields, forge a subject hash, or
reuse a subject after its owning loader/run is disposed. The host retains the
source and parameter identity and owns geometry admission, reuse and release.

Standalone and Vitest hosts supply a managed loader through `createModelLoader`
and the existing host integration; `geospec/vitest` supplies the framework
adapter. Vitest's `describe`/`it` come from Vitest, while the helpers imported
from `geospec` above belong to GeoSpec's VM runner. Ordinary assertions remain
`expectGeo`; the optional Vitest `expect` extension has its own asynchronous
settlement contract. See the [host binding documentation](../geospec-engine-native/README.md).

Python uses `load_model`/`expect_geo` from `geospec`, with the wheel's pytest
plugin scope or a standalone `GeoSpecEngine` context. Tau `test_model` discovers
TypeScript/JavaScript tests, not Python files.

Read `runStatus`, complete accounting, discovery and source-lineage status when
interpreting a run. Unsupported, inconclusive, skipped and not-run requirements
are not passes. Compact `test_model` output can omit details; its retained
`fullResult` remains the complete result. An empty failures list alone is not
qualification, and filtered requirements remain outside the demonstrated scope.

### Runner configuration

Install [`@taucad/geospec-engine`](../geospec-engine) for its `geospec` CLI or
Node worker pool. To embed a serial runner, pass a compiled engine to
`createNativeGeoSpecRunner` from `geospec/runner/native`; it builds the native
model loader and releases every admitted subject after each run. These use the
same compiled composition. Other embeddings must qualify their actual binding,
input representation and supported domain; shared authoring syntax alone does
not establish verdict equivalence. The CLI's flags and pool options are
documented in that package's README.

The filters below are the shared vocabulary of the CLI, the embedded runners
and the Tau `test_model` tool:

- `files`: GeoSpec files or directory roots to run. Empty input recursively discovers from the project root.
- `include`: GeoSpec file include globs, defaulting to `["**/*.geospec.{ts,js}"]`
- `exclude`: GeoSpec file exclude globs
- `testNamePattern`: JavaScript regular expression matched against full `suite > test` names
- `testTimeout`: async test timeout in milliseconds

The host uses Tau runtime exports or already-exported GLB/glTF/STEP bytes. Authored tests use `loadModel` for both code and direct geometry inputs; low-level parsing/host APIs are not an alternate authored-test dialect.

Load failures carry structured diagnostics. Assertion reports retain the selected claim, evidence, provenance and diagnostics; inspect those reports rather than expecting mutable evidence fields on the opaque subject.

Keep each test readable with its own `loadModel()` call. Each load captures current source/parameter identity; hosts may reuse admitted computations only under matching identities. Do not assume a filename alone permits cross-file memoization:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('assembly', () => {
  it('has no global part interference', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.1 });
  });

  it('keeps the ring and planet free of interference', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: 0.05,
      pairs: [{ left: /ring/i, right: /planet gear/i }],
    });
  });
});
```

Production assembly suites can combine mesh-integrity, occurrence, spatial
relationship, and exact BRep assertions without adding domain-specific
matchers for each mechanical subsystem:

```ts
expectGeo(model).toHaveMeshIntegrity({
  finitePositions: true,
  degenerateTriangles: { count: 0 },
  duplicateFaces: { count: 0 },
});

expectGeo(model).toHaveAssemblyOccurrences({
  uniqueNames: true,
  occurrences: [
    { name: 'Housing', count: 1 },
    { name: /^Fastener \d+$/, count: 8 },
  ],
});

expectGeo(model).toHaveSpatialRelationships({
  relationships: [
    { id: 'shaft seats in bearing', kind: 'contact', subject: 'Shaft', target: 'Bearing', tolerance: 0.05 },
    { id: 'pin remains inside yoke', kind: 'containment', subject: 'Pin', target: 'Yoke', tolerance: 0.05 },
  ],
});
```

Choose selectors supported by the admitted source. A qualified mesh `body`
selector identifies one material root with its cavity boundaries; disconnected
roots and islands inside cavities remain separate Bodies. Its `of` scope
matches the exact retained primitive label, including any ordinal suffix.
Inspect that label and preserve cardinality instead of guessing an occurrence
path. Mesh input does not invent assembly ancestry or analytic faces; missing
measure, probe or ordering evidence refuses, even through query negation.
The STEP Body index currently exposes per-occurrence solid aggregates, so do
not assume its Body count maps one-to-one to mesh material roots.

Whole-Body contact requires no interior overlap and boundary separation within
the declared inclusive tolerance. It does not establish a contact area or seal;
finite-face angular requirements need their actual analytic evidence.

Load STEP through the same authoring API:

```ts
import { loadModel } from 'geospec/model';

const subject = await loadModel({ file: 'part.step', format: 'step' });
```

For CAD source, `loadModel({ file: 'main.ts', format: 'step' })` asks the host to export STEP. The configured compiled engine admits the exact returned bytes through its OCCT binding. Export and source provenance do not by themselves certify a geometric requirement.

Measurement matchers currently support mesh evidence and prefer exact BRep evidence when it is present:

```ts
expectGeo(subject).toHaveSurfaceArea({ value: 12_345, tolerance: 1 });
expectGeo(subject).toHaveVolume({ value: 120_000, tolerance: 10 });
expectGeo(subject).toHaveMass({ value: 94.2, density: 0.000_785, tolerance: 0.5 });
expectGeo(subject).toHaveCenterOfMass({ point: { x: 0, y: 0, z: 10 }, tolerance: 0.05 });
```

Initial BRep feature matchers are available when a loader provides BRep evidence:

```ts
import { loadModel } from 'geospec/model';

const subject = await loadModel({ file: 'main.ts', format: 'step' });

expectGeo(subject).toBeValidBrep({ maxTolerance: 0.01, closedShells: true });
expectGeo(subject).toHavePlanarFace({ normal: { x: 0, y: 0, z: 1 }, offset: 20, tolerance: 0.05 });
expectGeo(subject).toHaveCylindricalFace({ radius: 15, axis: 'z', tolerance: 0.05 });
expectGeo(subject).toHaveCircularHole({ diameter: 8, through: true, axis: 'z', center: { x: 25, y: 15 } });
expectGeo(subject).toHaveChamferFeature({ distance: 2, selection: 'outer top perimeter', tolerance: 0.05 });
expectGeo(subject).toHaveMinimumWallThickness({ value: { greaterThanOrEqual: 2 }, tolerance: 0.05 });
expectGeo(subject).toHaveVoidContinuity({
  path: [{ occurrence: 'Throttle Body 1' }, { occurrence: 'Cylinder Head R' }],
  material: ['Throttle Body 1', 'Intake Manifold 1', 'Cylinder Head R'],
  minCrossSection: 900,
  isolatedFrom: [[120, 0, 40]],
});
```

These are requirement examples, not a claim that every admitted model supports
them. `toHaveVoidContinuity` requires the declared path, material and isolation
proposition to be proved in a qualified domain. A sampled cross-section cannot
certify a continuous minimum: the general sampled profile refuses a requested
`minCrossSection`. Restricted nominal analytic domains have separate premises;
general mesh lumen, wall and motion qualification remains incomplete.

Likewise, watertight edge incidence does not prove manifold validity, a Boolean
fuse or material connectivity. Bounds and playback cannot certify contact,
clearance, containment or sealing. Preserve intended geometry and tolerances;
report unavailable evidence instead of replacing the requirement with a proxy.

The [canonical API index](agent/geospec-authoring/api-index.md) describes
ordinary authoring. The separate
[complete public API index](agent/geospec-authoring/public-api-index.md)
retains host and framework contracts. A low-level
`GeometrySubject` input is not interchangeable with the opaque subject returned
by canonical `loadModel`.

When a geometry assertion needs a parameter variant, pass that variant directly to `loadModel`. Omitting `parameters` exercises the defaults authored by the model:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('parameter variants', () => {
  it('uses the model defaults', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 40 }, tolerance: 1 });
  });

  it('accepts an explicit width', async () => {
    const width = 80;
    const model = await loadModel({
      file: 'main.ts',
      parameters: { width },
    });

    expectGeo(model).toHaveBoundingBox({ size: { x: width }, tolerance: 1 });
  });
});
```

## License

**Apache-2.0.** This package is the permissive perimeter: your specs, your
models and your verdicts do not inherit this package's license. See
[LICENSING.md](../../LICENSING.md) at the repository root for the routing map
and the internal-use FAQ.
