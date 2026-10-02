---
title: 'Spatial Test Feedback Architecture — Identity, Geometry, Causality'
description: 'test_model failures return aggregate scalars that force the LLM to mentally simulate geometry. Identifies the eigenquestion and prescribes a structured per-failure contract for connectedComponents, boundingBox, and watertight.'
status: draft
created: '2026-05-06'
updated: '2026-06-01'
category: architecture
related:
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/mesh-continuity-test-semantics.md
  - docs/research/multi-file-test-json-migration.md
  - docs/research/browser-first-parameter-aware-testing.md
  - docs/research/agent-loop-safeguards.md
  - docs/policy/testing-policy.md
---

# Spatial Test Feedback Architecture — Identity, Geometry, Causality

When a `test_model` requirement fails, the agent receives a single aggregate number ("got 3 clusters") and must reverse-engineer the geometry mentally to find the cause. This document identifies the eigenquestion behind that failure mode, surveys current research, and prescribes a structured feedback contract that lets a multi-modal LLM localise the spatial cause without re-deriving the model.

## Executive Summary

A real session ([Initial design](initial_design_2026-05-05T21-57)) where the agent built a Boston-Dynamics-style robot dog burned ~40 turns and $1.58 of its $1.58 total spend — _everything but the first turn_ — fighting a single failing requirement: `Robot is one cohesive cluster ... got 2 (tolerance: 2mm)`. The agent never recovered. It cycled through:

