---
title: 'GeoSpec Standalone CAD Testing Library Blueprint'
description: 'Architecture blueprint for GeoSpec, a standalone CAD testing library with custom OpenCascade WASM, C++ mesh analyzers, STEP AP242 evidence, and Tau integration strategy.'
status: draft
created: '2026-06-01'
updated: '2026-06-02'
category: architecture
related:
  - docs/research/geospec-activation-parity-roadmap.md
  - docs/policy/library-api-policy.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/browser-first-parameter-aware-testing.md
  - docs/research/spatial-test-feedback-architecture.md
  - docs/research/mesh-continuity-test-semantics.md
  - docs/research/multi-file-test-json-migration.md
  - docs/research/sysml-v2-spec-architecture-v2.md
  - docs/research/cad-skill-vs-tau-cad-agent-fidelity.md
  - docs/research/brepjs-step-streaming-import.md
  - docs/research/ocjs-wasm-build-comparison.md
  - docs/research/ocjs-adapter-api-blueprint.md
  - docs/research/ocjs-full-build-audit.md
  - docs/research/ocjs-multithreaded-wasm-build.md
  - docs/research/occt-v8-final-migration-stocktake-4.md
  - docs/research/runtime-test-suite-quality-audit.md
---

# GeoSpec Standalone CAD Testing Library Blueprint

## Executive Summary

GeoSpec is the proposed standalone 3D CAD testing library for repeatable geometric, topological, BRep, mesh, assembly, and STEP AP242 verification. The package name is `geospec`, stylized as GeoSpec, and the first repository home is `packages/geospec` inside Tau's monorepo. The package must be designed so it can later live outside Tau with no Tau runtime dependency.

The core architectural decision is to keep both packages for now:

- `geospec` owns standalone geometry loading, exact/approximate analysis, C++/WASM analyzers, Vitest-style matchers, and the Node/browser test runner.
- `@taucad/testing` remains the Tau adapter, legacy compatibility package, agent/tool schema bridge, parameter-aware runtime integration layer, and migration facade over GeoSpec.

Absorbing `@taucad/testing` into GeoSpec immediately would contaminate the standalone package with Tau-specific concerns: chat tool schemas, `test.json` compatibility, runtime rendering contracts, current project file conventions, and LLM prompt affordances. Keeping both lets GeoSpec become a clean public library while Tau can migrate safely.

GeoSpec should use a custom `opencascade.js` single-threaded Docker build as its native engine substrate. It should bind a small set of OCCT symbols and expose purpose-built C++ wrappers for high-volume analysis rather than attempting to perform exacting CAD tests through ad hoc JavaScript loops over triangle buffers. Mesh checks should derive their results from geometry buffers alone. BRep and STEP checks may use OCCT/XDE evidence, but every result must disclose which evidence realm was used.

The first-class API goal is a Vitest-style authoring experience:

```ts
import { describe, expectGeo, it } from 'geospec';
import { loadStep } from 'geospec/step';

describe('flange.step', () => {
  it('preserves the AP242 product definition and bolt pattern', async () => {
    const flange = await loadStep({
      source: './fixtures/flange.step',
      evidence: ['shape', 'xde', 'ap242'],
      units: 'mm',
    });

    await expectGeo(flange).toSatisfyStepAp242({
      schema: 'AP242',
      units: 'mm',
      productName: 'Circular flange',
    });

    await expectGeo(flange).toHaveCircularHolePattern({
      count: 6,
      holeDiameter: 6,
      boltCircleDiameter: 60,
      axis: 'z',
      tolerance: 0.05,
    });
  });
});
```

This document is the planning-phase blueprint. It captures the research findings, eigenquestions, public API inventory, Docker build strategy, runtime requirements, migration strategy, and validation gates needed before implementation.

## Target-State Map Across Testing Research

The related testing research now collapses into one target architecture:

