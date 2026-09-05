---
title: 'GeoSpec Policy'
description: 'Rules for GeoSpec matcher API design, evidence naming, diagnostics, failure messages, C++/WASM implementation, and high-assurance geometry test authoring.'
status: active
created: '2026-06-23'
updated: '2026-09-05'
related:
  - docs/policy/library-api-policy.md
  - docs/policy/testing-policy.md
  - docs/policy/brep-policy.md
  - docs/policy/geometry-naming-policy.md
  - docs/research/geospec-hybrid-wasm-matcher-architecture.md
  - docs/research/geospec-production-assertions-audit.md
  - docs/research/geospec-production-assertions-catalog.md
  - docs/research/geospec-v2-wave1-canonical-engine-closeout-blueprint.md
  - docs/research/v8-engine-brep-current-manufacturability-audit.md
---

# GeoSpec Policy

Internal reference for designing and authoring GeoSpec geometry assertions. GeoSpec is a geometry specification testing library for agents and engineers, spanning **mesh-only kernels** (e.g. OpenRSCAD, JSCAD) and **exact-BRep kernels** (e.g. replicad/OpenCascade). Its APIs must be semantically small, evidence-backed, and diagnostic-rich. A failing GeoSpec assertion should tell the next agent exactly what failed, where it failed, and which geometry relationship should be repaired.

## Rationale

CAD tests fail differently from ordinary unit tests. A scalar message such as "expected 1 component, got 3" forces the agent to mentally reconstruct a 3D assembly from source transforms. That is the wrong workload split. GeoSpec owns deterministic geometry evidence; it must return names, selectors, bounding boxes, centers, witness points, measured values, tolerances, and likely repair targets.

GeoSpec APIs must also avoid matcher sprawl. High-assurance geometry validation needs many concepts, but those concepts should be expressed through a compact set of semantic matcher families, typed options, selector evidence, and reusable recipes. Do not add a top-level matcher for every domain part.

Relationship assertions must be evidence-honest. Axis-aligned bounding boxes are broad-phase and diagnostic evidence only; they must not become the final pass/fail proof for production contact, clearance, containment, mating, fastener, port, shaft/bore, or manufacturability relationships.

## 1. Name Matchers By Eigenquestion

Name each matcher after the engineering question it answers. Avoid subjective terms such as "quality" unless the matcher really grades a subjective quality score. Prefer integrity, validity, structure, occurrence, and relationship language.

| Eigenquestion                                                                                                  | Preferred API                                                               | Avoid                                                                       |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Is the rendered mesh evidence internally trustworthy?                                                          | `toHaveMeshIntegrity({ ... })`                                              | `toHaveMeshQuality({ ... })`                                                |
| Does exact BRep evidence pass validity/integrity constraints?                                                  | `toBeValidBrep({ ... })`; add `toHaveBrepIntegrity({ ... })` only if needed | `toHaveBrepQuality({ ... })`                                                |
| Does the product tree contain the expected products?                                                           | `toHaveProductStructure({ ... })`                                           | `toHaveAssemblyStructure({ ... })` for product-tree checks                  |
| Do named instances exist with expected placement and metadata?                                                 | `toHaveAssemblyOccurrences({ ... })`                                        | Product-structure matchers that also check transforms                       |
| Do selected entities satisfy declared contacts, clearances, axes, and mates using relationship-grade evidence? | `toHaveSpatialRelationships({ ... })`                                       | One matcher per domain-specific relationship; AABB-only relationship checks |
| Does an advanced test need raw facts/selectors?                                                                | `inspectGeometry({ subject, selectors, evidence })`                         | Many low-level `toHaveFace...` escape hatches                               |

```typescript
// CORRECT: the matcher says the evidence must be internally trustworthy.
expectGeo(model).toHaveMeshIntegrity({
  degenerateTriangles: { count: 0 },
  duplicateFaces: { count: 0 },
});

// INCORRECT: "quality" implies an overall high/low grade, not a concrete integrity contract.
expectGeo(model).toHaveMeshQuality({ degenerateTriangles: 0 });
```

