# geospec

GeoSpec is a CAD geometry testing library with Vitest-style authoring APIs.

This package is the **matcher-API substrate** (Apache-2.0): the authoring DSL,
the selector language, the diagnostics and evidence schemas, the matcher
registry, and the executor seam. It executes no geometry on its own. Install
[`@taucad/geospec-engine`](../geospec-engine) and import
`@taucad/geospec-engine/register` once at startup to supply the engine — it
also ships the `geospec` CLI. Without a registered engine every engine-backed
entry point answers with a `GEOSPEC_ENGINE_UNAVAILABLE` diagnostic rather than
crashing.

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

### Lightweight subjects and explicit measurements

Loaded subjects expose only mesh counts (`vertexCount`, `meshCount`, `triangleCount`),
provenance, capabilities, and diagnostics. Matchers resolve the retained engine
evidence and compute only the facets they need. For programmatic measurements,
use the existing `analyzeMesh()` operation:

```ts
import { loadModel } from 'geospec/model';
import { analyzeMesh } from 'geospec/mesh';

const subject = await loadModel({ file: 'main.ts' });
const analysis = await analyzeMesh({ subject });
if (!analysis.success) {
  throw new Error(analysis.diagnostics.map(({ message }) => message).join('\n'));
}
const { boundingBox, meshQuality, watertight } = analysis.stats;
```

This replaces removed reads such as `subject.mesh.stats.boundingBox`: the
counts-only summary is a **breaking public API change**. Source input
`analyzeMesh({ source, ... })` remains supported. Source and subject inputs are
mutually exclusive; a retained subject cannot receive unit or format overrides.

Subject analysis does not export or parse again. It uses the original subject
unit/frame and requires that subject to remain alive in the same engine.
Repeated requests reuse computations but return independent, JSON-safe snapshots;
mutating a snapshot cannot change matcher verdicts. A snapshot remains readable
after release, but further operations on its released handle fail. Non-finite
full measurements produce structured failures, never successful NaN-to-null data.
The engine must advertise the `analyzeMesh` capability; unsupported hosts do not
silently reload source. Authored specs can import it from `geospec/mesh` too.

`test_model` still reports matcher failures, not every explicit analysis result.
All diagnostics emitted by executed assertions and structured load failures are
preserved, including spatial details. Assertion fail-fast behavior is unchanged.
Runtime warnings remain on the subject; use `toHaveNoDiagnostics()` to reject them.

### Runner configuration

Execution lives in the engine. Install
[`@taucad/geospec-engine`](../geospec-engine) and either run its `geospec` CLI
or embed one of its runners — **both take the same path**, so a verdict never
depends on how the spec was invoked. The CLI's flags, the worker pool and the
runner factories are documented in that package's README.

The filters below are the shared vocabulary of the CLI, the embedded runners
and the Tau `test_model` tool:

- `files`: GeoSpec files or directory roots to run. Empty input recursively discovers from the project root.
- `include`: GeoSpec file include globs, defaulting to `["**/*.geospec.{ts,js}"]`
- `exclude`: GeoSpec file exclude globs
- `testNamePattern`: JavaScript regular expression matched against full `suite > test` names
- `testTimeout`: async test timeout in milliseconds

The Tau runtime contract remains file/bytes based: render or export geometry, then pass GLB/glTF or STEP bytes into GeoSpec loaders. `geospec/model` is built on `@taucad/runtime` as a package dependency for CAD-source loading, while direct GLB/glTF and STEP loaders remain usable for already-exported evidence. Tau project tests should use `loadModel` from `geospec/model`.

Runtime-originated diagnostics keep their runtime issue codes, such as `GEOMETRY_INVALID`, inside `GeometrySubject.diagnostics`. GeoSpec adds matcher-facing facets and spatial evidence around those diagnostics instead of remapping them into kernel-specific or GeoSpec-only aliases.

When several tests inspect the same file and parameter set, keep each test readable with its own `loadModel()` call. The GeoSpec runner deduplicates identical runtime-backed `loadModel()` calls within one run, including across selected files in one Node CLI invocation, so this style keeps the same warm-path performance without module-level promise plumbing:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('assembly', () => {
  it('has no global part interference', async () => {
    const model = await loadModel({ file: 'main.ts' });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.1 });
  });

  it('keeps the ring and planet clearance pair clean', async () => {
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

`toHaveVoidContinuity` proves negative-space topology: the declared `path`
waypoints must share one connected open void (outside every `material` solid),
that void must not reach any `isolatedFrom` point, and its tightest sampled
cross-section must meet `minCrossSection`. The canonical proof uses Manifold
Boolean shells, generalized winding-number body identity, and deterministic
topological cross-sections. Its region padding, tessellation deflection, and
section spacing are versioned engine constants rather than author options.

Advanced tests that need raw selector/fact evidence can use the explicit
inspection subpath:

```ts
import { inspectGeometry } from 'geospec/inspection';

const inspection = inspectGeometry({
  subject: model,
  selectors: [{ kind: 'occurrence', name: /^Fastener \d+$/ }],
});
```

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
models and your verdicts carry no obligation from it, and neither does the
fair-source engine that executes them. See
[LICENSING.md](../../LICENSING.md) at the repository root for the routing map
and the internal-use FAQ.
