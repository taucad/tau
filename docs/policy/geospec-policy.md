---
title: 'GeoSpec Policy'
description: 'Rules for GeoSpec matcher API design, evidence naming, diagnostics, failure messages, and high-assurance geometry test authoring.'
status: active
created: '2026-06-23'
updated: '2026-06-25'
related:
  - docs/policy/library-api-policy.md
  - docs/policy/testing-policy.md
  - docs/policy/brep-policy.md
  - docs/policy/geometry-naming-policy.md
  - docs/research/geospec-production-assertions-audit.md
  - docs/research/geospec-production-assertions-catalog.md
  - docs/research/v8-engine-brep-current-manufacturability-audit.md
---

# GeoSpec Policy

Internal reference for designing and authoring GeoSpec geometry assertions. GeoSpec is a geometry specification testing library for agents and engineers, so its APIs must be semantically small, evidence-backed, and diagnostic-rich. A failing GeoSpec assertion should tell the next agent exactly what failed, where it failed, and which geometry relationship should be repaired.

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

A matcher may support `evidence: 'auto' | 'mesh' | 'brep'` only when both evidence modes answer the same engineering question. If the semantics differ, use separate options or separate matchers.

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

GeoSpec must derive generic geometry diagnostics from geometry evidence, not kernel-specific metadata. Kernel provenance may appear in `details`, but matcher behavior should not branch on Replicad, OpenSCAD, JSCAD, KCL, or OpenCascade source identities.

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