## 2. Keep The Public Matcher Surface Compact

Express broad concepts through typed data on a small number of matchers. Do not create narrow public matchers for each mechanical subsystem unless repeated use proves the generic surface is too verbose.

```typescript
// CORRECT: a fastening interface is a recipe over generic occurrence and relationship data.
expectGeo(model).toHaveSpatialRelationships({
  relationships: [
    { kind: 'coaxial', subject: 'fastener[7].shaft', target: 'mountHole[7]', tolerance: 0.05 },
    { kind: 'contact', subject: 'fastener[7].cap.seat', target: 'mountPlate.boss[7]', tolerance: 0.02 },
  ],
});

// INCORRECT: every domain detail becomes a top-level matcher.
expectGeo(model).toHaveSpecificFastenerEngagement(...);
expectGeo(model).toHaveSpecificFastenerSeatContact(...);
```

Domain helpers such as `createFastenerEngagement({ ... })` or `createPortConnection({ ... })` may be added later as recipe builders if they remove repeated boilerplate. They should return data for generic matchers, not bypass the generic model.

Use neutral example selectors in policy text. Reserve fixture-specific selectors for research docs, example docs, and test fixtures where the named model is the subject.

| Example Need                          | Prefer                                                      | Avoid In Policy Examples                   |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Generic fastening interface           | `fastener[7].shaft`, `mountHole[7]`, `fastener[7].cap.seat` | Fixture-specific fastener family names.    |
| Generic rotating or sliding interface | `shaft[1]`, `bearing[1]`, `guideRail[1]`                    | Fixture-specific moving-mechanism names.   |
| Generic enclosure or support          | `housing`, `bracket`, `mountPlate`                          | One-off part names from a current fixture. |
| Generic fluid or routed interface     | `portAdapter[2]`, `manifoldPort[2]`                         | Fixture-specific routed-system names.      |

## 3. Use One Flat Options Object

Follow the [Library API Policy](library-api-policy.md). Public GeoSpec functions and matchers should use one flat options object when arguments describe the same concern. Use discriminated `kind` unions for variants.

```typescript
// CORRECT: one operation data object.
expectGeo(model).toHaveSpatialRelationships({
  relationships: [
    {
      kind: 'clearance',
      subject: 'shaft[3]',
      target: 'bearing[3]',
      min: 0.05,
      max: 0.25,
      tolerance: 0.02,
    },
  ],
});

// INCORRECT: same-concern data split across positional arguments.
expectGeo(model).toHaveClearance('shaft[3]', 'bearing[3]', 0.05, 0.25);
```

## 4. Separate Product Structure, Occurrences, And Spatial Relationships

Do not overload one matcher with several architectural concerns.

| Concern               | Owns                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Product structure     | Product names, BOM counts, product paths, STEP/XDE product metadata.                                                      |
| Assembly occurrences  | Occurrence names, transforms, instance identity, per-occurrence bounds, materials/colors/layers.                          |
| Spatial relationships | Contact, clearance, coaxiality, coplanarity, parallelism, perpendicularity, containment, intentional interference, mates. |

`toHaveProductStructure({ ... })` should not become a transform or contact matcher. `toHaveAssemblyOccurrences({ ... })` should not become a clearance matcher. `toHaveSpatialRelationships({ ... })` should not become a BOM matcher.

## 5. Keep Evidence Requirements Explicit

Every matcher must state and enforce the evidence it needs. If evidence is missing, return an unsupported-evidence diagnostic instead of silently falling back to weaker evidence.

```typescript
// CORRECT: exact constraints request exact evidence.
expectGeo(stepSubject).toBeValidBrep({ maxTolerance: 0.01 });

// CORRECT: mesh constraints request rendered evidence.
expectGeo(glbSubject).toHaveMeshIntegrity({ finitePositions: true });
```

