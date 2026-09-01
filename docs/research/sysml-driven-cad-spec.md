---
title: 'SysML v2 as a Specification Layer for Tau Code-Based CAD Assemblies'
description: "Investigates how SysML v2 (parts, ports, requirements, verification cases) can extend Tau's `packages/testing` measurement vocabulary to fully specify, verify, and trace assemblies of replicad / opencascade.js shapes."
status: superseded
superseded_by: docs/research/sysml-v2-spec-architecture-v2.md
created: '2026-04-23'
updated: '2026-06-01'
category: architecture
related:
  - docs/research/sysml-v2-spec-architecture-v2.md
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/chatgpt-deep-research-brief.md
  - docs/research/mesh-continuity-test-semantics.md
  - docs/research/parameter-architecture-v2.md
  - docs/research/import-test-geometry-deviation-audit.md
  - docs/architecture/runtime-topology.md
---

> **Superseded by [`sysml-v2-spec-architecture-v2.md`](./sysml-v2-spec-architecture-v2.md).** This document proposed extending Tau's existing `test.json` schema with SysML-derived fields (an additive, "graft" approach). The successor document treats `.sysml` files as a first-class file primitive across all five vision pillars and retires `test.json` entirely. As of 2026-06-01, the MCAD verification provider beneath that spec architecture is GeoSpec, with `@taucad/testing` acting as Tau's adapter and legacy compatibility layer. Retained for the additive-extension analysis and the schema-extension code samples in case the v2 architecture needs a back-compat shim.

# SysML v2 as a Specification Layer for Tau Code-Based CAD Assemblies

How to graft SysML v2's part / port / requirement / verification-case vocabulary onto Tau's existing `test.json` + `@taucad/testing` pipeline so the agent can produce **deterministic, testable specifications** for assemblies of CAD objects rendered by `replicad` or `opencascade.js`.

## Executive Summary

Tau already ships a deterministic, geometry-only verification layer in `packages/testing` (`analyzeGlb` → `evaluateRequirement`) wired into the agent loop via `test_model` / `edit_tests`. The current vocabulary is intentionally narrow — three measurement checks (`boundingBox`, `connectedComponents`, `watertight`) keyed per source file in `test.json`. This is a **pure post-mesh oracle**: it answers "did the kernel produce geometry that fits these scalar invariants?" and nothing about _why_, _for what assembly role_, or _with which mating partner_.

SysML v2 supplies the missing layer above measurements: **part definitions**, **attribute definitions** (with units), **ports** (mating interfaces), **connections** (assembly relations), **requirements** (testable predicates with rationale), and **verification cases** (binding requirements to executable checks). Adopted as a thin, code-generated specification layer, SysML v2 turns Tau's `test.json` into a _derived_ artifact and gives the agent a model the LLM can reason about _before_ writing kernel code.