| Research doc                                           | Role in target state               | GeoSpec interpretation                                                                                                                       |
| ------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser-first-parameter-aware-testing.md`             | Parameter-aware, UI-runnable tests | Keep the `*.test.ts` and browser worker insight; implement the runner in GeoSpec and the Tau render bridge in `@taucad/testing`.             |
| `vitest-style-parameter-geometry-testing-blueprint.md` | Vitest-style authoring API         | Supersede the older `@taucad/testing`-only package conclusion; use `geospec/*` for standalone APIs and `@taucad/testing/*` for Tau adapters. |
| `spatial-test-feedback-architecture.md`                | LLM-useful diagnostics             | Promote its structured spatial payloads into GeoSpec `GeometryDiagnostic` and surface them through Tau chat/UI.                              |
| `mesh-continuity-test-semantics.md`                    | Pure-mesh semantics                | Preserve the non-overlapping check vocabulary and pure-geometry rule; implement connected components through spatial welding in GeoSpec.     |
| `multi-file-test-json-migration.md`                    | Per-source ownership               | Preserve source/compilation-unit ownership as GeoSpec loader provenance; use `test.json` only as a migration/compatibility input.            |
| `runtime-test-suite-quality-audit.md`                  | Test quality baseline              | Replace existence-only runtime export tests with GeoSpec evidence assertions over mesh/BRep/STEP outputs.                                    |
| `sysml-v2-spec-architecture-v2.md`                     | Future spec spine                  | Treat GeoSpec as the MCAD evidence provider beneath `@taucad/spec-runtime`.                                                                  |
| `cad-skill-vs-tau-cad-agent-fidelity.md`               | External workflow benchmark        | Use its STEP/BRep/measure/mate/frame gap analysis as API coverage pressure for GeoSpec.                                                      |
| `brepjs-step-streaming-import.md`                      | Large STEP import prior art        | Copy the native OCCT `ReadStream` first, MEMFS fallback second pattern, but extend it to XDE/AP242 through `STEPCAFControl_Reader`.          |

## Research Inputs

This blueprint is based on the following local source audits:

- `docs/policy/library-api-policy.md` for public API rules.
- `docs/research/vitest-style-parameter-geometry-testing-blueprint.md` for the previous Vitest-style geometry testing direction and parameter-testing requirements.
- `packages/testing` for the existing Tau geometry analyzers, canonical check schema, prompt examples, and test quality constraints.
- `apps/api/app/api/chat/prompts/cad-agent.prompt.ts` for how the CAD agent currently learns test affordances.
- `repos/opencascade.js/docs-site` for the Docker build pipeline, generated docs, smoke tests, and image usage.
- `repos/opencascade.js/tests/docker` for the opt-in Docker image test pattern.
- `repos/replicad/packages/replicad` and `repos/replicad/packages/replicad-opencascadejs/build-config` for custom OCCT bindings, measurement APIs, STEP import, mesh extraction, and wrapper design.
- `repos/brepjs` at `eba6ebc0b77fe0832bf8ca6f1d611150e9f6eead` for the latest `StepStreamIO` custom OCCT binding, native STEP `ReadStream` import/export, feature detection, and MEMFS fallback pattern.
- `repos/OCCT/src/DataExchange/TKDESTEP/STEPCAFControl` and `repos/OCCT/src/DataExchange/TKDESTEP/STEPControl` for verifying that `STEPCAFControl_Reader::ReadStream` exists and can preserve XDE/AP242 evidence without a temporary file.
- `repos/text-to-cad` for STEP-scene inspection, benchmark part requirements, mate/frame/diff workflows, and missing high-value CAD test APIs.

## Library Policy Constraints

GeoSpec must follow `docs/policy/library-api-policy.md` from day one:

- Use `createGeoSpec(...)` for stateful runtime construction.
- Use `defineGeoSpecConfig(...)` for configuration.
- Use flat option objects and avoid deep nested configuration unless the domain model requires structure.
- Avoid public functions with more than three positional parameters; prefer one options object.
- Keep the authoring DSL on the root import (`geospec`) for DX. Use singular export subpaths only for domain loaders and execution helpers, for example `geospec/mesh`, `geospec/step`, and `geospec/runner`.
- Avoid abbreviations in public names. Use `geometry`, `boundingBox`, `surfaceArea`, `centerOfMass`, and `signedVolume` rather than terse or CAD-jargon-only names.
- Keep heavy dependencies behind dynamic imports. The root import must not eagerly initialize WASM.
- Use outcome-shaped async APIs where failure is expected, especially for loading files, feature recognition, unsupported AP242 evidence, and approximate algorithms.
- Provide typed unsupported-capability results rather than silently passing or throwing opaque errors when a kernel, file format, browser, or build does not expose a capability.

## Naming And Package Decision

### Decision

Use `geospec` as the package name and GeoSpec as the product/library spelling.

### Repository Home

Initial path:

```text
packages/geospec
```

Recommended package name:

```json
{
  "name": "geospec"
}
```

If public npm availability or trademark checks later require a scoped package, the API should remain spelling-compatible:

```ts
import { createGeoSpec } from 'geospec';
```

can become:

```ts
import { createGeoSpec } from '@geospec/core';
```

without changing exported names.

### Keep Both `geospec` And `@taucad/testing`

`geospec` and `@taucad/testing` should both exist during the migration.

| Package           | Long-term role                                                                                                                         | Must not own                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `geospec`         | Standalone geometry evidence, analysis algorithms, OCCT WASM wrapper, Vitest-style runner, matchers, Node/browser VM execution         | Tau chat tool schemas, Tau project storage, Tau runtime-only assumptions, agent prompt text |
| `@taucad/testing` | Tau adapter, compatibility facade, parameter-aware render helpers, `test.json` migration, CAD agent examples, kernel runtime harnesses | Core geometry algorithms, exact STEP/BRep wrappers, public standalone API design            |

This split keeps GeoSpec clean enough to be useful to `earthtojake/text-to-cad`, external CAD workflows, CI pipelines, browser sandboxes, and future non-Tau runtimes.

## Eigenquestions

### What Is The Object Under Test?

GeoSpec cannot treat "the CAD model" as one thing. It must model evidence explicitly:

- Mesh evidence: triangles, vertices, normals, colors, groups, units, transforms.
- BRep evidence: OCCT shape topology, exact surfaces, exact curves, tolerances, validity state.
- STEP evidence: file schema, product tree, XDE labels, assembly occurrences, colors, materials, layers, PMI/GD&T, validation properties.
- Runtime evidence: source file, parameters, kernel name/version, export format, render settings, provenance.

The public API should expose a single ergonomic `GeometrySubject`, but internally every matcher must declare which evidence realms it consumed.

### Should Mesh Results Depend On Kernel Metadata?

No. Mesh tests must compute from mesh geometry alone. Existing Tau testing learnings already show why: OpenSCAD can emit unwelded triangles and color-grouped primitives differently from Replicad/OCCT, so a provider-agnostic mesh analyzer must spatially weld vertices and detect disconnected geometry from triangle positions rather than relying on `extras`, primitive boundaries, or kernel-supplied assembly metadata.

### What Does "Full STEP AP242" Mean?

It cannot mean that every AP242 entity in the ISO schema is fully semantically validated in P0. A credible first version should define "AP242 evidence coverage" as:

- Confirm STEP schema/header metadata.
- Load the file through `STEPCAFControl_Reader` into XDE, not only `STEPControl_Reader`.
- Extract product structure, occurrences, transforms, names, colors, layers, materials, shape references, and units.
- Extract available PMI/GD&T/dimensional tolerance structures through XDE/OCCT APIs where bound.
- Validate the resulting OCCT shapes with `BRepCheck_Analyzer` and shape-property checks.
- Report unsupported AP242 evidence areas explicitly, with enough metadata to guide wrapper expansion.

The API should use typed capability reports:

```ts
type StepAp242Capability =
  | { kind: 'supported'; feature: 'product-structure' }
  | { kind: 'supported'; feature: 'color' }
  | { kind: 'supported'; feature: 'geometric-tolerance' }
  | { kind: 'unsupported'; feature: 'kinematic-pair'; reason: string };
```

This avoids overclaiming conformance while still building toward true AP242 coverage.

### What Does Tau Runtime Emit?

GeoSpec should not know how Tau renders a project, and Tau runtime should not grow a public `GeometryArtifact` contract for this slice. The corrected contract is file/bytes based:

- Tau runtime renders or exports geometry bytes/files, starting with GLB/glTF and later STEP.
- GeoSpec loaders consume those bytes/files and create an internal `GeometrySubject` with mesh evidence, provenance, parameters, capabilities, and diagnostics.
- `@taucad/testing` remains the Tau adapter that knows how to call runtime, read saved parameter groups, and pass geometry bytes plus parameter metadata into GeoSpec.

This keeps GeoSpec standalone while letting future loaders accept direct `.glb`, `.stl`, `.obj`, `.step`, `.stp`, `.iges`, `.brep`, browser `File`/`Blob`, Node buffers/streams, and in-memory triangle buffers.

### How Can Tests Run Both In Node And The Browser?

GeoSpec needs its own small Vitest-style collection and execution layer. It should integrate with real Vitest when available, but the Tau UI cannot rely on Vitest's Node process model. The first implementation step now exists in `packages/geospec`: a `geospec/runner` `runGeoSpecModule` POC that executes ESM through `@taucad/vm`, registers a `geospec` builtin, and collects structured `describe`/`it`/`expectGeo` assertions.

`@taucad/vm` is the shared module substrate rather than a test framework. Its root public API is intentionally minimal (`createEsbuildModuleVm`, `clearExecuteCache`, and VM result/types). Low-level esbuild plugin, CDN module manager, and namespace constants stay behind the browser-safe `@taucad/vm/internal` compatibility subpath for runtime compatibility and VM package tests. The Node temp-file executor is split into `@taucad/vm/internal-node` so browser/client consumers can use the shared substrate without accidentally pulling Node-only imports. GeoSpec should depend only on the root VM API.

The runner should provide a shared test DSL and execute modules through an environment-specific VM:

- Node: `worker_threads` plus dynamic ESM import from generated module URLs or temporary files.
- Browser: module `Worker` from a Blob URL for isolated execution.
- Browser fallback: sandboxed `iframe` for cases that require DOM-like module resolution.
- Optional advanced Node VM: `vm.SourceTextModule` only as an explicit experimental mode because Node's ESM VM APIs remain awkward and version-sensitive.

The test author should not need to care which VM runs the file.

## Existing Prior Art Findings

### `@taucad/testing`

Current Tau testing already contains important design contracts:

- `boundingBox`, `connectedComponents`, and `watertight` checks are canonicalized and exposed to the CAD agent.
- Analyzer output is intentionally LLM-readable, including spatial bounds, centers, counts, colors, and explanations rather than bare booleans.
- Mesh checks derive from GLB geometry and avoid kernel-specific metadata.
- The connected-components analyzer spatially welds vertices before union-find because OpenSCAD's color-grouped export can write each triangle with fresh positions.
- The watertight analyzer classifies welded edge incidence and reports boundary centroids.

GeoSpec must preserve these semantic expectations and upgrade the implementations to native C++/WASM where performance or robustness requires it.

### Replicad OCCT Bindings

Replicad proves the feasibility of a custom OCCT wrapper layer:

- `BRepGProp.VolumeProperties`, `SurfaceProperties`, and `LinearProperties` are used for mass-property measurements.
- `BRepExtrema_DistShapeShape` is used for exact shape distance.
- `BRepBndLib.Add` plus `Bnd_Box` are used for exact bounding boxes.
- `STEPControl_Reader` imports STEP by writing a browser `Blob` into Emscripten FS and calling `ReadFile`.
- Custom C++ wrappers extract triangle meshes and edge polylines using `BRepMesh_IncrementalMesh`, `BRep_Tool::Triangulation`, face locations, orientation handling, and OCCT normals.
- Build config selects symbols and C++ wrappers through YAML in `repos/replicad/packages/replicad-opencascadejs/build-config`.

GeoSpec should follow this model, but it should not copy Replicad's product shape. Replicad is an authoring/modeling API. GeoSpec is an evidence and testing API.

### brepjs STEP Stream I/O

After syncing latest from `andymai/brepjs`, the current `main` commit is:

```text
eba6ebc0b77fe0832bf8ca6f1d611150e9f6eead 2026-06-01 chore(main): release brepjs 18.35.3 (#1138)
```

The important discovery is its custom `StepStreamIO` binding in `repos/brepjs/packages/brepjs-opencascade/build-config/brepjs.yml`. The wrapper uses OCCT stream APIs rather than Emscripten FS:

```cpp
static TopoDS_Shape importSTEP(const std::string& data) {
  std::istringstream iss(data);
  STEPControl_Reader reader;
  if (reader.ReadStream("memory.step", iss) != IFSelect_RetDone) {
    return TopoDS_Shape();
  }
  Message_ProgressRange progress;
  reader.TransferRoots(progress);
  return reader.OneShape();
}
```

The TypeScript adapter feature-detects `oc.StepStreamIO.importSTEP` and uses it before falling back to `FS.writeFile` plus `STEPControl_Reader.ReadFile`. That is the exact compatibility shape GeoSpec should copy: native stream first, filesystem fallback second, with the selected strategy recorded in provenance.

Two constraints matter:

- brepjs currently passes the whole STEP payload as a string to C++. This is native OCCT iostream parsing, not zero-copy incremental browser `ReadableStream` parsing.
- brepjs uses `STEPControl_Reader`, which returns a shape. GeoSpec needs AP242/XDE evidence, so its wrapper should use `STEPCAFControl_Reader::ReadStream`, which OCCT exposes directly and implements by delegating to the underlying STEP reader.

GeoSpec should call this feature "native STEP stream import" and reserve "chunked stream import" for a later callback-backed `std::streambuf` implementation.

### `opencascade.js` Docker Build Pipeline

The local `opencascade.js` docs-site and tests show the correct build pattern:

```bash
docker run --rm \
  -v "$(pwd):/src" \
  -u "$(id -u):$(id -g)" \
  ghcr.io/taucad/opencascade.js:single-threaded \
  link geospec_single.yml
```

With persistent caches:

```bash
docker volume create ocjs-nx-cache ocjs-build-cache

docker run --rm \
  -v ocjs-nx-cache:/opencascade.js/.nx \
  -v ocjs-build-cache:/opencascade.js/build \
  -v "$(pwd):/src" \
  -u "$(id -u):$(id -g)" \
  ghcr.io/taucad/opencascade.js:single-threaded \
  link geospec_single.yml
```

The YAML supports:

- `mainBuild.bindings`
- `mainBuild.emccFlags`
- `mainBuild.additionalBindCode`
- top-level `additionalCppCode`
- top-level `additionalCppFiles`
- `generateTypescriptDefinitions`

The Docker image should be pinned by digest in CI once the initial wrapper set is stable.

### `text-to-cad`

`earthtojake/text-to-cad` is highly relevant prior art because it treats CAD verification as a repeatable pipeline, not just a visual inspection task.

The benchmark suite includes high-value test targets:

- Rectangular calibration block: dimensions, holes, chamfer.
- Circular flange: bore, bolt circle, repeated holes, fillets.
- L-bracket: gussets, hole directions, orthogonal faces.
- Stepped shaft: cylindrical sections, shoulders, keyway.
- Open-top enclosure: wall thickness, floor, standoffs, blind holes, fillets.
- Clevis bracket: fork lugs, bore alignment, gussets, cutouts.
- Radial engine cylinder: fins, spark-plug boss, repeated radial features.
- Centrifugal impeller: curved blades, rotational patterns, hub/shroud relationships.
- Spiral staircase: helical layout, balusters, tread placement.
- Planetary gear stage: gears, carrier, pins, concentricity, mating relationships.

Its validation workflow uses commands such as `inspect refs`, `measure`, `mate`, `frame`, and `diff`. Its STEP scene extraction code builds rows for occurrences, shapes, faces, edges, relations, bounding boxes, volumes, centers, surface types, curve types, transforms, and proxy runs.

GeoSpec should treat this as a strong external API benchmark. If the GeoSpec API cannot express these benchmark requirements clearly, it is not complete enough.

## Proposed Package Structure

```text
packages/geospec/
  package.json
  project.json
  tsconfig.json
  tsconfig.lib.json
  tsconfig.spec.json
  build-config/
    geospec_single.yml
    wrappers/
      geospec_brep_analyzer.cpp
      geospec_distance_analyzer.cpp
      geospec_mesh_analyzer.cpp
      geospec_step_stream_reader.cpp
      geospec_topology_extractor.cpp
  src/
    index.ts
    config/
      define-geospec-config.ts
    expect/
      expect-geo.ts
      matchers.ts
    mesh/
      mesh-evidence.ts
      load-mesh.ts
      analyze-mesh.ts
    brep/
      brep-evidence.ts
      analyze-brep.ts
    step/
      load-step.ts
      step-evidence.ts
      step-ap242.ts
    runner/
      collect-tests.ts
      run-geospec-tests.ts
      node-worker-vm.ts
      browser-worker-vm.ts
      browser-iframe-vm.ts
    dsl/
      index.ts
    wasm/
      load-geospec-wasm.ts
      geospec_wasm.d.ts
  test/
    fixtures/
    mesh/
    brep/
    step/
    runner/
```

Recommended exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./config": "./dist/config/index.js",
    "./mesh": "./dist/mesh/index.js",
    "./brep": "./dist/brep/index.js",
    "./step": "./dist/step/index.js",
    "./runner": "./dist/runner/index.js",
    "./wasm": "./dist/wasm/index.js"
  }
}
```

Do not create `geospec/tau` in P0. Tau-specific APIs belong in `@taucad/testing` to preserve standalone package boundaries.

## Docker And OCCT Build Blueprint

### Build Mode

Start with single-threaded WASM.

Reasons:

- It works in Node and browsers without requiring cross-origin isolation.
- It avoids `SharedArrayBuffer` deployment constraints in Tau UI.
- The first correctness challenge is algorithm validity, not parallel throughput.
- Multi-threading can be introduced later behind the same TypeScript API.

### Build Command

From `packages/geospec/build-config`:

```bash
docker run --rm \
  -v ocjs-nx-cache:/opencascade.js/.nx \
  -v ocjs-build-cache:/opencascade.js/build \
  -v "$(pwd):/src" \
  -u "$(id -u):$(id -g)" \
  ghcr.io/taucad/opencascade.js:single-threaded \
  link geospec_single.yml
```

Recommended workspace script:

```json
{
  "scripts": {
    "build:wasm": "pnpm nx run geospec:build-wasm"
  }
}
```

Recommended Nx target:

```json
{
  "targets": {
    "build-wasm": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "packages/geospec/build-config",
        "command": "docker run --rm -v ocjs-nx-cache:/opencascade.js/.nx -v ocjs-build-cache:/opencascade.js/build -v \"$PWD:/src\" -u \"$(id -u):$(id -g)\" ghcr.io/taucad/opencascade.js:single-threaded link geospec_single.yml"
      }
    }
  }
}
```

The actual implementation should avoid shell portability footguns in CI by using an existing repository script or a small Node wrapper once the target is created.

### Initial YAML Shape

```yaml
name: geospec_single

mainBuild:
  generateTypescriptDefinitions: true
  bindings:
    - symbol: Standard_Failure
    - symbol: TCollection_AsciiString
    - symbol: TCollection_ExtendedString
    - symbol: Interface_Static
    - symbol: IFSelect_ReturnStatus

    - symbol: TopAbs_ShapeEnum
    - symbol: TopAbs_Orientation
    - symbol: TopoDS_Shape
    - symbol: TopoDS_Compound
    - symbol: TopoDS_Solid
    - symbol: TopoDS_Shell
    - symbol: TopoDS_Face
    - symbol: TopoDS_Wire
    - symbol: TopoDS_Edge
    - symbol: TopoDS_Vertex
    - symbol: TopoDS
    - symbol: TopExp
    - symbol: TopExp_Explorer
    - symbol: TopTools_IndexedMapOfShape
    - symbol: TopTools_ShapeMapHasher
    - symbol: TopLoc_Location

    - symbol: gp_Pnt
    - symbol: gp_Vec
    - symbol: gp_Dir
    - symbol: gp_Ax1
    - symbol: gp_Ax2
    - symbol: gp_Trsf
    - symbol: Bnd_Box
    - symbol: BRepBndLib
    - symbol: BRepGProp
    - symbol: BRepGProp_Face
    - symbol: GProp_GProps
    - symbol: BRepExtrema_DistShapeShape
    - symbol: BRepCheck_Analyzer
    - symbol: BRepCheck_Status
    - symbol: BRepMesh_IncrementalMesh
    - symbol: BRep_Tool
    - symbol: BRepTools
    - symbol: BRepAdaptor_Surface
    - symbol: BRepAdaptor_Curve
    - symbol: GeomAbs_SurfaceType
    - symbol: GeomAbs_CurveType
    - symbol: Poly_Triangulation
    - symbol: Poly_Triangle
    - symbol: Poly_PolygonOnTriangulation

    - symbol: STEPControl_Reader
    - symbol: STEPControl_Writer
    - symbol: STEPControl_StepModelType
    - symbol: STEPCAFControl_Reader
    - symbol: STEPCAFControl_Writer
    - symbol: XSControl_WorkSession
    - symbol: GeoSpecStepStreamReader
    - symbol: GeoSpecStepReadResult
    - symbol: TDocStd_Document
    - symbol: TDF_Label
    - symbol: TDF_LabelSequence
    - symbol: TDataStd_Name
    - symbol: XCAFDoc_DocumentTool
    - symbol: XCAFDoc_ShapeTool
    - symbol: XCAFDoc_ColorTool
    - symbol: XCAFDoc_MaterialTool
    - symbol: XCAFDoc_DimTolTool

  additionalCppFiles:
    - wrappersgeospec_mesh_analyzer.cpp
    - wrappersgeospec_distance_analyzer.cpp
    - wrappersgeospec_brep_analyzer.cpp
    - wrappersgeospec_step_stream_reader.cpp
    - wrappersgeospec_topology_extractor.cpp
```

This list should be refined after a bind-symbols pass. The API should prefer C++ wrapper methods that return compact JSON/result handles rather than exposing every OCCT class directly.

### Wrapper Principle

Bind fewer OCCT classes publicly and write more GeoSpec-specific C++.

For example, do not ask TypeScript users to traverse `TopExp_Explorer`, `TDF_LabelSequence`, and `XCAFDoc_*` directly. Instead expose:

```cpp
GeoSpecStepReadResult GeoSpecStepStreamReader::readText(
  const std::string& data,
  const GeoSpecStepReadOptions& options
);
```

The implementation should follow brepjs's `StepStreamIO` pattern but use `STEPCAFControl_Reader::ReadStream` so XDE/AP242 evidence is preserved. Bind only the result handle plus accessors needed by the TypeScript wrapper.

## Native C++ Analyzer Blueprint

### Mesh Analyzer

The mesh analyzer accepts packed mesh buffers and returns deterministic metrics and diagnostics.

Input:

- positions: `Float32Array` or `Float64Array`
- indices: `Uint32Array`
- normals: optional `Float32Array`
- colors/material ids: optional
- groups/primitives: optional
- transforms: optional
- unit scale: optional

P0 algorithms:

- Axis-aligned bounding box.
- Oriented bounding box candidate, at least through PCA or exact-geometry fallback where available.
- Vertex count, triangle count, primitive/group count.
- Non-finite coordinate detection.
- Degenerate triangle detection.
- Duplicate/coincident triangle detection.
- Triangle normal and winding consistency.
- Surface area.
- Signed volume for closed oriented meshes.
- Center of mass approximation for closed meshes.
- Spatially welded connected components.
- Watertightness and non-manifold edge classification.
- Boundary loop extraction.
- Triangle quality metrics: aspect ratio, minimum angle, sliver detection.
- Self-intersection detection.
- Nearest-surface distance, Chamfer distance, Hausdorff distance, and percentile distance.

Distance APIs should be explicit about directionality:

```ts
type SurfaceDistanceSummary = {
  directedActualToExpected: DistanceDistribution;
  directedExpectedToActual: DistanceDistribution;
  symmetric: DistanceDistribution;
};

type DistanceDistribution = {
  min: number;
  mean: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
  rms: number;
  sampleCount: number;
};
```

The name "Chamfer distance" should be reserved for sampled/symmetric point-set or surface-sample comparisons. Feature chamfers should use names such as `toHaveChamferFeature` or `toHaveEdgeChamfer`.

### BRep Analyzer

The BRep analyzer accepts an OCCT shape handle produced from STEP, BREP, IGES, or a Tau runtime adapter.

P0 algorithms:

- Exact bounding box via `BRepBndLib`.
- Validity via `BRepCheck_Analyzer`.
- Shape topology counts by `TopAbs_ShapeEnum`.
- Surface/curve classifications through adaptors.
- Mass properties via `BRepGProp`: volume, surface area, linear edge length, center of mass.
- Minimum distance between shapes via `BRepExtrema_DistShapeShape`.
- Meshing into `MeshEvidence` using a GeoSpec-owned extractor.

P1 algorithms:

- Plane/cylinder/cone/sphere/torus face selection.
- Circular hole recognition.
- Bolt-circle pattern recognition.
- Fillet and chamfer feature recognition.
- Wall thickness probes.
- Interference/clearance checks.
- Section analysis by cutting plane.

### STEP/XDE Reader

The STEP reader should prefer `STEPCAFControl_Reader` for AP242/XDE evidence and should use a brepjs-style native stream wrapper before any filesystem fallback.

Input source forms:

```ts
type StepSource =
  | string
  | URL
  | Uint8Array
  | ArrayBuffer
  | Blob
  | File
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;
```

The first version should implement native OCCT stream import, not claim a proven zero-copy incremental parser:

1. Accept stream-like inputs in Node and browser.
2. Normalize the source into STEP text with progress events, byte counts, `maxBytes`, and `AbortSignal` checks before native parse starts.
3. Prefer `GeoSpecStepStreamReader.readText(data, options)`, implemented in C++ with `std::istringstream` and `STEPCAFControl_Reader::ReadStream("memory.step", input)`.
4. Transfer into a `TDocStd_Document` and extract XDE/AP242 evidence from labels, shape tools, color tools, material tools, validation properties, and GDT/PMI modes where enabled.
5. Fall back to chunking into Emscripten FS plus `STEPCAFControl_Reader.ReadFile(path)` only when the native stream wrapper is unavailable or explicitly requested.
6. Record the selected read strategy and parse boundary on the resulting artifact.

The brepjs pattern is "native stream import" because OCCT reads from a C++ iostream rather than a virtual file. It is still a full-text boundary at the JS to C++ call. Future work can explore a callback-backed `std::streambuf` for true chunked parsing, but that should be a separate experimental strategy after large-fixture benchmarks prove it is worthwhile.

Recommended provenance:

```ts
type StepReadStrategy = 'native-stream' | 'filesystem' | 'chunked-native-stream-experimental';

interface StepReadProvenance {
  strategy: StepReadStrategy;
  inputKind: 'path' | 'url' | 'blob' | 'file' | 'array-buffer' | 'uint8-array' | 'readable-stream' | 'async-iterable';
  bytesRead: number;
  copiedToEmscriptenFs: boolean;
  nativeReadStream: boolean;
  parseBoundary: 'full-text' | 'chunked-streambuf';
}
```

### C++ Result Shape

C++ wrappers should return result handles rather than huge JSON strings for large data.

Pattern:

```ts
const result = wasm.GeoSpecMeshAnalyzer.analyze(meshHandle, optionsHandle);

const summary = result.summaryJson();
const components = result.connectedComponentsJson();
const boundaryEdges = result.boundaryEdgesBuffer();

result.delete();
```

TypeScript should wrap this in safe objects:

```ts
const analysis = await analyzeMesh({ mesh, checks: ['connected-components'] });

try {
  analysis.connectedComponents;
} finally {
  await analysis.dispose();
}
```

Public users should rarely see raw handles. The handle layer exists to avoid copying large buffers unnecessarily.

## Public TypeScript API Blueprint

### Factory

```ts
import { createGeoSpec } from 'geospec';

const geospec = await createGeoSpec({
  wasm: 'auto',
  unit: 'mm',
  cache: 'default',
});
```

`createGeoSpec` should lazily initialize WASM. Importing `geospec` should not compile or instantiate the module.

### Configuration

```ts
import { defineGeoSpecConfig } from 'geospec/config';

export default defineGeoSpecConfig({
  unit: 'mm',
  tolerance: {
    length: 0.05,
    angleDegrees: 0.1,
  },
  runner: {
    vm: 'auto',
    testTimeout: 30_000,
  },
  geometry: {
    meshDistanceSamples: 50_000,
    weldTolerance: 1e-5,
  },
});
```

The nested shape above is acceptable because these are domain groups. Individual public functions should still prefer flat option objects.

### Loading Mesh Evidence

```ts
import { loadMesh } from 'geospec/mesh';

const bracket = await loadMesh({
  source: './artifacts/bracket.glb',
  units: 'mm',
});
```

Supported mesh inputs should eventually include:

- glTF/GLB
- STL
- OBJ
- PLY
- in-memory triangle buffers
- Tau runtime-produced GLB/glTF bytes through `@taucad/testing`

### Loading STEP Evidence

```ts
import { loadStep } from 'geospec/step';

const assembly = await loadStep({
  source: './fixtures/assembly.step',
  evidence: ['shape', 'xde', 'ap242', 'mesh'],
  units: 'mm',
  streaming: 'auto',
  onProgress(event) {
    console.info(event.phase, event.bytesRead);
  },
  mesh: {
    linearDeflection: 0.1,
    angularDeflection: 0.2,
  },
});
```

`streaming: 'auto'` should prefer native XDE stream import. The public strategy option should stay explicit for debugging and parity tests:

```ts
type StepStreamingMode = 'auto' | 'native-stream' | 'filesystem' | 'chunked-native-stream-experimental';
```

`filesystem` is a compatibility strategy, not the default. `chunked-native-stream-experimental` should remain unavailable until a callback-backed C++ `std::streambuf` has its own benchmark and lifetime-safety proof.

### Matchers

```ts
import { expectGeo } from 'geospec';

await expectGeo(model).toHaveBoundingBox({
  min: { x: -50, y: -30, z: 0 },
  max: { x: 50, y: 30, z: 20 },
  tolerance: 0.05,
});

await expectGeo(model).toHaveSurfaceArea({
  value: 12_345,
  tolerance: 1,
});

await expectGeo(model).toHaveSignedVolume({
  value: 120_000,
  tolerance: 10,
});

await expectGeo(actual).toHaveChamferDistanceTo(expected, {
  mean: { lessThan: 0.02 },
  max: { lessThan: 0.2 },
  samples: 100_000,
});

await expectGeo(model).toBeWatertight({
  tolerance: 1e-5,
});

await expectGeo(model).toHaveConnectedComponents({
  count: 1,
  tolerance: 1e-5,
});
```

Matcher failures must be spatially descriptive:

```text
Expected 1 connected component, found 2.

Component 1:
  bounds min=(-50,-30,0) max=(50,30,20) center=(0,0,10)
  color=#b7c9ff

Component 2:
  bounds min=(18,12,20) max=(24,18,32) center=(21,15,26)
  color=#f4b183

The extra component is above the top face near positive X and positive Y.
```

### Feature And Rule Matchers

These should be introduced once BRep/topology evidence is available:

```ts
await expectGeo(model).toHavePlanarFace({
  normal: { x: 0, y: 0, z: 1 },
  offset: 20,
  area: { greaterThan: 5_000 },
  tolerance: 0.05,
});

await expectGeo(model).toHaveCylindricalFace({
  radius: 15,
  axis: 'z',
  tolerance: 0.05,
});

await expectGeo(model).toHaveCircularHole({
  diameter: 8,
  through: true,
  axis: 'z',
  center: { x: 25, y: 15 },
  tolerance: 0.05,
});

await expectGeo(model).toHaveChamferFeature({
  distance: 2,
  selection: 'outer top perimeter',
  tolerance: 0.05,
});

await expectGeo(model).toHaveMinimumWallThickness({
  value: { greaterThanOrEqual: 2 },
  tolerance: 0.05,
});
```

### Assembly, Mates, Frames, And Spatial Relations

`text-to-cad` shows that advanced benchmarks need more than scalar measurements.

Proposed API:

```ts
const leftLug = model.select('part[name="left lug"]');
const rightLug = model.select('part[name="right lug"]');
const pin = model.select('part[name="pin"]');

await expectGeo(leftLug).toBeParallelTo(rightLug, {
  toleranceDegrees: 0.1,
});

await expectGeo(pin).toBeCoaxialWith(leftLug.select('hole[diameter=10]'), {
  tolerance: 0.05,
  toleranceDegrees: 0.1,
});

await expectGeo(model).toHaveClearance({
  between: [pin, leftLug],
  greaterThanOrEqual: 0.1,
});
```

Selection syntax must be designed carefully. P0 can support explicit handles and simple selectors. Rich CSS-like selectors should wait until the feature graph is stable.

### Vitest Integration

GeoSpec should work inside ordinary Vitest:

```ts
import { describe, expect, it } from 'vitest';
import { expectGeo } from 'geospec';
import { loadMesh } from 'geospec/mesh';

describe('exported mesh', () => {
  it('matches the reference model', async () => {
    const actual = await loadMesh({ source: './actual.glb' });
    const expected = await loadMesh({ source: './expected.glb' });

    await expectGeo(actual).toHaveChamferDistanceTo(expected, {
      mean: { lessThan: 0.05 },
      max: { lessThan: 0.25 },
    });
  });
});
```

It should also provide a bundled Vitest-style DSL for Tau UI and other browser VM contexts:

```ts
import { describe, expectGeo, it } from 'geospec';

describe('parameter sweep', () => {
  it.each([
    { width: 40, height: 20 },
    { width: 80, height: 20 },
  ])('keeps a valid closed mesh for %o', async (parameters) => {
    const model = await renderModel({ parameters });

    await expectGeo(model).toBeWatertight();
    await expectGeo(model).toHaveSignedVolume({
      value: { greaterThan: 0 },
    });
  });
});
```

## Parameter-Aware Tau DX

Parameter authoring belongs in `@taucad/testing`, but it should feed GeoSpec.

Desired Tau-facing future API:

```ts
import { describe, expectGeo, it } from 'geospec';
import { parameterCases, renderTauModel } from '@taucad/testing/tau';

describe('adjustable bracket', () => {
  it.each(
    parameterCases([
      { width: 40, height: 20, holeDiameter: 6 },
      { width: 80, height: 30, holeDiameter: 8 },
    ]),
  )('stays manufacturable for %o', async ({ parameters }) => {
    const model = await renderTauModel({ parameters });

    await expectGeo(model).toBeWatertight();
    await expectGeo(model).toHaveConnectedComponents({ count: 1 });
    await expectGeo(model).toHaveMinimumWallThickness({
      value: { greaterThanOrEqual: 2 },
    });
  });
});
```

Syntactic sugar for parameters should be implemented in the Tau adapter, not in GeoSpec core:

```ts
import parameters from '@tau/parameters';

const cases = parameters.cases([{ width: 40 }, { width: 80 }]);
```

Possible implementation approaches:

- A virtual module in Tau's test runner that resolves `@tau/parameters` to the active model parameter schema and current values.
- A generated `.d.ts` file per Tau project that gives parameter names and value types.
- A custom `tsconfig` path in the Tau testing sandbox only:

```json
{
  "compilerOptions": {
    "paths": {
      "@tau/parameters": [".tau/generated/parameters.ts"]
    }
  }
}
```

The GeoSpec stance should be: "We can test any set of parameters you render for us." The Tau testing stance should be: "We know how to enumerate, type, mutate, and render Tau parameters."

## Node And Browser Runner Blueprint

### Runner API

```ts
import { runGeoSpecModule } from 'geospec/runner';

const result = await runGeoSpecModule({
  filesystem,
  projectPath: '/project',
  entryPath: '/project/main.test.ts',
});
```

The richer future `geospec/runner` API can still add config, reporters, file discovery, and Node/browser isolation. The POC proves the hard substrate question first: a CAD test module can be ordinary ESM, import the root GeoSpec DSL, and run outside the Tau UI through `@taucad/vm`.

Browser:

```ts
import { browserWorkerVm, runGeoSpecTests } from 'geospec/runner';

const result = await runGeoSpecTests({
  modules: [
    {
      id: 'flange.geospec.ts',
      source: editorContents,
    },
  ],
  vm: browserWorkerVm(),
});
```

### Test DSL

P0 syntax:

- `describe(name, fn)`
- `it(name, fn)`
- `test(name, fn)`
- `beforeAll(fn)`
- `afterAll(fn)`
- `beforeEach(fn)`
- `afterEach(fn)`
- `it.each(cases)(name, fn)`
- async tests
- timeout options
- `expectGeo(...)`
- lightweight scalar `expect(...)` for ordinary assertions

GeoSpec should not attempt to clone all of Vitest. It should support the authoring patterns needed for geometry tests and provide a clean bridge to real Vitest.

### VM Design

```ts
type GeoSpecVm =
  | { kind: 'node-worker'; run: GeoSpecVmRun }
  | { kind: 'browser-worker'; run: GeoSpecVmRun }
  | { kind: 'browser-iframe'; run: GeoSpecVmRun }
  | { kind: 'node-vm-experimental'; run: GeoSpecVmRun };
```

Node worker responsibilities:

- Execute ESM tests in isolation.
- Enforce timeout and cancellation.
- Transfer large buffers when possible.
- Avoid polluting the parent process module graph.
- Support source maps for failure locations.

Browser worker responsibilities:

- Execute ESM tests from Blob/module URLs.
- Load WASM through a configurable URL or injected bytes.
- Stream result events back to the UI.
- Avoid direct DOM access unless an iframe VM is selected.

Result event schema:

```ts
type GeoSpecTestEvent =
  | { type: 'suite-start'; id: string; name: string }
  | { type: 'test-start'; id: string; name: string }
  | { type: 'test-pass'; id: string; durationMs: number }
  | { type: 'test-fail'; id: string; durationMs: number; error: GeoSpecAssertionError }
  | { type: 'diagnostic'; testId: string; diagnostic: GeometryDiagnostic }
  | { type: 'run-complete'; summary: GeoSpecRunSummary };
```

## Geometry Evidence Model

### Mesh Evidence

```ts
interface MeshEvidence {
  kind: 'mesh';
  units: UnitName;
  positions: Float32Array | Float64Array;
  indices: Uint32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  groups?: MeshGroup[];
  source?: GeometrySourceReference;
}
```

### BRep Evidence

```ts
interface BrepEvidence {
  kind: 'brep';
  units: UnitName;
  shapeHandle: unknown;
  topology?: TopologySummary;
  validity?: BrepValiditySummary;
  source?: GeometrySourceReference;
}
```

The public object should not expose raw OCCT handles directly unless the user imports an advanced subpath.

### STEP Evidence

```ts
interface StepEvidence {
  kind: 'step';
  schema: StepSchema;
  units?: UnitName;
  header: StepHeaderEvidence;
  productTree: StepProductOccurrence[];
  xde?: XdeEvidence;
  ap242?: StepAp242Evidence;
  shape?: BrepEvidence;
  mesh?: MeshEvidence;
  capabilities: StepAp242Capability[];
}
```

### Diagnostics

All failing checks must return structured diagnostics:

```ts
interface GeometryDiagnostic {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  evidence: GeometryEvidenceKind[];
  bounds?: BoundingBox;
  center?: Point3;
  direction?: Vector3;
  measurements?: Measurement[];
  relatedEntities?: GeometryEntityReference[];
}
```

The message is for humans and LLMs. The structured fields are for UI overlays, downstream tools, and future automatic repair workflows.

## API Inventory And Priority

### P0 Mesh And Regression Tests

| API                           | Evidence           | Purpose                                    |
| ----------------------------- | ------------------ | ------------------------------------------ |
| `toHaveBoundingBox`           | mesh or BRep       | Validate extents, min/max/center/size      |
| `toHaveTriangleCount`         | mesh               | Detect missing/excess tessellation         |
| `toHaveVertexCount`           | mesh               | Detect topology/export drift               |
| `toHaveConnectedComponents`   | mesh               | Detect missing or extra disconnected parts |
| `toBeWatertight`              | mesh               | Detect boundary/non-manifold edge issues   |
| `toHaveSurfaceArea`           | mesh or BRep       | Validate surface scale                     |
| `toHaveSignedVolume`          | mesh or BRep       | Validate closed volume                     |
| `toHaveCenterOfMass`          | mesh or BRep       | Validate placement and balance             |
| `toHaveNoDegenerateTriangles` | mesh               | Detect invalid export triangles            |
| `toHaveNoSelfIntersections`   | mesh or BRep       | Detect invalid overlapping surfaces        |
| `toHaveChamferDistanceTo`     | mesh               | Compare against reference geometry         |
| `toHaveHausdorffDistanceTo`   | mesh               | Bound worst-case deviation                 |
| `toMatchGeometrySnapshot`     | mesh plus metadata | Controlled regression snapshots            |

### P0 STEP/BRep Foundation

| API                      | Evidence      | Purpose                                     |
| ------------------------ | ------------- | ------------------------------------------- |
| `loadStep`               | STEP/XDE/BRep | Load exact STEP evidence                    |
| `toSatisfyStepAp242`     | STEP/XDE      | Validate schema and required AP242 evidence |
| `toBeValidBrep`          | BRep          | Use OCCT validity checks                    |
| `toHaveTopologyCounts`   | BRep          | Validate face/edge/wire/shell/solid counts  |
| `toHaveExactBoundingBox` | BRep          | Exact or OCCT-computed extents              |
| `toHaveExactVolume`      | BRep          | Mass properties through OCCT                |
| `toHaveExactSurfaceArea` | BRep          | Mass properties through OCCT                |
| `toHaveProductStructure` | STEP/XDE      | Validate assemblies and occurrences         |
| `toHaveStepUnits`        | STEP/XDE      | Catch unit errors                           |

### P1 Feature, Rule, And Assembly Tests

| API                                       | Evidence  | Purpose                                 |
| ----------------------------------------- | --------- | --------------------------------------- |
| `toHavePlanarFace`                        | BRep      | Validate planar construction            |
| `toHaveCylindricalFace`                   | BRep      | Validate holes, shafts, bosses          |
| `toHaveCircularHole`                      | BRep      | Validate hole geometry                  |
| `toHaveCircularHolePattern`               | BRep      | Validate flanges and bolt circles       |
| `toHaveFilletFeature`                     | BRep      | Validate rounded edges                  |
| `toHaveChamferFeature`                    | BRep      | Validate beveled edges                  |
| `toHaveWallThickness`                     | BRep/mesh | Validate enclosures and printability    |
| `toHaveClearance`                         | BRep/mesh | Validate assemblies                     |
| `toInterfereWith` / `not.toInterfereWith` | BRep      | Validate collision/interference         |
| `toBeCoaxialWith`                         | BRep      | Validate mates and alignment            |
| `toBeCoplanarWith`                        | BRep      | Validate mating faces                   |
| `toBeParallelTo`                          | BRep      | Validate frames and normals             |
| `toHaveTransform`                         | STEP/XDE  | Validate assembly occurrence transforms |

### P2 Advanced CAD And Manufacturing Tests

| API                        | Evidence      | Purpose                     |
| -------------------------- | ------------- | --------------------------- |
| `toHaveDraftAngle`         | BRep          | Injection molding / casting |
| `toHaveNoUndercuts`        | BRep          | Manufacturability           |
| `toHaveMinimumToolRadius`  | BRep          | CNC constraints             |
| `toHaveSheetMetalBends`    | BRep/STEP     | Sheet metal rules           |
| `toHaveGearMesh`           | BRep          | Gear assemblies             |
| `toHaveKinematicJoint`     | STEP AP242    | Assembly motion semantics   |
| `toHavePmiAnnotation`      | STEP AP242    | PMI/GD&T presence           |
| `toHaveGeometricTolerance` | STEP AP242    | GD&T semantic checks        |
| `toHaveMaterial`           | STEP/XDE      | Material rules              |
| `toHaveColor`              | STEP/XDE/mesh | Visual/product semantics    |
| `toMatchSilhouette`        | mesh/render   | Visual envelope regression  |
| `toHaveSectionProfile`     | BRep/mesh     | Cross-section validation    |

## Tau Runtime Requirements

Tau should continue emitting geometry files/bytes and should not become the owner of GeoSpec's evidence model. Required runtime-facing capabilities:

1. Render/export a model with an explicit parameter snapshot.
2. Return GLB/glTF bytes for mesh assertions, and later STEP bytes for exact import testing.
3. Preserve enough adapter-side metadata for `@taucad/testing` to pass source path, parameters, units, and provenance into GeoSpec loaders.
4. Stream diagnostics back to the UI while tests run.
5. Avoid relying on kernel-specific metadata for mesh-derived checks.

Candidate adapter API in `@taucad/testing`:

```ts
type RenderTauModelOptions = {
  source?: string;
  parameters?: Record<string, unknown>;
  kernel?: string;
  evidence?: GeometryEvidenceKind[];
};

declare const renderTauModel: (options?: RenderTauModelOptions) => Promise<Uint8Array<ArrayBuffer>>;
```

The CAD agent prompt should eventually demonstrate:

- parameter sweeps;
- `expectGeo` assertions;
- when to add a top-level kernel export to make a file testable;
- how to use bounding-box, component, watertight, volume, and distance checks;
- how to write precise failures that help the model repair geometry.

## Migration Plan

### Phase 0: Blueprint And Naming

- Create this GeoSpec blueprint.
- Mark the older Tau Gauge naming as superseded in the testing backlog.
- Decide `geospec` package name and `packages/geospec` path.
- Keep `@taucad/testing` as adapter and migration facade.

### Phase 1: Package Scaffold And Docker Build

- Scaffold `packages/geospec`.
- Add `build-configgeospec_single.yml`.
- Add no-op C++ wrapper smoke class.
- Add Nx target for Docker single-threaded build.
- Add opt-in Docker build test similar to `repos/opencascade.js/tests/docker`.
- Ensure the root import does not initialize WASM.

### Phase 2: Mesh Analyzer P0

- Port existing `@taucad/testing` mesh semantics into GeoSpec tests.
- Implement C++ packed-buffer analyzer for bounding box, non-finite vertices, degenerate triangles, connected components, watertightness, area, signed volume, and basic distance distributions.
- Preserve spatially descriptive diagnostics.
- Run the same analyzer through Node and browser.

### Phase 3: Vitest-Style Runner

- Implement collector DSL.
- Implement Node worker VM.
- Implement browser worker VM.
- Add result event streaming.
- Add real Vitest integration through `geospec`.

### Phase 4: STEP/XDE/BRep Evidence

- Implement `loadStep`.
- Use `STEPCAFControl_Reader::ReadStream` through `GeoSpecStepStreamReader` for native stream import and XDE document extraction.
- Keep `STEPCAFControl_Reader.ReadFile` plus Emscripten FS as a recorded fallback strategy only.
- Add source normalization for `Blob`, `File`, `ReadableStream<Uint8Array>`, Node streams, and `AsyncIterable<Uint8Array>` with progress events, `maxBytes`, and abort-before-parse behavior.
- Add exact BRep validation, topology counts, exact bbox, area, volume, center of mass, and distance.
- Add AP242 capability report.
- Add STEP fixtures for both good and intentionally broken files.
- Add a large STEP fixture that proves native stream import avoids MEMFS writes and reports strategy provenance.

### Phase 5: Tau Adapter And Prompt Migration

- Update `@taucad/testing` to consume GeoSpec.
- Keep old canonical `test.json` checks working as a compatibility surface.
- Add parameter-aware test helpers.
- Update the CAD agent prompt to teach parameter mutation and GeoSpec-style tests.

### Phase 6: `text-to-cad` Benchmark Coverage

- Recreate the ten benchmark families as GeoSpec fixtures.
- Add tests for refs, measurements, mates, frames, diffing, product structure, and feature rules.
- Use the benchmark suite as a regression target for API ergonomics.

### Phase 7: Advanced Rules

- Add wall thickness, draft, undercuts, GD&T/PMI, material, color, kinematic, and manufacturing APIs.
- Consider multi-threaded WASM for BVH-heavy distance and intersection checks.

## Test-The-Tester Strategy

Because GeoSpec is itself a testing framework, every algorithm needs good, bad, and edge-case fixtures.

### Required Fixture Types

- Analytic primitives with known exact area/volume/bounds.
- Deliberately unwelded but geometrically connected meshes.
- Disconnected meshes with same color/material.
- Coincident and near-coincident disconnected components.
- Non-manifold edges.
- Open boundary meshes.
- Inverted winding.
- Degenerate triangles.
- Self-intersecting meshes.
- Unit scale mismatches.
- STEP AP242 with product structure, colors, materials, and PMI where available.
- Broken STEP files with parse and transfer failures.
- Assembly fixtures with transforms, interference, and clearance.
- Parameter-sweep fixtures that intentionally pass and fail at boundaries.

### Validation Modes

- Native C++/WASM unit tests for algorithm kernels.
- TypeScript wrapper tests for memory/lifetime behavior.
- Node runner tests.
- Browser worker runner tests.
- Real Vitest integration tests.
- Tau runtime adapter tests against Replicad, OpenSCAD, Manifold, JSCAD, and KCL where possible.
- Cross-kernel tests that assert semantics rather than byte equality unless byte equality is the explicit export contract.
- Fuzz/property tests for triangle analyzers with deterministic seeds.

### Algorithm Validity Rules

- Approximate algorithms must report sampling method, sample count, seed, and confidence/limit semantics.
- Distance checks must distinguish mean, maximum, percentile, RMS, directed, and symmetric distances.
- Topological tests must disclose tolerance and welding behavior.
- Feature recognizers must report confidence and the evidence used.
- Unsupported evidence must fail as `unsupported`, not pass as "not found."

## Risks And Mitigations

| Risk                                     | Mitigation                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AP242 scope is too large                 | Define capability reports and ship product structure/units/XDE shape evidence first                                                                 |
| WASM bundle becomes too large            | Bind fewer OCCT classes; prefer wrapper APIs; split advanced submodules later                                                                       |
| Browser VM diverges from Node behavior   | Shared collector/matcher core and mandatory parity tests                                                                                            |
| Mesh algorithms produce false confidence | Analytic fixtures, adversarial fixtures, fuzzing, and exact diagnostics                                                                             |
| Tau-specific concerns leak into GeoSpec  | Keep Tau helpers in `@taucad/testing`                                                                                                               |
| STEP streaming is overclaimed            | Name the P0 path "native stream import"; report `parseBoundary: 'full-text'`; reserve true chunked parsing for `chunked-native-stream-experimental` |
| Memory leaks from C++ handles            | TypeScript disposal wrappers, stress tests, and `using`/`dispose` patterns                                                                          |
| Prompt teaches stale APIs                | Generate or import examples from canonical package helpers where possible                                                                           |

## Initial Acceptance Criteria

GeoSpec P0 should not be considered real until all of these pass:

- `geospec` can be imported in Node without initializing WASM.
- `createGeoSpec` initializes the single-threaded WASM build in Node and browser.
- Docker `link geospec_single.yml` succeeds from a clean checkout.
- Mesh analyzer passes good/bad/edge fixtures for bounding box, connected components, watertightness, area, volume, and distance.
- The same test file can run under real Vitest and the GeoSpec browser worker VM.
- `loadStep` imports at least one AP242 STEP fixture through native `STEPCAFControl_Reader::ReadStream` and reports schema, units, product tree, exact bbox, exact volume, BRep validity, and read-strategy provenance.
- `loadStep` imports a large STEP fixture in Node and browser worker tests without using Emscripten FS when the native stream wrapper is present.
- `@taucad/testing` can call GeoSpec for at least one existing canonical check without changing the CAD agent-facing requirement schema.
- Failing tests produce spatially descriptive diagnostics suitable for LLM repair.

## Open Questions

- Should public npm publish use `geospec` or an organization scope if the name is unavailable?
- How much STEP AP242 PMI/GD&T can be extracted with the first practical wrapper set?
- Should GeoSpec snapshots be human-readable JSON, compact binary evidence, or both?
- Which mesh loader should own GLB parsing in browsers without pulling a heavy dependency into the root entry?
- Should exact BRep handles be serializable across worker boundaries, or should every VM own its OCCT instance?
- Should advanced selectors be a typed builder API before a string selector language?
- How should Tau display GeoSpec diagnostics as 3D overlays in the editor?

## Recommendation

Proceed with GeoSpec as a standalone package and keep `@taucad/testing` as the Tau bridge. Start with a single-threaded custom OCCT WASM build using the `opencascade.js` Docker pipeline, implement the C++ mesh analyzer, then add STEP/AP242 through a brepjs-inspired native XDE `ReadStream` wrapper rather than a MEMFS-first reader. This gives Tau immediate value for repeatable geometry tests while building a public-quality CAD testing library that can serve external workflows such as `text-to-cad`.