Evidence routing is engine-owned and deterministic by subject capability. When BRep evidence exists, a scalar or exact relationship matcher uses it; mesh evidence answers only mesh-grade claims or genuinely mesh-only subjects. Do not expose an author-visible `evidence` selector: it makes backend choice part of intent and permits callers to weaken the proof without changing the engineering question. Provenance reports which evidence answered. If two representations answer different questions, use separate options or separate matchers.

## 6. Use AABB Only As Broad-Phase Relationship Evidence

Use axis-aligned bounding boxes only for broad-phase candidate pruning, explicit envelope assertions such as `toHaveBoundingBox`, and diagnostic context. Never use AABB overlap, AABB containment, or AABB gap as the final pass/fail evidence for production relationship kinds such as `contact`, `clearance`, `containment`, `mate`, `coaxial`, fastener engagement, port connection, shaft/bore fit, or manufacturability checks.

Production relationship matchers must use exact BRep/topology evidence or a real narrow-phase mesh/surface analysis such as surface distance, solid interference, analytic axis/plane facts, or OCCT extrema. If the required relationship evidence is unavailable, return an unsupported-evidence diagnostic instead of falling back to AABB.

`toHaveBoundingBox` remains valid only as an explicit envelope assertion. It does not prove that parts touch, clear, contain, mate, assemble, seal, fasten, or meet manufacturability constraints.

Approximate or diagnostic-only checks must be named as such. Do not give an AABB-only helper a production relationship name.

```typescript
// CORRECT: relationship semantics require relationship-grade evidence.
expectGeo(model).toHaveSpatialRelationships({
  relationships: [
    {
      kind: 'contact',
      subject: 'fastener[7].cap.seat',
      target: 'mountPlate.boss[7]',
      tolerance: 0.02,
      // The matcher implementation must verify real surface/feature contact,
      // not merely overlapping occurrence bounding boxes.
    },
  ],
});

// CORRECT: bounding boxes can still assert explicit envelope intent.
expectGeo(model).toHaveBoundingBox({
  size: { x: 120, y: 80, z: 40 },
  tolerance: 0.1,
});

// INCORRECT: AABB gap/overlap is not a production contact proof.
const touching = boundsGap(componentA.bounds, componentB.bounds).gap === 0;
```

## 7. Emit Agent-Actionable Diagnostics

Every failing diagnostic must include enough information for an agent to localize the defect without mentally re-deriving the model.

Required fields for all matcher diagnostics:

1. A stable `code`.
2. `severity: 'error' | 'warning' | 'info'`.
3. A concise `message` with expected versus actual values.
4. A `suggestion` that names the likely repair target.
5. Structured `details` containing expected, actual, evidence type, source, unit, and parameters when available.
6. `spatial` evidence when the failure has a location.

Required spatial details by failure family:

| Failure Family         | Required Diagnostic Evidence                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bounding box           | Failing axes, expected/actual values, tolerance, full bounds, dominant primitive at min/max extremum.                                                        |
| Connected components   | Component count, cluster names, per-cluster bbox min/max/center, nearest gap, tolerance.                                                                     |
| Watertightness         | Irregular edge counts, edge kind, owning primitive names, edge cluster bbox, representative samples.                                                         |
| Component interference | Pair names, intersection volume, witness point, pair bounds, tolerance, checked/selected pair counts.                                                        |
| Spatial relationship   | Relationship kind, subject selector, target selector, evidence type, narrow-phase algorithm, measured value, tolerance, witness points, axes/normals/frames. |
| BRep feature           | Candidate feature summaries, nearest misses, expected constraints, source/STEP context.                                                                      |
| BRep validity          | Failed check kind, subshape selector/path, location if available, OCCT status, source context.                                                               |