This document inventories the current testing surface, maps SysML v2 elements onto Tau primitives, identifies the schema/runtime gaps, and proposes a minimal-disruption rollout (`packages/spec` package + extended `MeasurementTestRequirement` types + new geometry analyzers) that preserves the geometry-only, `extras`-free testing contract.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Trade-offs](#tradeoffs)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [References](#references)

## Problem Statement

The agent today produces CAD by:

1. Writing `<file>.ts` (replicad) or `<file>.scad` (OpenSCAD) with a top-level export.
2. Optionally writing `test.json` with an array of measurement requirements per source file.
3. Calling `test_model`, which fetches GLBs per file and grades each requirement via `evaluateRequirement`.

This works for single-part smoke validation ("the cube is 20mm³, watertight, and one chunk"), but it cannot express the things assemblies actually require:

- **Mating fits**: "the M3 boss on `bracket.ts` clears the hole in `plate.ts` by 0.2 mm".
- **Assembly cardinality**: "the bottom plate has exactly 4 mounting holes laid out on a 50×50 mm rectangle".
- **Mass / inertia / COM**: "the rotating arm's centre of mass lies on the spindle axis within 0.1 mm".
- **Material / appearance contracts**: "the gasket is rendered with `density=1200, opacity=0.6`".
- **Build-of-materials**: "the assembly contains 1 brick + 8 studs + 3 tubes; replacing `lego/main.ts` with a 2×2 brick must yield 4 studs + 1 tube".
- **Requirement traceability**: "this clearance test exists _because_ requirement `R-FIT-001` says it must".

Worse, the agent has no canonical place to _plan_ an assembly: it goes straight from prose ("make me a LEGO 2×4 brick") to code, then post-hoc invents `test.json` numerics that often re-state the prompt rather than constrain it. There is no spec → code → verification trace, only a code → measurement loop.

SysML v2 — particularly its textual notation (KerML + the SysML standard library) — is the mature OMG standard for exactly this gap. The question is **how to express it in a Tau-idiomatic way that preserves geometry-only verification, kernel independence, and the `defineKernel` plugin contract**.

## Scope and Non-Goals

**In scope**

- Mapping SysML v2 elements onto `packages/testing` schemas and `@taucad/runtime` plugin surfaces.
- Schema additions to `MeasurementTestRequirement` and a new `AnalysisRequirement` discriminator.
- Generation strategy for `test.json` from a SysML model.
- Agent-loop integration: how the LLM authors / edits SysML and what the new tools look like.

**Out of scope**

- Full OMG SysML v2 conformance — Tau only needs the verification-relevant subset.
- A SysML v2 textual parser implementation — covered by upstream KerML/SysML reference parsers; Tau wraps via TypeScript Zod schemas.
- Constraint-driven _generative_ design (would require a CSP / SMT layer above the kernel — listed as future work).
- Per-kernel material PBR contracts beyond what `defineKernel` already resolves (`metalness`, `roughness`, `density`, `opacity`).

## Methodology

1. Read the live `packages/testing` package end-to-end (`schemas.ts`, `geometry/*.ts`, `prompt-examples.ts`) plus its kernel-author harness (`packages/runtime/src/testing/kernel-geometry-testing.utils.ts`).
2. Traced the agent path: `tool-test-model.ts` → `chatRpcService.fetchGeometry` → `geometryAnalysisService.runMeasurementTests` → `evaluateRequirement`.
3. Traced the prompt path: `cad-agent.prompt.ts <test_requirements>` block → `renderCanonicalExample` → `AVAILABLE_CHECKS_COPY` → `tool-edit-tests.ts`.
4. Reviewed assembly-shaped examples in `libs/tau-examples/` (LEGO brick, t-slot rail, gridfinity-box, table) for implicit assembly constraints not currently expressible.
5. Cross-referenced the SysML v2 OMG spec (Beta 2 textual notation), KerML kernel, and the verification-case pattern from the SysML v2 Pilot Implementation.
6. Walked the `defineKernel` / `defineTranscoder` contract for extension points that a spec layer can hook (export schemas, dependency hashing, middleware `getDependencies`).

No code changes were made; this is a design-time investigation per `Learned User Preferences` ("present findings and analysis first; do not jump to code changes until implementation is explicitly requested").

## Findings

### Finding 1: The current testing layer is a deterministic _measurement_ oracle, not a _specification_ layer

`packages/testing` is intentionally minimal:

| Element                                                         | Location                                                            | Purpose                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MeasurementTestRequirement`                                    | `packages/testing/src/schemas.ts:40`                                | Single-purpose Zod object with `check ∈ {boundingBox, connectedComponents, watertight}`.                                                                                                                                            |
| `analyzeGlb(glb)`                                               | `packages/testing/src/geometry/analyze-glb.ts:19`                   | Parses GLB → `{ vertexCount, meshCount, connectedComponents(t), watertight, boundingBox }`. Memoises connected-components per tolerance.                                                                                            |
| `evaluateRequirement(req, stats)`                               | `packages/testing/src/geometry/evaluate-requirement.ts:103`         | Pure function: stats × requirement → `{passed, reason, suggestion}`.                                                                                                                                                                |
| `testFileSchema`                                                | `packages/testing/src/schemas.ts:79`                                | `Record<sourcePath, { requirements: MeasurementTestRequirement[] }>`.                                                                                                                                                               |
| `CANONICAL_TEST_REQUIREMENTS_EXAMPLE` / `AVAILABLE_CHECKS_COPY` | `packages/testing/src/prompt-examples.ts:25,91`                     | Single-source-of-truth copy rendered identically into the system prompt and `edit_tests` description.                                                                                                                               |
| `kernel-geometry-testing.utils.ts`                              | `packages/runtime/src/testing/kernel-geometry-testing.utils.ts:270` | Kernel-author harness: `expectVertexCount` / `expectFaceCount` / `expectMeshCount` / `expectBoundingBox{Size,Center}` / `expectGeometry`. Vitest-only — never exposed to the LLM (per `mesh-continuity-test-semantics.md` R4 + R5). |

Every check is **mesh-only, kernel-agnostic, computed from glTF positions** (no `extras`, no scene metadata, no per-kernel cooperation). This is by design — see `connected-components.ts:42`:

```52:64:packages/testing/src/geometry/connected-components.ts
export const countConnectedComponents = (document: Document, toleranceMm: number): number => {
  const toleranceMeters = toleranceMm / 1000;
  const aabbs: Aabb[] = [];

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const pos = primitive.getAttribute('POSITION');
```

The contract is "future kernels emit valid glTF and the check works" — a SysML extension must preserve this.

### Finding 2: `test.json`'s per-file map is already a primitive form of "verification case binding"

The 2026-04-20 migration to a per-file map (`EVAL(multi-file-test-json)` in `cad-agent.prompt.ts:5`) makes each top-level key a _file-of-interest_ with an array of _requirements_. This is structurally one step away from SysML v2's verification case pattern:

```text
SysML v2:               Tau today:
verification case   ≈   entry in test.json keyed by source path
  verifies R-...    ≈   requirement.id (free string today)
  subject part      ≈   targetFile (the source unit producing the GLB)
  return PASS/FAIL  ≈   { passed, reason, suggestion }
```

The missing pieces are (a) the **requirement definition** (today inlined per measurement, not centralised), (b) the **part definition** (today implicit in the source file's top-level export), and (c) the **assembly relations** between parts (no analogue at all).

### Finding 3: `defineKernel` already exposes the hooks a SysML layer would need

| Hook                                                                        | Spec-layer use                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineKernel({ optionsSchema, renderSchema, exportSchemas })` Zod-only API | SysML attribute definitions become Zod `.describe()`-annotated fields in a per-part schema; the same Zod object drives `defaultParams` validation in source.                                |
| Middleware `getDependencies(input)` returning extra dependency paths        | A `sysml.middleware.ts` returns `[spec.sysml]` so editing the model invalidates the geometry cache.                                                                                         |
| Per-kernel `serializeHandle` / `deserializeHandle`                          | Not used directly by the spec layer, but useful if analysis cases need to re-hydrate native handles for mass/COM extraction (`replicad` exposes `Mass`, `Volume`, `CenterOfMass` via OCCT). |
| `parameterFileResolverMiddleware` reading `.tau/parameters/<entry>.json`    | Pattern to mirror for `.tau/spec/<entry>.sysml` → derived `test.json`.                                                                                                                      |

### Finding 4: `replicad` and `opencascade.js` already expose the geometry primitives needed for non-bbox analysis

| SysML check intent          | OCCT API (already in `repos/opencascade.js`)         | Replicad surface                                                                      |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Mass (with density)         | `BRepGProp_VolumeProperties` → `GProp_GProps.Mass()` | Reachable through `shape.wrapped` (Replicad keeps the OCCT shape on the JS object).   |
| Centre of mass              | `GProp_GProps.CentreOfMass()`                        | Same path; not yet wrapped in Replicad's TS API.                                      |
| Inertia tensor              | `GProp_GProps.MatrixOfInertia()`                     | Same path.                                                                            |
| Volume                      | `BRepGProp_VolumeProperties.Mass()` w/ density=1     | `shape.volume()` exists in upstream Replicad.                                         |
| Surface area                | `BRepGProp_SurfaceProperties`                        | `shape.area()`.                                                                       |
| Min distance between shapes | `BRepExtrema_DistShapeShape`                         | Not wrapped — would need a new Replicad helper or direct OCCT call inside the worker. |
| Interference (penetration)  | `BRepAlgoAPI_Common` non-empty                       | `a.intersect(b)` then `volume() > 0`.                                                 |

These all live behind `defineKernel`'s worker boundary so the LLM never invokes them directly. A new `analysis` requirement type would route to a kernel-side `analyzeShape(req)` RPC that returns a scalar; `evaluateRequirement` then compares against `expected`.

### Finding 5: SysML v2's verification-case pattern is a near-isomorphic upgrade of `testFileEntry`

SysML v2 (textual notation) verification cases:

```text
verification def Verify_Bracket {
  subject bracket : Bracket;
  return verdict : VerdictKind;
}

verification VerifyMountingFit specializes Verify_Bracket {
  verifies R_FIT_001;
  subject = bracket;
  return verdict = perform action checkBoundingBox(bracket, expected => 100mm);
}
```

Maps directly to:

```typescript
{
  "lib/bracket.ts": {
    requirements: [
      {
        id: 'R_FIT_001',          // requirement def id, was free-form
        type: 'measurement',
        check: 'boundingBox',
        expected: { size: { x: 100 } },
        tolerance: 1,
        // NEW: provenance
        verifies: 'R_FIT_001',     // explicit link to spec
        rationale: 'mounts to 100mm extrusion',
      }
    ]
  }
}
```

Adding `verifies` and `rationale` is non-breaking because both are optional fields, but it lets `test_model` failures surface the _requirement_ the LLM violated, not just the measurement.

### Finding 6: The current LEGO example illustrates the assembly gap concretely

`libs/tau-examples/src/kernels/replicad/lego/main.ts` defines 13 dimensional parameters and emits one fused `Shape3D`. There is **no expressible specification** for:

- _"`tubeInnerDiameter` must equal `studDiameter`"_ — a SysML constraint on attribute definitions, today an undocumented invariant.
- _"the brick mates with another LEGO brick of any width"_ — a SysML port (`LegoStudInterface { studDiameter; studPitch; }`) with conjugate matching.
- _"a 2×4 brick weighs 2.32 g ± 0.05 g at ABS density 1.05 g/cm³"_ — needs `analysis mass`.
- _"top studs and bottom tubes are coaxial"_ — needs interference / coaxiality analysis.

Today the only verifiable claim is "the brick is one watertight chunk with bounding box 16×32×9.6 mm".

### Finding 7: The agent has no plan-mode artifact for assemblies

The `<plan_mode>` block in `cad-agent.prompt.ts` requires plan edits to land in `.plan.md` (free-form prose). For assemblies this is too unstructured to grade or refine. SysML — even as a 50-line text artifact — gives plan mode a _typed_ output the next workflow step can consume mechanically.

## Recommendations

| #   | Action                                                                                                                                                                                              | Priority | Effort | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Extend `MeasurementTestRequirement` with optional `verifies: string` and `rationale: string` fields. No runtime change; failures gain provenance.                                                   | P0       | XS     | M      |
| R2  | Add an `AnalysisRequirement` discriminator (`type: 'analysis'`, `check ∈ {mass, volume, surfaceArea, centerOfMass, clearance, interference, coaxiality}`) to the `testRequirementSchema` union.     | P0       | M      | H      |
| R3  | Implement kernel-side `analyzeShape(req)` for `replicad` (volume, area, mass, COM via OCCT `GProp_GProps`) and route through a new `runAnalysisTests` service paralleling `runMeasurementTests`.    | P0       | L      | H      |
| R4  | Create `packages/spec` (`@taucad/spec`) owning the SysML v2 textual subset Tau cares about (Zod-first, mirroring `packages/testing` conventions). Compile target: derived `test.json`.              | P1       | L      | H      |
| R5  | Add a `compile_spec` agent tool that reads `spec.sysml` (or its Zod-shaped equivalent) and emits `test.json` deterministically. The agent edits the spec, never the derived file.                   | P1       | M      | H      |
| R6  | Promote `id` strings to `idPrefix.requirement` / `idPrefix.verification` via `@taucad/utils/id` so requirement provenance is grep-able across transcripts.                                          | P1       | S      | M      |
| R7  | Add a `connections` block (assembly-level requirements between `targetFile`s) to the new schema; render as a top-level entry in `test.json` so failures group by connection rather than file.       | P2       | M      | H      |
| R8  | Document the SysML subset and the spec → test.json compilation rules in `docs/policy/spec-policy.md` (single source of truth for prompt and DX).                                                    | P2       | S      | M      |
| R9  | Extend `kernel-geometry-testing.utils.ts` with `expectMass`, `expectClearance`, `expectInterference` helpers for kernel authors so the in-package harness stays in lockstep with the agent surface. | P2       | M      | M      |
| R10 | Wire spec edits into `getDependencies` so editing `spec.sysml` invalidates the geometry cache (mirrors `parameterFileResolverMiddleware`).                                                          | P2       | S      | M      |
| R11 | Add an `analysis case` concept (SysML v2 idiom) for _non-PASS/FAIL_ scalar reporting (mass, COM coordinates) — surfaces in test results UI but doesn't gate.                                        | P3       | M      | M      |
| R12 | Future: Generate Replicad scaffolds from a SysML model (`part def` → file with typed `defaultParams` and `port` typed adapters). Listed as future direction; out of scope for the first cut.        | P3       | XL     | H      |

## Trade-offs

### Spec layer location

| Option                                | Pros                                                                                                                                                             | Cons                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Inside `packages/testing`**         | Zero new package; existing consumers see one schema.                                                                                                             | Conflates "deterministic geometry oracle" with "spec authoring"; violates the package's tight scope (`packages/testing/README.md` is 1 line: "Geometry analysis"). |
| **New `packages/spec` (recommended)** | Mirrors `packages/testing`'s focused scope; SysML changes don't ripple into the analyser. `packages/testing` continues to consume only the compiled `test.json`. | One more publishable package and one more `defineX`-shaped API.                                                                                                    |
| **Inside `@taucad/runtime`**          | Co-located with `defineKernel` so spec ↔ kernel coupling is implicit.                                                                                            | Couples a non-runtime concern to the worker boundary; bloats the runtime bundle for the CLI / non-agent consumers.                                                 |

### Surface for the LLM: SysML text vs typed object literal

| Option                                                                            | Pros                                                                                                                                                                                                  | Cons                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Raw SysML v2 textual notation** (`.sysml` file)                                 | Standard, portable to other SysML tooling. Future MBSE interop.                                                                                                                                       | Adds a parser; LLMs are weaker at SysML grammar than JSON; new failure modes (parse errors). |
| **Zod-shaped JSON / TS** (recommended for v1)                                     | Reuses TipTap composer, Monaco IntelliSense, existing `edit_file` tool. Zero new parsers.                                                                                                             | Not standards-compliant SysML; locks Tau into a Tau-flavoured subset.                        |
| **Hybrid**: TS module exporting `defineSpec({...})` (recommended target after v1) | Type-safe authoring; analogous to `defineKernel` author API. The spec is a real source file, lintable, version-controllable. Generates `test.json` _and_ could be re-rendered as `.sysml` for export. | More machinery than v1; needs a `defineSpec` helper.                                         |

### Analysis cost vs caching

The new analysis checks (mass, COM, clearance) require OCCT computation, not glTF parsing. Cost ranges from ~1 ms (volume on a small shape) to ~100 ms (`BRepExtrema_DistShapeShape` on complex assemblies). Recommendation: results are pure functions of the rendered shape, so they can be appended to the existing geometry-cache middleware envelope keyed on `dependencyHash` ∪ `analysisRequirementHash`.

### Backward compatibility

Per `Learned Workspace Facts` ("no backwards compatibility for unreleased/internal APIs"), `MeasurementTestRequirement` can be extended in place. The recommended additions (`verifies`, `rationale`, the `AnalysisRequirement` discriminator) are strictly additive at the Zod level, so historical `test.json` files keep validating.

## Code Examples

### E1: SysML v2 textual notation (target)

```text
package LegoBrick {
  import ScalarValues::*;

  attribute def Length :> Real { unit = millimetre; }
  attribute def Density :> Real { unit = gram_per_cubic_centimetre; }

  part def Stud {
    attribute diameter : Length = 4.8 [mm];
    attribute height   : Length = 1.8 [mm];
  }

  port def StudInterface {
    out attribute pitch    : Length;
    out attribute diameter : Length;
  }

  part def Brick {
    attribute width        : Integer = 2;
    attribute length       : Integer = 4;
    attribute heightUnits  : Length  = 1 [unit];
    attribute material     : Density = 1.05 [g_per_cm3];

    part studs : Stud[16];

    port topStuds : StudInterface = StudInterface(pitch = 8 [mm], diameter = 4.8 [mm]);

    requirement R_DIM_001 {
      doc /* Brick footprint matches LEGO unit grid. */
      assume bounding_box.size.x == width  * 8 [mm];
      assume bounding_box.size.y == length * 8 [mm];
      assume bounding_box.size.z == heightUnits * 9.6 [mm];
    }

    requirement R_FIT_001 {
      doc /* Top studs and bottom tubes are coaxial within 0.1mm. */
      require coaxial(topStuds, bottomTubes) within 0.1 [mm];
    }

    requirement R_MASS_001 {
      doc /* 2×4 brick at ABS density weighs 2.32 g ± 0.05 g. */
      require mass(self) within 2.32 [g] +/- 0.05 [g];
    }
  }

  verification def VerifyDim verifies R_DIM_001 {
    subject brick : Brick;
    perform action measurement {
      check = boundingBox;
      expected.size = { x = brick.width * 8, y = brick.length * 8, z = brick.heightUnits * 9.6 };
      tolerance = 1 [mm];
    }
  }

  verification def VerifyMass verifies R_MASS_001 {
    subject brick : Brick;
    perform action analysis {
      check = mass;
      expected = 2.32 [g];
      tolerance = 0.05 [g];
    }
  }
}
```

### E2: Compiled `test.json` (what `compile_spec` produces)

```json
{
  "lib/brick.ts": {
    "requirements": [
      {
        "id": "R_DIM_001",
        "type": "measurement",
        "check": "boundingBox",
        "description": "Brick footprint matches LEGO unit grid",
        "expected": { "size": { "x": 16, "y": 32, "z": 9.6 } },
        "tolerance": 1,
        "verifies": "R_DIM_001",
        "rationale": "Brick footprint matches LEGO unit grid."
      },
      {
        "id": "R_MASS_001",
        "type": "analysis",
        "check": "mass",
        "description": "2x4 brick at ABS density weighs 2.32 g +/- 0.05 g",
        "expected": { "value": 2.32, "unit": "g", "density": 1.05 },
        "tolerance": 0.05,
        "verifies": "R_MASS_001"
      },
      {
        "id": "R_FIT_001",
        "type": "analysis",
        "check": "coaxiality",
        "description": "Top studs and bottom tubes are coaxial within 0.1mm",
        "expected": { "axis": "z", "groupA": "top_studs", "groupB": "bottom_tubes" },
        "tolerance": 0.1,
        "verifies": "R_FIT_001"
      }
    ]
  }
}
```

### E3: Extended Zod schemas (R1 + R2)

```typescript
import { z } from 'zod';

const provenance = z.object({
  verifies: z.string().optional().describe('SysML requirement def id this check verifies'),
  rationale: z.string().optional().describe('Why this requirement exists (sourced from spec doc)'),
});

const measurementTestRequirementSchema = baseTestRequirementSchema
  .extend({
    type: z.literal('measurement'),
    check: z.enum(['boundingBox', 'connectedComponents', 'watertight']),
    expected: z.record(z.string(), z.unknown()).optional(),
    tolerance: z.number().optional(),
  })
  .merge(provenance);

const analysisTestRequirementSchema = baseTestRequirementSchema
  .extend({
    type: z.literal('analysis'),
    check: z.enum(['mass', 'volume', 'surfaceArea', 'centerOfMass', 'clearance', 'interference', 'coaxiality']),
    expected: z.record(z.string(), z.unknown()),
    tolerance: z.number().optional(),
  })
  .merge(provenance);

const testRequirementSchema = z.discriminatedUnion('type', [
  measurementTestRequirementSchema,
  analysisTestRequirementSchema,
]);
```

### E4: The kernel-side analyser hook (Replicad)

```typescript
// packages/runtime/src/kernels/replicad/replicad.analysis.ts (new)
import type { AnalysisTestRequirement } from '@taucad/testing';

export const analyzeShape = async (
  shape: ReplicadShape,
  req: AnalysisTestRequirement,
): Promise<{ actual: unknown }> => {
  switch (req.check) {
    case 'mass': {
      const density = (req.expected as { density: number }).density;
      const props = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_1(shape.wrapped, props, true, false, false);
      // OCCT volume in mm³; density in g/cm³ → mass in g
      return { actual: (props.Mass() / 1000) * density };
    }
    case 'centerOfMass': {
      /* GProp_GProps.CentreOfMass() */
    }
    case 'clearance': {
      /* BRepExtrema_DistShapeShape between two named handles */
    }
    /* ... */
  }
};
```

The agent never sees this code; it only sees the `analysis` check vocabulary in `AVAILABLE_CHECKS_COPY`.

## SysML v2 ↔ Tau Element Map

| SysML v2 textual element     | Tau analogue today                               | Proposed Tau analogue                                                                                       |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `package`                    | Project root                                     | Project root (no change)                                                                                    |
| `attribute def` (with unit)  | `defaultParams` keys (numbers, no unit metadata) | Zod schema in `spec.ts` with `.describe()` carrying unit; flows into `defineKernel({ optionsSchema })`.     |
| `part def`                   | Source file with top-level export                | Source file with top-level export, **declared** in `parts:` block of `spec.ts`.                             |
| `part` instance              | Function call returning a `Shape3D`              | Same; named for traceability via `as 'partName'`.                                                           |
| `port def` / `port`          | (none — implicit in geometry)                    | New `port:` block emitting analyser tags so clearance/coaxiality checks can reference named feature groups. |
| `interface def`              | (none)                                           | Optional `interfaces:` block: pairs of conjugate `port`s.                                                   |
| `connection`                 | (none)                                           | Top-level `connections:` block in `test.json` for cross-file analysis cases.                                |
| `requirement def`            | `id` string + `description` on each requirement  | First-class top-level `requirements:` block; verification cases bind by id.                                 |
| `verification case`          | Entry in `test.json`'s per-file map              | Same, with `verifies: <requirement-id>` link.                                                               |
| `analysis case`              | (none — only PASS/FAIL today)                    | Result-style `AnalysisRequirement` returning a scalar surfaced in test results UI.                          |
| `view def` / `viewpoint def` | Existing `apps/ui` panes                         | Out of scope (UI concern, not verification).                                                                |
| `usage` (composition)        | `import` + function call                         | Same; spec layer infers from the source AST when generating reports.                                        |

## Diagrams

### D1: Spec → Test → Geometry pipeline (target)

```text
  ┌──────────────┐  edit_spec   ┌─────────────────┐
  │ spec.sysml   │◄────────────│  Agent / Plan   │
  │ (or spec.ts) │              │  Mode           │
  └──────┬───────┘              └─────────────────┘
         │ compile_spec (deterministic)
         ▼
  ┌──────────────┐
  │ test.json    │  (per-file requirements map; provenance via `verifies`)
  └──────┬───────┘
         │ test_model
         ▼
  ┌──────────────────────────────┐    ┌────────────────────────┐
  │ runMeasurementTests          │───►│ analyzeGlb (gltf only) │
  │ runAnalysisTests   (NEW)     │───►│ analyzeShape (kernel)  │
  └──────┬───────────────────────┘    └────────────────────────┘
         ▼
  ┌──────────────┐
  │ TestModel    │  failures tagged with both `targetFile` and `verifies` (R-id)
  │ Output       │
  └──────────────┘
```

### D2: Where the new artefacts live

```text
project-root/
├── spec.ts                  ← NEW — defineSpec({...}); single source of truth
├── test.json                ← derived (gitignored or committed; preference TBD)
├── lib/
│   ├── brick.ts             ← part def "Brick" implementation
│   └── plate.ts             ← part def "Plate" implementation
└── .tau/
    ├── parameters/...       ← existing
    └── spec/                ← optional cache of compiled artefacts
```

## Agent Workflow Changes

1. **Plan mode** (read-only) authors `spec.ts` only. The plan artefact is now typed, not free-form prose.
2. **Agent mode** runs `compile_spec` → writes `test.json` → writes / edits source files → runs `test_model`.
3. **Failure path** — `test_model` failures now reference `verifies: R_FIT_001`; the agent can `read_file` the spec to recover the rationale before deciding whether to weaken the test (forbidden) or fix the source (correct).
4. **Tool diff**:

| Tool                        | Status                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `edit_tests`                | Restricted to projects without `spec.ts`; emits a deprecation hint. |
| `compile_spec` (NEW)        | `compile_spec()` → reads `spec.ts`, validates, emits `test.json`.   |
| `edit_spec` (NEW, optional) | Search-replace edits on `spec.ts` (mirrors `edit_file` pattern).    |
| `test_model`                | Unchanged surface; gains analysis check support transparently.      |

## Implementation Phasing

| Phase   | Scope                                                                                         | Exit criterion                                                                                      |
| ------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **P-0** | R1 only: extend `MeasurementTestRequirement` with `verifies` + `rationale` fields.            | Provenance in test failures end-to-end; benchmark suite green.                                      |
| **P-1** | R2 + R3: add `analysis` discriminator and Replicad mass/volume/area/COM analysers.            | New benchmark cases assert `mass` on a known-density part.                                          |
| **P-2** | R4 + R5 + R6: ship `@taucad/spec` (Zod-first, no SysML parser yet); ship `compile_spec` tool. | LEGO example has `spec.ts` whose compile output matches its hand-written `test.json`.               |
| **P-3** | R7 + R10: connections block + cache invalidation via middleware `getDependencies`.            | Editing `spec.ts` re-renders only when geometry-relevant fields change.                             |
| **P-4** | R8 + R9: policy doc + kernel-author harness parity helpers.                                   | `docs/policy/spec-policy.md` ratified; `kernel-geometry-testing.utils.ts` exposes `expectMass` etc. |
| **P-5** | R11 + R12: SysML v2 textual notation parser/exporter; analysis-case scalar reporting in UI.   | Round-trip `.sysml` ↔ `spec.ts`; UI surfaces non-gating analysis results.                           |

## References

- OMG SysML v2 specification (Beta 2 textual notation): https://www.omg.org/spec/SysML/2.0/Beta2
- SysML v2 Pilot Implementation: https://github.com/Systems-Modeling/SysML-v2-Pilot-Implementation
- KerML (Kernel Modeling Language): https://www.omg.org/spec/KerML/1.0/Beta2
- Tau testing package: `packages/testing/src/schemas.ts`, `packages/testing/src/geometry/*.ts`
- Tau test_model tool: `apps/api/app/api/tools/tools/tool-test-model.ts`
- Tau edit_tests tool: `apps/api/app/api/tools/tools/tool-edit-tests.ts`
- Tau cad-agent prompt (`<test_requirements>` block): `apps/api/app/api/chat/prompts/cad-agent.prompt.ts`
- OpenCASCADE `GProp_GProps`, `BRepGProp`, `BRepExtrema_DistShapeShape` reference: https://dev.opencascade.org/doc/refman/html/
- Replicad shape API: `repos/replicad/packages/replicad/src/Shape.ts`
- Related: `docs/research/mesh-continuity-test-semantics.md` (R4 + R5 — single-vocabulary contract)
- Related: `docs/research/parameter-architecture-v2.md` (parameter file pattern this proposal mirrors)
- Related: `docs/research/import-test-geometry-deviation-audit.md` (round-trip cube fixture pattern)

## Appendix A — Why not "just use comments / JSDoc tags"?

Tau already enforces `jsdoc-policy.md` for `@public` JSDoc on `libs/` + `packages/`. Embedding requirements in JSDoc is tempting because it co-locates spec with code, but it conflates three different audiences:

1. The IntelliSense consumer (wants type signatures + brief description).
2. The code reviewer (wants implementation rationale).
3. The verification engine (wants typed, parsable, queryable predicates).

SysML v2 separates audience #3 cleanly. JSDoc stays for #1 and #2; the spec layer owns #3 with a typed schema instead of free-form prose.

## Appendix B — Why not push everything into Zod schemas of `defineKernel({ optionsSchema })`?

`defineKernel({ optionsSchema })` already accepts Zod and generates a JSON Schema for the parameter UI. It is _the_ ergonomic place to declare attribute-level invariants like ranges. But it cannot express:

- **Cross-attribute constraints** (`tubeInnerDiameter == studDiameter`) — Zod's `.refine` works but loses traceability and rationale.
- **Inter-part relations** (one file's geometry must clear another's) — Zod is per-schema, not cross-schema.
- **Verification provenance** (which spec line produced which test) — Zod schemas don't carry an `id` per refine.

The recommendation is **complementary**: Zod owns per-attribute validation (with units in `.describe()`), the spec layer owns inter-attribute / inter-part / verification-case modelling.