1. Mentally tracing every `mirror`/`translate`/`rotate` composition (error-prone, repeatedly miscomputed).
2. Probing tolerance values (2 → 5 → 6 → 60 → 100 → 500), discovering that even a 500 mm tolerance still reported "got 2" — i.e. the data the agent was being given was nondiagnostic.
3. Deleting and re-authoring `mirror()` calls because it _hypothesised_ the operation was producing degenerate AABBs (it wasn't — the bug was a different `sketchOnPlane` translation).
4. Eventually accepting the failure and shipping anyway.

The single piece of information that would have ended the loop on turn 2 — _which_ cluster contains _which_ named parts and _where_ each cluster sits in space — is computable in milliseconds from the same `Document` the existing checker already parses. The check throws it away and returns a scalar.

The same pattern applies to `boundingBox` (fails with the wrong total size, no clue which named part is responsible for the extreme min/max on the failing axis) and `watertight` (fails with no clue which primitive's boundary edges broke the manifold).

This document proposes a per-check structured failure contract that preserves shape **identity** (the `ShapeConfig.name` already flows through the GLB as a node name), surfaces minimal **geometry** (per-cluster AABB, centroid, gap to nearest neighbour, dominant colour), and names the **causal candidate** (the smallest cluster, the part dominating the extreme axis, the primitive owning the boundary loop) inside `suggestion`. The contract is purely additive over the existing `MeasurementTestRequirement` schema and runs entirely on the GLB the test already analyses — no kernel cooperation, no extra runtime work.

## 2026-06-01 Target-State Alignment

This document remains the diagnostic-contract source of truth. The target package home changes:

- GeoSpec owns the generic `GeometryDiagnostic` result model and must emit spatially descriptive diagnostics for mesh, BRep, STEP, assembly, mate, and distance matchers.
- `@taucad/testing` maps those diagnostics into Tau chat-tool responses, legacy `test_model` compatibility, and editor overlays.
- The pure-mesh rule still stands: connected-components, watertight, bounding-box, and mesh-distance diagnostics derive from geometry buffers, not glTF `extras` or kernel metadata.
- The same diagnostic payload should be consumable by Node/Vitest, browser worker tests, Tau chat cards, and future 3D overlay tools.

The older `test_model`-specific language below should be read as the first Tau consumer of a broader GeoSpec diagnostic contract.

## Problem Statement

`evaluateRequirement` (`packages/testing/src/geometry/evaluate-requirement.ts`) returns a single `CheckResult` per failing requirement:

```typescript
type CheckResult = {
  passed: boolean;
  reason: string; // e.g. "Connected components: expected 1, got 2 (tolerance: 2mm)"
  suggestion: string; // generic prose, no spatial detail
};
```

Three of three checks (`boundingBox`, `connectedComponents`, `watertight`) currently return only aggregate scalars. None reference the `ShapeConfig.name` values the kernel already serialises into the GLB (`packages/runtime/src/kernels/replicad/utils/replicad-to-gltf.ts:61,82`). None expose AABB/centroid per cluster, per-axis dominant part, or boundary-edge centroid.

Concretely, when the robot-dog session failed at `connectedComponents: 1, got 2 (tolerance: 2mm)`, the GLB physically contained 25+ named primitives (`BodyShell`, `AccessoryRail`, `RearCamera`, `FL_HipMotor`, `FL_HipPuck`, `FL_Femur`, …). The check has all the names. It just doesn't expose them.

Result: the agent's only way to bridge "got 2" → "which part is the orphan" is to compose the AABB math in its head across every transform in `main.ts` + `lib/body.ts` + `lib/head.ts` + `lib/leg.ts`. This is precisely the workload an LLM is worst at and a deterministic checker is best at.

## Methodology

- Read the failing transcript end-to-end and tagged every distinct LLM thought related to the cohesion failure (≥40 distinct tool calls, all attempting to localise the orphan cluster).
- Read every test-feedback path in the codebase: `evaluate-requirement.ts`, `analyze-glb.ts`, `connected-components.ts`, `schemas.ts`, both kernels' GLB writers (`replicad-to-gltf.ts`, `opencascade-mesh.ts`), and the `test_model` tool prompt copy.
- Cross-checked existing research: `mesh-continuity-test-semantics.md` (which rewrote the algorithm but left the failure-feedback shape untouched), `multi-file-test-json-migration.md`, `agent-loop-safeguards.md`.
- Surveyed 2025–2026 literature on closed-loop CAD code generation (CADSmith, GIFT, ArtiCAD, CADReasoner, 3DrawAgent), Anthropic's [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents), and Rust-style diagnostic design.

## Eigenquestions

After tracing every dead-end in the transcript back to its root cause, three nested questions emerged:

1. **Identity** — When an aggregate check (`count == N`, `bbox ≈ X`, `is_watertight`) fails, _which named parts contributed_? Today: hidden, even though the names round-trip through the GLB.
2. **Geometry** — _Where in space_ are those parts (centroid, AABB), and how far is the gap that broke the assertion? Today: hidden behind a single `tolerance` knob the agent has to probe by binary search.
3. **Causality** — _Which single edit_ would most likely fix it (which part to move, which gap to bridge, which surface to close)? Today: a generic prose `suggestion` with no spatial referent.

These collapse into one eigenquestion that subsumes them all:

> **What is the smallest failure description such that a multi-modal LLM can localise the cause in source code without re-deriving the geometry mentally?**

Every recommendation below is derived by asking, for each check: "What is the minimum identity/geometry/causality information that lets the agent skip the mental simulation step?"

## Findings

### Finding 1: The current contract forces mental simulation

The robot-dog transcript's failure loop is structurally identical at every iteration:

1. Test reports `got K clusters`.
2. Agent has no per-cluster info.
3. Agent attempts to reconstruct cluster membership by symbolically evaluating every `translate`/`rotate`/`mirror`/`sketchOnPlane` in the source.
4. The composed transform space (`legPositions × buildLeg(opts)` × `sx,sy ∈ {±1}` × `kneeForward ∈ {true,false}`) has too many code-paths to track precisely; the agent miscomputes once, then commits to a wrong hypothesis.
5. Agent edits speculatively (often deleting the _correct_ code, e.g. removing `mirror('YZ')` because it _guessed_ that operation produces degenerate AABBs).
6. Goto 1.

Mental simulation is a known LLM weak spot. The Anthropic tool-design guide ([Writing effective tools for AI agents, 2025](https://www.anthropic.com/engineering/writing-tools-for-agents)) puts it directly: "agents have limited context — agents grapple with natural language names significantly more successfully than they do with cryptic identifiers." The current `got 2` is the cryptic identifier.

### Finding 2: The data is already on the floor

`countConnectedComponents` already iterates every TRIANGLES primitive, computes its AABB, runs Union-Find, and returns `roots.size`. The set of root → primitives is computed on the way and discarded.

Adjacent data also already in the `Document`:

| Datum                | Source                                                      | Cost to surface    |
| -------------------- | ----------------------------------------------------------- | ------------------ |
| Per-primitive AABB   | `computePrimitiveAabb` (already computed)                   | Free               |
| Per-primitive name   | `mesh.getName()` / `node.getName()` (already set by kernel) | Single getter      |
| Per-primitive colour | `primitive.getMaterial()?.getBaseColorFactor()`             | Single getter      |
| Vertex count         | `pos.getCount()` (already loaded for AABB pass)             | Free               |
| Cluster centroid     | `(min+max)/2` of unioned AABBs                              | One pass           |
| Inter-cluster gap    | `aabbsOverlapWithin` already computes this implicitly       | Min over cluster   |
| Boundary-edge owner  | `isWatertight` walks edges per primitive                    | Tag with primitive |
| Per-axis extremum    | Over the per-primitive AABBs in the failing axis            | One linear scan    |

Every recommendation below is "promote what we already compute".

### Finding 3: Anthropic, CADSmith, and Rust converge on the same principle

Three independent traditions of "feedback to a downstream consumer that has to act on it" arrive at the same prescription:

- **Anthropic** (writing tools for agents): "Return meaningful context, not low-level identifiers. Names beat UUIDs. Helpful errors specify _what_ is wrong, _where_, and _what to try_."
- **CADSmith** (CMU, 2026 — multi-agent CAD with programmatic geometric validation): the Refiner agent is fed _exact kernel measurements_ (bbox dimensions, volume, face counts, solid validity) **paired with a three-view render**, not a pass/fail bit. Adding visual context dropped mean Chamfer Distance from 28.37 → 0.74. Removing the visual half (no-vision ablation) regressed T3 mean Chamfer back to 49.68.
- **Rust** (rustc-dev-guide, "Shape of errors to come"): "Put source code front and centre. Primary span shows _where_ the error is, secondary spans show _why_, labels and notes work together to tell a story." Diagnostics are objects with structured sub-diagnostics, not strings.

Our test failures should be objects with sub-diagnostics, in the same vein.

### Finding 4: The user's questions answered

The user explicitly asked four questions. The literature and codebase both say yes to all four:

| Question                                            | Answer | Evidence                                                                                                                                                                                                 |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Report bbox min/max/center per disconnected cluster | Yes    | All AABBs already computed; cluster set is the Union-Find output we currently throw away                                                                                                                 |
| Report colour of each disconnected part             | Yes    | `primitive.getMaterial()?.getBaseColorFactor()` returns RGBA on every kernel that goes through `replicad-to-gltf.ts`; OCCT's `RWGltf_CafWriter` writes XCAF colour metadata that survives the round-trip |
| Report _other_ features worth calling out           | Yes    | name (single most useful — see Finding 5), vertex count, distance to nearest neighbour cluster, smallest-cluster flag                                                                                    |
| Would `boundingBox` / `watertight` benefit?         | Yes    | See Recommendations R2 and R3 — same identity/geometry/causality template applies                                                                                                                        |

### Finding 5: Names are the highest-leverage signal

Of all the candidate per-cluster fields, the single one that ends the agent's "which part is it" loop is the **glTF node name** — i.e. the `ShapeConfig.name` the agent itself chose when authoring the code (`'CarryHandleBar'`, `'FL_HipMotor'`, `'RearCamera'`).

Why names dominate (in priority order):

1. The agent _wrote_ the names. They appear verbatim in the source. There is zero translation cost from "the orphan cluster contains `RearCamera`" to "I need to look at the `rearCam` definition in `lib/body.ts`."
2. Names are short — typically 4–20 chars — so a per-cluster part list costs ~20–200 tokens, not the ~10k tokens an attached screenshot would cost.
3. Names survive Replicad's GLB writer (`replicad-to-gltf.ts:61,82`) and OCCT's `RWGltf_CafWriter` (via `XCAFDoc_DocumentTool` labels — though OCCT currently doesn't set the label name; that's a one-line fix in `opencascade-mesh.ts:73-75`).
4. Anthropic's empirical finding: "merely resolving arbitrary alphanumeric UUIDs to more semantically meaningful and interpretable language … significantly improves Claude's precision in retrieval tasks by reducing hallucinations." Same principle.

A failure that reads `Cluster B (1 primitive: 'RearCamera') is 47.3mm from Cluster A` is self-explanatory; `got 2 clusters at tolerance 2mm` is not.

### Finding 6: Cluster cardinality matters more than centroid

In the transcript, every two-cluster failure followed the same shape: one big cluster (the body + everything reachable through hip motors) and one small orphan (the carry handle, or one camera, or one mirrored leg). The agent doesn't need both centroids to find the cause — it needs the **smallest** cluster.

Treating "smallest cluster" as a first-class signal is high-leverage:

- A single primitive cluster ⇒ that one primitive is the orphan (its name is the answer).
- A 2–4 primitive cluster ⇒ a sub-assembly (e.g. handle bar + two stands) detached from the body — list its members and compute its 6-DOF gap to the largest cluster on each axis.
- A near-50/50 split ⇒ a structural separation between two halves of the model — list both centroids; the agent will recognise it from geometry.

Numbering clusters by descending vertex count (`Cluster A` = largest, `Cluster B` = next, …) gives the agent a stable identifier that doesn't shift between turns.

### Finding 7: `boundingBox` failures have an analogous orphan

The `boundingBox` check fails almost identically: "expected `size.x` 600 (±60), got 496". The agent has to mentally enumerate every primitive to know which ones contribute to `xMin = -213` and `xMax = +283`. The deterministic answer is two named primitives — the `RearCamera` for `xMin` and the `Visor` for `xMax`. Surfacing the **dominant part per failing axis extremum** is the direct analogue of "smallest cluster" for the connectivity check.

This generalises further: when `center.z` fails ("expected 170, got 156") the agent wants to know which part is pulling the centroid low — the `Foot` or `Tibia` if too low, the `CarryHandleBar` if too high.

### Finding 8: `watertight` failures need the same identity treatment

`watertight` currently returns a single boolean. The check (`packages/testing/src/geometry/watertight.ts`) walks edges per primitive and returns `false` if any unmatched boundary edge exists. The same primitive-tagging applies: report _which named primitive(s)_ own the boundary edges, and the centroid of the largest unmatched edge loop. Even a one-line "Boundary edge in 'KneePuck' near (135, 90, 156) — likely failed boolean fuse" eliminates 90% of the search space.

### Finding 9: Tolerance-probing is a smell that the contract eliminates

The transcript escalated `tolerance` 2 → 5 → 6 → 60 → 100 → 500 trying to **discover** the inter-cluster gap. The check could just _report it_:

```
Connected components: expected 1, got 2 (tolerance: 2.0mm)
Smallest gap between clusters: 11.4mm (between 'CarryHandleBar' and 'AccessoryRail', along Z)
Suggestion: raise tolerance to ≥12mm, or move 'CarryHandleBar' down by ≥9mm to overlap 'AccessoryRail' at z=345.
```

Once the agent sees the gap, it never needs to probe again. The cost of computing it is one min-over-cluster-pairs pass after Union-Find finishes — already O(N²) in primitives, same complexity as the existing overlap test.

### Finding 10: Visual feedback complements numerical feedback (CADSmith)

CADSmith's ablation showed kernel metrics alone catch dimensional errors but miss "false convergence" (a part that has plausible volume + bbox but is structurally wrong). The vision Judge catches those.

We already have an analogue: `screenshot` / `multi-angle` is a separate tool the agent calls voluntarily. Two structural recommendations:

1. **Auto-attach a labelled multi-view image when `connectedComponents` fails with K ≥ 2.** Each cluster shaded a distinct hue (or annotated with its name); the LLM gets identity-by-colour for free. CADSmith's three-view at 2400×800 is the reference.
2. **Don't rely on it.** Most failures are spatial-numerical (the orphan handle, the missing leg fuse). The numerical contract from Findings 1–8 must stand alone; the image is bonus.

This matches CADSmith's no-vision ablation: the system still works, just degrades on T3 complexity. Our agent is reasoning about T3-class assemblies in the transcript above, so the image is high-value but the numerical contract is still load-bearing.

### Finding 11: Token budget is bounded by the number of primitives, not assembly complexity

A worst-case robot-dog model has ~30 named primitives. A per-primitive line of `name (color, size, vertices)` is ~60 tokens. Per-cluster summary is ~120 tokens. Total worst case ~3 KB ≈ 800 tokens for a complete `connectedComponents` failure payload. Anthropic's guideline (`tool responses ≤25k tokens by default`) is ~30× our worst case. Token cost is a non-issue.

For models where token sensitivity matters, the same `response_format: 'concise' | 'detailed'` enum Anthropic recommends could trim the per-primitive list to "smallest cluster only" — but the default should be detailed, since the agent's failure mode without the data is _far_ more expensive than 800 extra tokens.

## Recommendations

Recommendations are ordered by impact / effort. R1 ends the smoking-gun loop from the transcript. R2–R3 apply the same template to the other two checks. R4–R6 are cross-cutting.

| #   | Action                                                                                                              | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Structured `connectedComponents` failure: per-cluster name list, AABB, centroid, vertex count, smallest-gap report  | P0       | Low    | High   |
| R2  | Structured `boundingBox` failure: dominant part per extremum on the failing axis                                    | P0       | Low    | High   |
| R3  | Structured `watertight` failure: owning primitive name + boundary-loop centroid                                     | P1       | Med    | High   |
| R4  | Promote `CheckResult` to a discriminated union of `MeasurementFailure` variants (one shape per check, fully typed)  | P1       | Low    | Med    |
| R5  | OCCT kernel: set XCAF label names from `ShapeConfig.name` so OpenCascade GLBs preserve identity end-to-end          | P1       | Low    | High   |
| R6  | Auto-attach a cluster-coloured multi-view image when `connectedComponents` fails with K ≥ 2 (CADSmith-style 3-view) | P2       | Med    | Med    |
| R7  | Add a `concise` / `detailed` response-format toggle to `test_model` and default to `detailed`                       | P3       | Low    | Low    |

### R1 — Structured `connectedComponents` failure

Promote the `roots.size` scalar to a `ConnectedComponentsFailure` payload that carries the cluster decomposition. Sketch (placement under `packages/testing/src/geometry/`):

```typescript
type ClusterReport = {
  /** 'A' for the largest cluster (most vertices), 'B' for the next, ... */
  label: string;
  primitives: Array<{
    /** glTF node name, falls back to `Shape_${i}` */
    name: string;
    /** Hex string from material baseColorFactor */
    color: string;
    /** Vertex count from POSITION accessor */
    vertices: number;
    /** Per-primitive AABB in mm */
    aabb: { min: [number, number, number]; max: [number, number, number] };
  }>;
  /** Aggregate AABB unioning every primitive in the cluster */
  aabb: { min: [number, number, number]; max: [number, number, number] };
  /** (min + max) / 2 of aggregate AABB */
  centroid: [number, number, number];
  totalVertices: number;
};

type ClusterGap = {
  fromLabel: string; // 'A'
  toLabel: string; // 'B'
  axis: 'x' | 'y' | 'z'; // the axis with the largest gap
  gapMm: number;
  /** Pair of primitives between which the smallest gap occurs */
  fromPrimitive: string; // e.g. 'AccessoryRail'
  toPrimitive: string; // e.g. 'CarryHandleBar'
};

type ConnectedComponentsFailure = {
  expected: number;
  got: number;
  tolerance: number;
  clusters: ClusterReport[];
  /** All inter-cluster gaps, sorted ascending by gapMm */
  gaps: ClusterGap[];
};
```

Rendered as a multi-line `reason` (the `CheckResult.reason` stays a string for backwards compatibility, but is generated from the structured payload):

```
Connected components: expected 1, got 2 (tolerance: 2mm)
- Cluster A (10 primitives, 14210 vertices):
    BodyShell, AccessoryRail, Underbelly, VentLeft, VentRight, PowerButton,
    HeadShell, Visor, StereoCameraL, StereoCameraR
    aabb: x[-210, +210] y[-90, +90] z[+227, +345]   centroid (0, 0, 286)
- Cluster B (3 primitives, 1840 vertices):
    CarryHandleBar, CarryHandleStandL, CarryHandleStandR
    aabb: x[-105, -65] y[-39, +39] z[+349, +358]    centroid (-85, 0, 354)
- Smallest gap: 4.0mm in z, between 'AccessoryRail' (z.max=345) and
  'CarryHandleStandL' (z.min=349)
```

Rendered as a `suggestion` that names names:

```
The smallest cluster (B: CarryHandleBar+stands) is 4mm above the largest
cluster (A: body+head). Either:
  • move 'CarryHandleBar' down by 4mm so its stands overlap 'AccessoryRail', OR
  • raise the requirement tolerance to ≥4mm if a 4mm visual gap is intended, OR
  • fuse the handle into the body in lib/body.ts if it must be one solid.
```

This payload would have ended the transcript loop on turn 2.

#### Implementation notes

- `countConnectedComponents` returns a richer object alongside the count, or splits into `analyzeConnectedComponents(document, toleranceMm) → ClustersResult` with the existing `countConnectedComponents` becoming a thin wrapper.
- `analyzeGlb` exposes the new analyser instead of just memoising the count.
- `evaluateRequirement` formats the prose `reason` from the structured payload; both go on `CheckResult` (see R4).
- Inter-cluster gap is `min` over all primitive pairs (i, j) with i ∈ clusterA, j ∈ clusterB of the per-axis signed gap. Same O(N²) as the existing overlap test, just with a min-tracking variant.

### R2 — Structured `boundingBox` failure

Same template, applied per failing axis:

```typescript
type AxisFailure = {
  axis: 'x' | 'y' | 'z';
  field: 'size' | 'center';
  expected: number;
  actual: number;
  toleranceMm: number;
  /** When `field === 'size'` and the failure is "too big": the primitive
   *  setting the failing axis's extremum (max for too-big-positive, min for
   *  too-big-negative). When "too small": the primitives spanning the
   *  shortened axis. */
  dominantPrimitive: { name: string; aabb: AabbXyz };
  oppositePrimitive?: { name: string; aabb: AabbXyz };
};

type BoundingBoxFailure = {
  axisFailures: AxisFailure[];
};
```

Rendered:

```
Bounding box mismatch:
  size.x: expected 600 (±60), got 496
    extends from 'RearCamera' (x.min=-213) to 'Visor' (x.max=+283)
    Suggestion: extend either part outward, or relax expected to ~500.
  center.z: expected 170 (±20), got 156
    pulled low by 'Foot' (z.min=0) — feet sit on ground but body's centroid is
    still expected at 170. Either raise body (currently centred z=282) or relax.
```

The agent now has named handles for the offending parts and never has to re-derive AABBs.

### R3 — Structured `watertight` failure

Tag boundary-edge ownership during the `isWatertight` walk:

```typescript
type WatertightFailure = {
  /** Total unmatched boundary edges across the whole document */
  boundaryEdges: number;
  /** Per-primitive breakdown, sorted by count descending */
  perPrimitive: Array<{
    name: string;
    boundaryEdges: number;
    /** Centroid of all unmatched edges on this primitive, in mm */
    largestLoopCentroid: [number, number, number];
  }>;
};
```

Rendered:

```
Mesh is not watertight (37 boundary edges):
  • 'KneePuck' has 28 boundary edges near centroid (135, 90, 156) —
    likely failed boolean operation. Inspect with screenshot from +Y.
  • 'Foot' has 9 boundary edges near (127, 90, 14) — sphere may not have
    fused into 'Tibia'.
Suggestion: re-fuse these primitives in their definition file, or assert
watertight on each compilation unit individually rather than on the assembly.
```

### R4 — Promote `CheckResult` to a typed discriminated union

Today `CheckResult` is `{ passed, reason: string, suggestion: string }`. The string is the only payload, so consumers (UI cards, system-prompt counters, future automated retry loops) can't introspect anything structured. Promote to:

```typescript
type CheckResult =
  | { passed: true }
  | {
      passed: false;
      check: 'boundingBox';
      reason: string; // human-rendered; derived from .failure
      suggestion: string; // human-rendered; derived from .failure
      failure: BoundingBoxFailure;
    }
  | {
      passed: false;
      check: 'connectedComponents';
      reason: string;
      suggestion: string;
      failure: ConnectedComponentsFailure;
    }
  | {
      passed: false;
      check: 'watertight';
      reason: string;
      suggestion: string;
      failure: WatertightFailure;
    };
```

Rendering happens once at the schema boundary; the structured `failure` is preserved for downstream consumers (chat UI tool cards, `agent-safeguards.middleware.ts` for repeat-failure detection, future RL training data).

### R5 — OCCT kernel: preserve names through XCAF

`opencascade-mesh.ts:73-75` calls `shapeTool.NewShape()` and `SetShape(label, entry.shape)` but never sets a label name. The `RWGltf_CafWriter` then emits anonymous nodes. Add (one line, OCCT API):

```cpp
// JS:
const labelName = new oc.TDataStd_Name();
labelName.Set(label, new oc.TCollection_ExtendedString(entry.name ?? `Shape_${i}`));
```

(Exact API surface requires checking the bundled `opencascade.js` types; pattern is standard XCAF.) After this, OpenCascade-kernel GLBs preserve `ShapeConfig.name` end-to-end and R1/R2/R3 work uniformly across kernels.

### R6 — Cluster-coloured multi-view image on K ≥ 2 failure

Following CADSmith: when `connectedComponents` fails with K ≥ 2, automatically render a 3-view image (isometric, top, front) where each cluster is shaded a distinct hue (Cluster A = neutral grey, Cluster B = warm orange, Cluster C = cool blue, …) and attach it to the tool result. The labels in the image match the labels in the structured payload, so the agent can correlate `Cluster B contains CarryHandleBar` with the orange chunk floating above the chassis.

Cost: requires re-rendering with a per-cluster colour override (cheap on top of the existing screenshot pipeline), plus token cost of an image part (~1.5–3k tokens depending on resolution). Justified for K ≥ 2 only — 99% of failed sessions are exactly K = 2, where the image converts an abstract orphan into a literal "look, that piece up there".

Defer until R1 lands. CADSmith's no-vision ablation result holds for our domain: numerical-only feedback closes the smoking-gun loop on its own; the image is upside.

### R7 — Response-format toggle on `test_model`

Per Anthropic's ResponseFormat pattern: expose `verbosity: 'concise' | 'detailed'` on `test_model`, default `detailed`. Concise drops the per-primitive enumeration inside each cluster, keeping just `Cluster A (10 primitives)` and the gap report. Detailed includes per-primitive name+AABB rows.

This is the lowest-priority item — leave it for later if profiling shows test-result tokens dominating context for very large assemblies (≥100 primitives).

## Trade-offs

### Approaches considered and rejected

| Approach                                                           | Why rejected                                                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Force the agent to call a separate `inspect_clusters` tool         | Splitting failure into "fail" + "now go ask why" adds a turn and a context switch. CADSmith's lesson: deliver the diagnostic _with_ the failure. Anthropic's lesson: tools that return high-signal context outperform thin wrappers. |
| Embed cluster info in glTF `extras` and require the agent to parse | Violates "geometry tests derive results purely from glTF mesh data" (testing-policy). Also asks the model to do work the checker should do.                                                                                          |
| Always attach a screenshot                                         | Token cost adds up across long sessions. CADSmith's ablation shows numerical feedback alone is sufficient for T1/T2; image is upside on T3. Default off, conditional on K ≥ 2 (R6).                                                  |
| Color-coded per-cluster name only (no AABB/centroid)               | Names alone give identity but not the gap. The agent then has to probe `tolerance` to discover the gap (the actual smoking gun). Name + AABB + smallest-gap together are the minimum sufficient set.                                 |
| Switch from string `reason`/`suggestion` to objects only           | Existing UI cards (`chat-message-tool-test-model.tsx`) render the strings directly. Keep both: structured `failure` for programmatic consumers, rendered strings for the UI. R4 preserves both surfaces.                             |

### Risk: too much detail confuses the LLM

A counter-argument: too much per-primitive data could push the model into noise. Two mitigations:

- The `suggestion` always names the single most likely culprit (smallest cluster, dominant axis part, primitive owning most boundary edges) — leading the agent to the answer rather than burying it under a list.
- R7 provides a `concise` knob if profiling later shows degradation.

Empirically the opposite failure is far more expensive: the transcript shows the agent burning ~$1.50 of compute on a missing-data problem, not on an excess-data problem.

### Risk: structured payload requires a wire-format change

`CheckResult` is internal to `packages/testing` — no wire format yet. The promotion in R4 happens before any external API freezes on it. Doing it now is cheap; doing it later (after the chat tool surface stabilises) requires migrating `chat-message-tool-test-model.tsx` and any benchmarks that snapshot the failure shape. Pull the fix forward.

## Code Examples

### Current (smoking gun)

```typescript
// packages/testing/src/geometry/evaluate-requirement.ts:111-135
case 'connectedComponents': {
  const expected = (requirement.expected as { count?: number }).count;
  const ccTolerance = requirement.tolerance ?? defaultConnectedToleranceMm;
  const actual = stats.connectedComponents(ccTolerance);
  if (actual !== expected) {
    return {
      passed: false,
      reason: `Connected components: expected ${expected}, got ${actual} (tolerance: ${ccTolerance}mm)`,
      suggestion:
        actual > expected
          ? `Got ${actual} disjoint chunks at ${ccTolerance}mm tolerance. ...`
          : `Got ${actual} disjoint chunks (fewer than expected). ...`,
    };
  }
  return { passed: true, ... };
}
```

### Target

```typescript
case 'connectedComponents': {
  const expected = (requirement.expected as { count?: number }).count;
  const ccTolerance = requirement.tolerance ?? defaultConnectedToleranceMm;
  const result = stats.analyzeConnectedComponents(ccTolerance);
  if (result.count !== expected) {
    const failure: ConnectedComponentsFailure = {
      expected,
      got: result.count,
      tolerance: ccTolerance,
      clusters: result.clusters,
      gaps: result.gaps,
    };
    return {
      passed: false,
      check: 'connectedComponents',
      reason: renderConnectedComponentsReason(failure),
      suggestion: renderConnectedComponentsSuggestion(failure),
      failure,
    };
  }
  return { passed: true };
}
```

`renderConnectedComponentsReason` is a pure function — straightforward to test (snapshot or assert-on-substrings) and easy to evolve without touching the analyser.

## Diagrams

### Failure-feedback loop, before (smoking gun)

```
test_model ──┐
             ▼
       got K clusters     ─────►  agent: "which K?"
             │
             ▼
   agent mentally re-derives every translate/mirror/rotate
             │
             ▼
   guesses orphan, edits speculatively, re-runs
             │
             ▼
        loop ←┘   (40 iterations, $1.58 of $1.58 spent)
```

### Failure-feedback loop, after R1+R2+R3

```
test_model ──┐
             ▼
   { failure: { clusters: [A, B], gaps: [B↔A: 4mm in z],
                suggestion: "move 'CarryHandleBar' down 4mm" } }
             │
             ▼
   agent edits 'CarryHandleBar' position, re-runs
             │
             ▼
        passes (1 iteration, ~$0.04)
```

## References

- [Writing effective tools for AI agents — Anthropic, Sep 2025](https://www.anthropic.com/engineering/writing-tools-for-agents) — "Return meaningful context", "Names beat UUIDs", "Helpful errors" principles.
- [CADSmith: Multi-Agent CAD Generation with Programmatic Geometric Validation — Barkley, Loghmani, Farimani (CMU), 2026](https://arxiv.org/html/2603.26512v1) — Validator passes the Refiner exact kernel measurements (bbox, volume, face/edge counts, validity) paired with a 3-view render. Mean Chamfer 28.37 → 0.74 vs zero-shot.
- [GIFT: Bootstrapping Image-to-CAD Program Synthesis via Geometric Feedback, 2026](https://arxiv.org/html/2603.27448v1) — Failure-driven augmentation: rendering failed predictions back as images and training the model to correct them.
- [Errors and lints — Rust Compiler Development Guide](https://rustc-dev-guide.rust-lang.org/diagnostics.html) — Primary spans, secondary spans, structured sub-diagnostics.
- [Shape of errors to come — Rust Blog, 2016](https://blog.rust-lang.org/2016/08/10/Shape-of-errors-to-come/) — "Put source code front and centre" principle.
- Internal: `docs/research/mesh-continuity-test-semantics.md` — algorithm rewrite (AABB-clustering) that this document layers on top of.
- Internal: `docs/research/agent-loop-safeguards.md` — repeat-failure detection that consumes the structured `failure` payload from R4.
- Internal session: [Initial design](initial_design_2026-05-05T21-57) — the smoking-gun transcript driving every recommendation in this document.

## Appendix

### A. Per-check field cardinality (helps size the schema)

| Failure type          | Per-cluster fields                                 | Per-primitive fields              | Top-level fields                 |
| --------------------- | -------------------------------------------------- | --------------------------------- | -------------------------------- |
| `connectedComponents` | label, AABB, centroid, totalVertices, primitives[] | name, color, vertices, AABB       | expected, got, tolerance, gaps[] |
| `boundingBox`         | n/a                                                | name, AABB (only dominant ones)   | axisFailures[]                   |
| `watertight`          | n/a                                                | name, boundaryEdges, loopCentroid | boundaryEdges, perPrimitive[]    |

### B. Why not unify all three under one shape?

The three checks answer fundamentally different spatial questions (cardinality, extent, topology). A single union shape would either explode to the union of all fields (none of which apply to all checks) or collapse to a generic key/value bag (defeats the point of structured feedback). Discriminated union per-check (R4) is the right factoring.

### C. Worst-case payload size

For a 30-primitive assembly that splits into 4 clusters, the failure payload is ~1.2 KB JSON / ~400 tokens. For the 3-cluster failure in the transcript, ~280 tokens. Well below Anthropic's 25k-token tool-response default.

### D. Open questions for the implementation PR

- Which renderer to use for R6's cluster-coloured multi-view image? Reuse the existing screenshot pipeline (`capture-view-screenshot.utils.ts`) with a temporary glTF rewrite that overrides `baseColorFactor` per cluster? Or render server-side via the API's headless GLB→PNG path?
- Should `analyzeConnectedComponents` cache the cluster decomposition the same way `connectedComponents(toleranceMm)` caches the count? Yes — same `Map<toleranceMm, ClustersResult>` pattern.
- Should the structured `failure` field surface in the UI tool card (`chat-message-tool-test-model.tsx`) as expandable sub-rows? Probably yes (hover-reveals the per-primitive names) but out of scope for the analyser PR.