```typescript
// CORRECT: the message and details point to the repair.
{
  code: 'GEOSPEC_COMPONENT_INTERFERENCE_DETECTED',
  message: "Component interference detected: 'Moving Link 3' intersects 'Housing' by 184.2mm^3 near [132, -48, 26].",
  suggestion: "Move 'Moving Link 3' inside the declared clearance envelope or update 'Housing' clearance geometry at the reported witness point.",
  spatial: { center: [132, -48, 26] },
  details: { expected: { tolerance: 0.05 }, actual: { leftLabel: 'Moving Link 3', rightLabel: 'Housing', intersectionVolume: 184.2 } }
}

// INCORRECT: scalar-only and not actionable.
{
  code: 'GEOSPEC_COMPONENT_INTERFERENCE_DETECTED',
  message: 'Component interference detected between 12 pairs.'
}
```

## 8. Make Diagnostics Structured And Test Them Structurally

Tests for new matchers must assert diagnostic structure, not only prose snippets. Prefer `toMatchObject` on `code`, `details`, selectors, measured values, and spatial fields. Avoid regex-only assertions for important behavior.

```typescript
// CORRECT: asserts the stable contract.
expect(diagnostic).toMatchObject({
  code: 'GEOSPEC_SPATIAL_RELATIONSHIP_MISMATCH',
  details: {
    relationship: { kind: 'coaxial', subject: 'shaft[1]', target: 'bearing[1]' },
    actual: { radialOffset: expect.any(Number) },
  },
});

// INCORRECT: brittle and too weak.
expect(diagnostic.message).toMatch(/coaxial/);
```

## 9. Treat Whole-Assembly Interference As A High-Assurance Gate

A high-assurance mechanical assembly must have zero unclassified positive-volume overlaps. Require whole-assembly overlap checks by default for high-assurance fixtures. Selected pair checks are useful for regression tests, but they do not certify an assembly.

Intentional interference or compression must be explicit, selected, and bounded. Examples include modeled thread engagement, press fits, gasket compression, or rubber seals. Broad unclassified overlap is a failure.

## 10. Prefer Exact BRep Evidence For Manufacturing Intent

Use mesh evidence for rendered geometry integrity, spatial localization, and visual/export regressions. Use BRep/STEP evidence for exact validity, analytic features, topology, units, product structure, and manufacturing constraints. High-assurance suites should use both.

```typescript
// CORRECT: exact part evidence plus rendered assembly evidence.
expectGeo(partStep).toBeValidBrep({ maxTolerance: 0.01 });
expectGeo(assemblyGlb).toHaveNoComponentInterference({ tolerance: 0.05 });
```

## 11. Design For Agents As Primary Failure Consumers

GeoSpec failures should read like a compact debugging brief. Prefer names and geometry facts over vague advice.

CORRECT:

- "Seat 'Fastener 7' on 'Mount Plate' by lowering it 6.4mm along the fastener axis."
- "Increase housing clearance or move 'Moving Link 5' because its overlap witness with 'Housing' is near [x, y, z]."
- "Attach 'Port Adapter 2' to 'Manifold Port 2' or update the port-contact expectation."

INCORRECT:

- "Check geometry."
- "Adjust the model."
- "Maybe there is overlap."

## 12. Keep Matchers Provider-Agnostic

GeoSpec must derive generic geometry diagnostics from geometry evidence, not kernel-specific metadata. Kernel provenance may appear in `details`, but matcher behavior should not branch on Replicad, OpenRSCAD, JSCAD, KCL, or OpenCascade source identities.

Exception: runtime-originated diagnostics may preserve generic runtime issue codes such as `GEOMETRY_INVALID`; kernel identity belongs in structured provenance fields.

## 13. Preserve Performance Through Shared Analysis Records

Matchers should reuse parsed geometry and analysis records. Avoid re-parsing GLB/STEP or re-running native analysis for each assertion in the same test subject. Add caches at the analysis layer, not hidden state in individual matchers.

New matchers must document expected cost and should prefer native or indexed analysis for expensive geometry work. Whole-assembly overlap, distance, and selector relationship checks must expose checked-pair counts or analysis profile details when useful. AABB, BVH, grid, R-tree, or other acceleration structures may reduce candidate sets, but final production relationship decisions must be made by the required narrow-phase evidence.

## 14. Provide Red And Green Fixture Tests For Every New Matcher

Every public matcher addition must include:

1. A passing fixture that proves the matcher accepts valid geometry.
2. A failing fixture that proves the matcher reports the intended diagnostic.
3. An adversarial false-positive fixture whenever broad-phase or approximate evidence exists, such as overlapping AABBs with non-mating surfaces or aligned envelopes with misaligned analytic features.
4. An unsupported-evidence fixture.
5. A malformed-expectation fixture.
6. At least one integration test when the matcher is intended for `loadModel(...)` source workflows.

Matcher tests must assert the diagnostic evidence type and measured narrow-phase result. A test that only proves AABB-derived values are present is insufficient for production relationship semantics.

## 15. Author High-Assurance Fixtures As Specifications, Not Smoke Tests

High-assurance fixture suites must include:

1. Product structure and occurrence counts.
2. Whole-assembly no-overlap with explicit intentional allowances.
3. Per-subassembly no-overlap where it localizes failures.
4. Per-part BRep validity and rendered mesh integrity.
5. Mechanical interface relationships for shafts, bores, pins, rods, fasteners, gaskets, ports, covers, and manifolds, proven by relationship-grade evidence rather than AABB proxies.
6. Parameterized cases that protect clearances and product structure.
7. Failure diagnostics that an agent can act on without screenshots.

Explicit bounding-box assertions are envelope checks only. AABB evidence is broad-phase or diagnostic-only for relationships and must never be cited as proof of contact, clearance, containment, mating, manufacturability, or assembly readiness.

## 16. Optimize For Accuracy First, Performance Second

Choose the most accurate and robust algorithm for a matcher first; make it fast second. A faster wrong or unfalsifiable verdict is worse than a slower correct one, and an operation that fails, hangs, or silently degrades on valid input yields no verdict at all — the least accurate outcome. Robustness and determinism are part of accuracy, not separate concerns: the same input must always produce the same verdict, and valid input must never crash or stall the run.

**Why**: GeoSpec is a proof engine whose verdicts gate high-assurance manufacturing decisions, so correctness and reliability dominate speed.

CORRECT:

```typescript
// A robust, exact/near-exact geometry operation, even at higher cost.
const verdict = native.proveVoidTopology({ material, region, path, minCrossSection });
```

INCORRECT:

```typescript
// A fast discretized approximation that can silently pass a too-narrow void.
const open = voxelFloodFill(region, resolution); // resolution-dependent; unfalsifiable at tight passages
```

### Deterministic verdict and evidence rules

- Charge verdict-bearing work in deterministic work units. A wall-clock watchdog reports infrastructure failure and never selects a geometry verdict or fallback engine.
- Engine selection and retry order are pure functions of the claim and evidence. They must not depend on remaining shared budget, cache history, or machine timing. Shared budget exhaustion reports `MATCHER_TIMEOUT`.
- Keep persistent evidence outside the project under test. Cache keys include content identity, every read argument, and an engine-family version. Different byte-producing engines use different family versions. Never cache failures, unsupported results, or exhausted-budget outcomes; a tolerance-free key may store only a payload identical at every claim tolerance.
- Treat native OpenCascade as a process-local shared resource. Dispose run resources idempotently, make lazy facade `delete` and `isDeleted` independent of materialization, and copy borrowed `HEAPF64` data before any `await`.
- Approximate winding membership near a surface requires true point-to-triangle distance or an equivalent separation certificate. Closedness prefilters require exact-weld edge counts, use winding magnitude for orientation-independent membership, and fall through to the canonical proof on uncertainty.
- Persist eagerly consumed STEP/XDE structure by artifact identity while keeping the native read handle lazy. Resolve the derived structure during load so parse failures remain load-fatal. Install optional capabilities from the materialized native handle, and keep cache-hit reads unmaterialized until a geometry operation actually needs them.
- Link shared globals emitted into every native wrapper translation unit with weak linkage; strong linkage duplicates symbols and translation-unit-local state silently forks ownership.
- Compute selector face boxes with `BRepBndLib::Add(..., useTriangulation=false)` so prior tessellation of a shared TShape cannot change exact evidence. Select ambiguous STEP occurrences by exact `path:`.
- Require exact bit-level output for parity-sensitive floating-point accumulation. Keep a spawned CLI or browser end-to-end gate for the real package wire instead of accepting only in-process tests.

The removed `GEOSPEC_*` engine, cache, native-singleton, and forensic controls are historical evidence only. Do not restore environment-dependent verdict paths. Compare deterministic work counters before attributing a timing change to the implementation; a machine-load threshold alone is not evidence.

## 17. Prefer Exact Geometry Over Discretized Sampling

Answer a geometric or topological question with geometry operations — boolean, connected-component decomposition, generalized winding-number classification, planar section, or exact point classification — not with voxel grids, uniform lattices, or image processing over a discretized field. Voxel evidence must never participate in a final GeoSpec verdict. A correctness-preserving broad phase may prune work, but uncertainty must fall through to the canonical proof rather than becoming a sampled verdict.

**Why**: Sampling approximates an exact question, introducing resolution-dependence and aliasing — a sub-cell wall tunnels through, a sub-cell void disappears — while the exact operation is both more correct and, done in C++, faster.

CORRECT:

```typescript
// Void topology by exact boolean + connected components.
const voidSpace = region.subtract(fuse(material));
const components = voidSpace.decompose();
```

INCORRECT:

```typescript
// Void topology by 3-D voxel flood-fill — cubic cost for a 1-D/2-D question.
for (const cell of grid) open[cell] = classify(cell.center) === 'out';
```

## 18. Do Heavy Geometry In C++/WASM, Minimizing Boundary Crossings

Perform heavy geometry in compiled C++/WASM, and treat every JS↔WASM crossing as a first-order cost. A matcher's native entry point must accept a whole claim and return a whole verdict in one coarse-grained call named by the eigenquestion it answers (§1) — not stream per-point or per-pair queries across the boundary. Maximize the work done per crossing; minimize both the count of crossings and the volume of marshalled JSON. Intermediate geometry stays in C++.

**Why**: Boundary crossings and serialization dominate the cost of fine-grained native APIs; one `proveX(...)` call keeps the algorithm and its intermediate geometry where they belong.

**Enforced by**: extends §13 (shared analysis records) — the native surface is the primary performance lever, not JS-side cleverness.

CORRECT:

```typescript
// One coarse call; all intermediate geometry stays in C++.
const verdict = native.proveVoidTopology({ material, region, path, isolatedFrom, minCrossSection });
```

INCORRECT:

```typescript
// Millions of fine-grained crossings marshalling point lists per occurrence.
for (const occurrence of material) states.push(native.classifyPoints(occurrence, centersJson));
```

## 19. Use A Hybrid Geometry Kernel, Each Engine Where Strongest

GeoSpec's native module may embed more than one geometry engine and select per operation by strength. Perform interop (e.g. tessellation → mesh) inside C++, never by round-tripping geometry through JS.

| Concern                                                                                   | Engine                     | Why                                                                                                |
| ----------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| AP242 read, `faceFacts`, exact measurement (classification, extrema, interference volume) | Exact BRep (OCCT)          | Sub-tolerance analytic exactness governs fits and clearances.                                      |
| Void construction, connected components, planar section, whole-assembly booleans          | Robust mesh CSG (Manifold) | Boolean/topology-heavy work where exact-BRep booleans are slow or fail on B-spline-heavy castings. |

**Why**: No single kernel is best at everything — exact-BRep booleans are fragile on complex geometry, while a mesh-CSG engine is robust and fast but not analytically exact; pairing them yields both exactness and robustness.

For an exact-BRep kernel, a mesh that substitutes for exact-BRep evidence must be **derived from the AP242-read BRep** (tessellated after the STEP round-trip), preserving the AP242 substrate (§21). A separately declared rendered-export assertion may instead test the authored GLB itself, because the exported mesh is then the subject of the claim rather than an approximation of an exact-BRep claim. For a mesh-only kernel, the kernel mesh is the substrate directly.

## 20. Evolve The Native Surface To Fit The Matcher

Grow the native binding surface to fit what matchers need; do not contort a matcher into JS gymnastics to avoid a native change. Exposing an additional OCCT operation, adding a second engine, or rebuilding the wasm is an expected, first-class lever when it improves accuracy or collapses boundary crossings (§16, §18). The binding set is a design choice, not a fixed constraint.

**Why**: Re-implementing exact geometry in JS around a frozen native surface produces slow, approximate matchers (the voxel void-continuity sampler); the correct fix is usually a coarser, more capable native call.

CORRECT:

```text
// Add the native op the matcher actually needs, then call it once.
geospec.single.yml: expose Manifold Decompose/Slice; add a proveVoidTopology binding.
```

INCORRECT:

```typescript
// Re-implement boolean/topology in JS by sampling, to avoid touching the wasm build.
const voidField = voxelize(region).floodFill();
```

## 21. Match The Evidence Substrate To The Kernel; Never Bypass AP242 For Exact BRep

GeoSpec tests multiple geometry kernels, and the evidence substrate follows each kernel's capability. Mesh proofs are first-class, not a fallback.

| Kernel class                         | Primary substrate | Rule                                                                                                                                                                              |
| ------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mesh-only (OpenRSCAD, JSCAD, …)      | Rendered mesh     | The kernel mesh **is** the substrate — proofs run on it directly; there is no BRep to require.                                                                                    |
| Exact-BRep (replicad/OpenCascade, …) | AP242 STEP BRep   | Exact-geometry proofs run on geometry round-tripped through **AP242 STEP** — the interchange is part of what is certified. Mesh evidence is also available for mesh-grade checks. |

For an exact-BRep kernel, never substitute a kernel-native serialization — OCCT `.brep`, a kernel's internal solid format, or a pre-STEP tessellation — to make the load cheaper: it certifies the kernel, not the AP242 exchange the shop floor receives. Reduce total evidence-production wall by reusing canonical AP242 evidence. A subset artifact is justified only when its producer avoids whole-model construction and a benchmark proves a total-wall win; filtering after whole-model construction is not optimization. Mesh (GLB) evidence — whether primary for mesh-only kernels, derived from AP242 when substituting for BRep, or explicitly asserted as a rendered export (§19) — is first-class for mesh-grade integrity, spatial localization, and topology/CSG compute, but it does not substitute for the AP242 exact-BRep substrate where exactness is asserted (§10).

**Why**: GeoSpec must certify what each kernel actually delivers — a mesh from a mesh-only kernel, the AP242 interchange from a BRep kernel; bypassing AP242 for a faster kernel-native format would certify geometry no downstream consumer receives.

CORRECT:

```typescript
// Mesh-only kernel: prove on the kernel mesh — that is the substrate.
expectGeo(openrscadGlb).toHaveMeshIntegrity({ watertight: true });

// Exact-BRep kernel: exact proofs run on the AP242-round-tripped BRep.
expectGeo(await loadModel({ file, format: 'step', mesh: false })).toBeValidBrep({ maxTolerance: 0.01 });
```

INCORRECT:

```typescript
// A kernel-native BRep format is faster but certifies the kernel, not the AP242 interchange.
const subject = await loadModel({ file, format: 'brep' });
```

## 22. Discover Complete Suites And Schedule Deterministically

The GeoSpec runner owns recursive model and specification discovery from the rooted filesystem. Do not infer a suite from a UI or chat file-tree snapshot, because lazy trees may omit unopened descendants. Run multi-file suites serially unless a worker-pool design explicitly proves deterministic isolation, ordering, resource ownership, and equivalent diagnostics.

**Why**: Complete discovery is a correctness requirement, and uncoordinated native workers can introduce nondeterministic contention or shared-runtime ownership failures.

**Enforced by**: `packages/geospec/src/runner/discovery.ts` and the runner worker contract.
