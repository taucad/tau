---
title: 'Mesh Continuity Test Semantics — Multi-Shape Misalignment'
description: 'Why connectedComponents regresses when a Replicad Shape3D splits into a multi-color ShapeConfig[]. Preserves pure-geometry semantics and aligns the target algorithm with GeoSpec spatial welding.'
status: draft
created: '2026-04-21'
updated: '2026-06-01'
category: investigation
related:
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/multi-file-test-json-migration.md
  - docs/policy/testing-policy.md
---

# Mesh Continuity Test Semantics — Multi-Shape Misalignment

Investigates why the "Single connected solid" requirement (`check: connectedComponents, expected.count: 1`) starts failing the moment an existing Replicad model is split from one fused `Shape3D` into a multi-color `ShapeConfig[]` return — even though the visible geometry, parts, and bounding box are identical — and audits the surface area (testing package, `test_model` / `edit_tests` tools, kernel-aware system prompt) that misleads the LLM into authoring this footgun by default.

## Executive Summary

`countConnectedComponents` (`packages/testing/src/geometry/connected-components.ts`) measures **strict triangle-graph connectivity** across the GLB. It only joins triangles that share a vertex (within an `ε = 1 mm` spatial-hash bucket). Per-shape tessellations in Replicad never share vertices across `ShapeConfig` entries — even when the physical surfaces touch — so a model that was previously `f.fuse(t).fuse(r).fuse(s).fuse(w)` (1 component) collapses to `[ f, t, r, s, w ]` (≥5 components) the instant the agent introduces per-part colors. The `meshCount` check has the same problem: it counts GLB primitives, which equals the `ShapeConfig[]` length, not "number of intended parts in the assembly."

Compounding the algorithmic mismatch, every author-facing surface — the `test_model` description, the `edit_tests` description, the canonical `<test_requirements>` example in `cad-agent.prompt.ts`, and the per-kernel `error_handling` hint — actively encourages `connectedComponents: 1` as the default "single solid" guardrail and never warns the agent that introducing per-shape colors invalidates that requirement. The user-observed regression (helicopter example: 1 → 8 components after `Shape3D` → `ShapeConfig[]`) is the predictable result.

A follow-up audit (see "Addendum: Full Geometry-Test Audit") catalogued every check we ship and showed that **two of the five overlap on "N intentional parts"** (`meshCount`, `connectedComponents`), **three overlap on "is this one fused solid?"** (`meshCount`, `connectedComponents`, `watertight`), and **one is anti-deterministic for an agent surface** (`vertexCount` is driven by tessellation tolerance, not CAD intent). The fix is to consolidate the agent-facing surface to three orthogonal checks, each answering a unique question:

1. **`boundingBox`** — "Is the model the right size / position on the axes I care about?"
2. **`connectedComponents`** (kept; algorithm rewritten) — "How many spatially-disjoint chunks does the geometry contain?" The target GeoSpec algorithm spatially welds coincident vertex positions before union-find, mirroring the neighbor-grid technique used by watertight edge classification. It stays _purely computational over mesh geometry_ — no kernel cooperation, no glTF `extras`, no per-kernel metadata — so any future kernel that emits triangles immediately gets provider-agnostic continuity semantics.
3. **`watertight`** — "Is each compilation unit's surface closed (manifold / 3D-printable)?" When asserted per CU it doubles as the "single fused solid" guardrail without overlap.

`meshCount` and `vertexCount` are removed from the agent-facing schema; `analyzeGlb` keeps computing them for internal diagnostics only. `connectedComponents` is _kept by name_ (the post-fix semantics still match the term — "N spatially-connected chunks") to avoid churn across an unreleased agent API. The prompt, tool descriptions, canonical examples, failure suggestions, benchmark fixtures, and kernel-author docs all migrate to the three-check vocabulary in one atomic PR (no half-vocabulary intermediate state). A glTF-`extras`-based "kernel-supplied part count" was explicitly considered and rejected as the wrong layering — see "Approaches considered and rejected" in Trade-offs.

## 2026-06-01 Target-State Alignment

This investigation remains the source of the pure-mesh and non-overlapping-check vocabulary, but the implementation target is now GeoSpec:

- GeoSpec owns the native connected-components analyzer in `geospec/mesh`.
- `@taucad/testing` exposes compatibility for existing `test.json` checks and maps Tau prompt/tool output to GeoSpec diagnostics.
- The target connected-components algorithm is spatial welding plus triangle adjacency, not per-primitive AABB overlap clustering. AABB/gap clustering can exist as a separate assembly-proximity matcher if needed, but it should not be the semantic core of `connectedComponents`.
- Failure payloads must carry per-component bounding boxes, centers, colors/material hints, and nearest-neighbor gaps so LLM repair loops receive spatial evidence rather than a scalar count.

## Problem Statement

Reproduction (from the user-supplied helicopter session, screenshots in chat):

1. Initial code returns one fused Replicad solid:

   ```typescript
   export default function main(p = defaultParams): Shape3D {
     return f.fuse(t).fuse(r).fuse(s).fuse(w);
   }
   ```

   `test.json` includes `{ id: 'req_solid', check: 'connectedComponents', expected: { count: 1 } }`. All 12 requirements pass.

2. User asks the agent to "add colors". Agent rewrites to:
   ```typescript
   export default function main(p = defaultParams): ShapeConfig[] {
     return [
       { shape: f, color: '#1E90FF', name: 'Fuselage' },
       { shape: t, color: '#1E90FF', name: 'Tail' },
       { shape: r, color: '#333333', name: 'Rotors' },
       { shape: s, color: '#AAAAAA', name: 'Skids' },
       { shape: w, color: '#444444', name: 'Weapons' },
     ];
   }
   ```
   The visible model is identical. `req_solid` now fails: `Connected components: expected 1, got 8 — Model has 8 disconnected pieces — ensure all parts are fused into 1 solid(s).`

The user's intent for `connectedComponents` was a **continuity check** — "the assembled helicopter is one cohesive thing." Reaching for boolean `fuse` to recover the green tick destroys per-part appearance (Replicad applies one color per top-level shape) and eliminates legitimate mechanical separations (two skids, two weapons).

## Methodology

- Read every file in `packages/testing/src/` (schemas, geometry analyzers, evaluator, tests).
- Read both chat tools (`apps/api/app/api/tools/tools/tool-test-model.ts`, `tool-edit-tests.ts`) and their schemas (`libs/chat/src/schemas/tools/test-model.tool.schema.ts`).
- Read the entire CAD agent prompt (`apps/api/app/api/chat/prompts/cad-agent.prompt.ts`) and grep all kernel prompt configs (`replicad`, `openscad`, `manifold`, `jscad`, `opencascadejs`, `zoo`) for testing-related guidance.
- Read the Replicad `renderOutput` pipeline (`packages/runtime/src/kernels/replicad/utils/render-output.ts`) and the `ShapeConfig` declaration extracted into Monaco IntelliSense (`libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts`) to confirm how multi-shape returns become GLB mesh primitives.
- Cross-checked the existing `connectedComponents` unit test (`packages/testing/src/geometry/connected-components.test.ts`) — `multiShapeCode` already documents that two non-overlapping `ShapeConfig`s report `2` components.

## Findings

### Finding 1: `connectedComponents` is strictly triangle-graph connectivity

`countConnectedComponents` (`packages/testing/src/geometry/connected-components.ts`):

```15:56:packages/testing/src/geometry/connected-components.ts
export const countConnectedComponents = (document: Document): number => {
  const root = document.getRoot();
  const meshes = root.listMeshes();

  const allPositions: Array<[number, number, number]> = [];
  const allTriangles: Array<[number, number, number]> = [];
  let vertexOffset = 0;

  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue; // TRIANGLES only
      }

      const posAccessor = primitive.getAttribute('POSITION');
      const indexAccessor = primitive.getIndices();
      // ... append per-primitive positions/triangles to flat arrays
    }
  }
```

Two independent observations make this incompatible with multi-color CAD:

1. **No 27-neighbor probing.** Spatial hashing uses a single cell-key lookup:

   ```67:73:packages/testing/src/geometry/connected-components.ts
       const existing = positionToCanonical.get(key);
       if (existing === undefined) {
         positionToCanonical.set(key, i);
         vertexMap[i] = i;
       } else {
         vertexMap[i] = existing;
       }
   ```

   Compare to `isWatertight` (`packages/testing/src/geometry/watertight.ts`), which probes all 27 neighboring cells and falls back to a Euclidean-distance check inside `ε`. Coincident vertices that fall into adjacent buckets are split.

2. **Cross-shape vertices are never coincident anyway.** Replicad tessellates each `ShapeConfig.shape` independently via `shape.mesh({...})` (`render-output.ts:178-181`). Two solids that share a planar contact face produce _parallel triangles at the same Z plane with completely different vertex positions_ — Replicad does not weld vertices across distinct `TopoDS_Shape` instances. Even with a perfect spatial hash, the algorithm could only merge them if the two tessellators happened to land vertices on the same coordinates within `ε = 1 mm`, which is not a guarantee any CAD kernel makes.

The existing unit test confirms the behaviour as designed:

```99:103:packages/testing/src/geometry/connected-components.test.ts
  it('should report separate components across multiple meshes', async () => {
    const io = new NodeIO();
    const document = await io.readBinary(multiShapeGlb);
    expect(countConnectedComponents(document)).toBe(2);
  });
```

Where `multiShapeCode` returns two `ShapeConfig`s that do not interpenetrate. The check is doing exactly what it says on the tin; the failure is one of intent, not implementation.

### Finding 2: `meshCount` measures GLB primitives, not "parts"

`analyzeGlb` populates `meshCount` from the gltf-transform inspector report:

```30:31:packages/testing/src/geometry/analyze-glb.ts
  const vertexCount = report.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  const meshCount = report.meshes.properties.length;
```

In Replicad the number of GLB meshes equals `ShapeConfig[].length`. So `meshCount` _also_ grows the moment you split a fused solid into colored parts — even though `edit_tests`' tool description claims `meshCount` is "(number of returned shapes)" (which is technically accurate but the LLM treats it as "number of intended parts"). The semantics overlap with `connectedComponents` for the failure mode under investigation.

### Finding 3: System prompt actively prescribes `connectedComponents: 1`

The `<test_requirements>` registry section (`apps/api/app/api/chat/prompts/cad-agent.prompt.ts:115-141`) is shipped to every Replicad / OCJS / Manifold session (testing-enabled mode). Its canonical example _always_ includes:

```128:128:apps/api/app/api/chat/prompts/cad-agent.prompt.ts
      { "id": "req_solid", "type": "measurement", "description": "Single connected solid", "check": "connectedComponents", "expected": { "count": 1 } },
```

Followed by the "available checks" line:

```139:139:apps/api/app/api/chat/prompts/cad-agent.prompt.ts
Available checks: \`boundingBox\` (size/center — specify only the axes you care about), \`meshCount\` (number of returned shapes), \`connectedComponents\` (number of disconnected pieces — use for "single solid" checks), \`vertexCount\`, \`watertight\` (closed manifold with no boundary edges).
```

And the `<error_handling>` section reinforces the loop:

```255:255:apps/api/app/api/chat/prompts/cad-agent.prompt.ts
On test failures: review the failure reason and suggestion, then fix the specific issue. For geometry failures (connectedComponents, boundingBox), use screenshot to see where the problem is before fixing.
```

The agent therefore writes `connectedComponents: 1` as part of the TDD bootstrap before knowing whether the model is single-shape or multi-shape, and the only "fix" guidance it receives for the resulting failure is to look at a screenshot — which, for a visually-correct helicopter that just got colors, leads it to either (a) re-fuse the parts (destroying per-color appearance) or (b) loop on screenshots looking for nothing.

### Finding 4: `edit_tests` tool description duplicates the same prescription

`apps/api/app/api/tools/tools/tool-edit-tests.ts:36`:

```36:36:apps/api/app/api/tools/tools/tool-edit-tests.ts
Checks: boundingBox (size/center — specify only axes to check), meshCount (number of returned shapes), connectedComponents (disconnected pieces — use for "single solid" checks), vertexCount, watertight.
```

Identical "use for single solid checks" framing. Per `docs/policy/context-engineering-policy.md` (and the in-tree context-engineering rule), the principle is **"tool description = HOW; system prompt = WHEN"** and **"never explain the same concept twice"** — yet the test-check semantics are duplicated verbatim across the prompt body, the prompt example, and the tool description, with the same misleading framing in all three places. A single-source-of-truth fix needs to land in all three.

### Finding 5: The `Shape3D` vs `ShapeConfig[]` regression is invisible to the agent

The Replicad canonical example (`apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example.ts`) returns a single fused `Shape3D`:

```27:81:apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example.ts
export default function main(p = defaultParams): Shape3D {
  // ...
  let wateringCan = body
    .fuse(filler)
    .fillet(...)
    .fuse(spout)
    // ...
  return wateringCan;
}
```

There is no companion example demonstrating `ShapeConfig[]` (multi-color, multi-part) — even though `ShapeConfig` is fully exposed via the Monaco IntelliSense bundle (`libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts:1945-1955`) and the runtime supports it natively. The agent therefore (correctly) reaches for `ShapeConfig[]` when the user asks for colors, but has no contextual signal that doing so invalidates the `connectedComponents: 1` requirement it (or a previous turn) authored.

### Finding 6: Failure suggestion text doubles down on the wrong fix

When `connectedComponents` fails with `actual > expected`, the suggestion field hardcodes a fuse-everything resolution:

```126:134:packages/testing/src/geometry/evaluate-requirement.ts
      if (stats.connectedComponents !== expected) {
        return {
          passed: false,
          reason: `Connected components: expected ${expected}, got ${stats.connectedComponents}`,
          suggestion:
            stats.connectedComponents > expected
              ? `Model has ${stats.connectedComponents} disconnected pieces — ensure all parts are fused into ${expected} solid(s).`
              : `Model has fewer connected pieces than expected.`,
        };
      }
```

For the helicopter case the surfaced advice is _"ensure all parts are fused into 1 solid(s)"_ — exactly the regression-causing fix. There is no acknowledgement that the model may legitimately be a multi-`ShapeConfig` assembly, and no pointer to alternative checks (`boundingBox`, `watertight`-per-CU, sub-CU tests via `lib/*.ts` entries).

### Finding 7: Per-CU sub-tests are the only intent-aligned escape hatch today

Post `multi-file-test-json-migration.md`, `test.json` is a per-CU map. The helicopter session takes advantage of this — `lib/fuselage.ts`, `lib/tail.ts`, `lib/rotors.ts`, etc. each carry their own `connectedComponents` / `watertight` requirements and pass independently. Only `main.ts`, where `connectedComponents: 1` is asserted against the assembled multi-shape return, fails. So the architecture _can_ express the user's intent ("fuselage is one solid, tail is one solid, …") cleanly — but the prompt nudges the agent toward also asserting the same constraint at the top-level assembly, which is incompatible with multi-shape returns.

This is the high-leverage observation for the prompt fix: the per-CU pattern already gives us "every part is a single watertight solid" _without_ needing a single-component constraint on the top-level assembly.

### Finding 8: The vertex-coincidence layer is structurally insufficient — and the two checks already disagree on epsilon

`countConnectedComponents` and `isWatertight` solve different questions but both bottom out in spatial-hash vertex deduplication, and they ship with **mismatched epsilons**:

```4:4:packages/testing/src/geometry/connected-components.ts
const spatialEpsilon = 0.001;
```

```11:11:packages/testing/src/geometry/watertight.ts
const spatialEpsilon = 1e-5;
```

Both values are in glTF meter-scale units, so `connectedComponents` welds vertices within **1 mm** while `watertight` welds within **0.01 mm** (10 µm). The 100× difference is not deliberate parity — it reflects that each algorithm was tuned in isolation. More importantly, **for the helicopter regression, no choice of vertex-level epsilon recovers the user's intent**: Replicad calls `shape.mesh({...})` once per `ShapeConfig.shape` (`render-output.ts:178-181`) and OCCT's `BRepMesh_IncrementalMesh` places vertices independently per `TopoDS_Shape`. Two solids that share a planar contact face produce _parallel triangles at the same Z plane with arbitrarily-spaced vertices on each side_. The vertex sets are not "near-coincident"; they are _unrelated_ point clouds that happen to lie on the same plane. No realistic ε welds them.

The implication is architectural, not algorithmic: detecting "spatially-disjoint chunks" purely from the GLB requires operating _above_ the vertex layer. Three candidate algorithms, in increasing cost and accuracy:

1. **Per-primitive AABB overlap clustering.** Compute each GLB primitive's axis-aligned bounding box, build a Union-Find where two primitives merge iff their AABBs overlap (within a tunable `tolerance`). For the helicopter: fuselage, tail, rotors, skids, and weapons all have AABBs that overlap the fuselage's AABB → 1 component. Cost: O(N²) naive, O(N log N) with a sweep-line or AABB tree. Trade-off: false positives when parts are close but not touching (acceptable — the user explicitly wants "is this one assembly," not "is the boolean fuse welded"; the latter intent is already covered by `watertight`).
2. **Vertex-to-triangle proximity.** For each vertex of primitive A, find triangles in primitive B whose plane lies within `tolerance` _and_ whose 2D projection contains the vertex. Cost: O(V log T) per primitive pair with a triangle BVH. Accurate for touching faces; expensive to implement.
3. **Per-triangle proximity (BVH ↔ BVH).** Test triangle-triangle proximity within `tolerance`. Most accurate; most expensive (O(T log T) per pair).

Option 1 matches the user's explicit intent ("identify overlaps from the geometry exactly") with the lowest implementation cost, and the false-positive mode is recoverable via lower `tolerance`. Options 2/3 are reserved for a follow-up if AABB-clustering proves too coarse in production.

## Trade-offs

Three classes of fix lie on the chosen pure-geometry axis. We land **(A) prompt-only** and **(B) AABB-clustering algorithm** together as one atomic PR; **(C)** is a documented escape hatch held in reserve. Below the table, "Approaches considered and rejected" records the kernel-cooperation paths that were explicitly ruled out so future readers do not re-litigate them.

| Fix                                                                                                                                                                                                                                                                                                                                                                                                            | Pros                                                                                                                                                                                                                                                                                                                                         | Cons                                                                                                                                                                                                                                                                                                                            | Recommended              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **(A) Prompt + description-only fix**: drop `connectedComponents: 1` from the canonical example, rewrite the "available checks" sentence and the failure-suggestion text so the multi-shape interaction is explicit, fold the per-CU `watertight` pattern into the example.                                                                                                                                    | Zero code risk. Lands today. Removes the footgun even before any algorithm change. Aligned with context-engineering principle "examples over rules."                                                                                                                                                                                         | On its own, leaves the underlying algorithm broken. Users who _do_ want continuity on a multi-`ShapeConfig` model still cannot express it.                                                                                                                                                                                      | Yes, P0 (paired with B). |
| **(B) Pure-geometry algorithm rewrite — per-primitive AABB overlap clustering with tunable `tolerance`** (the central recommendation). Replace `countConnectedComponents`'s strict triangle-graph connectivity with: per-primitive AABB extraction → Union-Find merging primitives whose AABBs overlap within `requirement.tolerance` (default `0.1 mm`). Operates entirely on the GLB; no kernel cooperation. | Restores `connectedComponents: 1` for the helicopter (and all "is this one assembly" intents) without forcing boolean fuse or touching the kernel layer. Tunable per requirement (LLM can tighten via `tolerance: 0.01` for strict touching, loosen via `tolerance: 5` for proximity). Robust to tessellation. Future kernels work for free. | False positives when parts are close-but-not-touching at the chosen tolerance (e.g., a 2 mm gap with `tolerance: 5`); the LLM has to pick a sensible tolerance. Mitigated by the failure-suggestion text and the `watertight` separation of concerns ("is the boolean fuse welded" is `watertight`, not `connectedComponents`). | Yes, P0.                 |
| **(C) Per-triangle / vertex-to-triangle BVH proximity** as a follow-up only if (B) proves too coarse in production. Build per-primitive triangle BVH; merge primitives with at least one triangle within `tolerance` of another primitive's surface.                                                                                                                                                           | Eliminates the AABB false-positive class — only physically touching surfaces merge.                                                                                                                                                                                                                                                          | Significant implementation cost (BVH per primitive + triangle-triangle proximity). Negligible improvement for the helicopter case. Defer until empirical demand.                                                                                                                                                                | Optional, P2.            |

### Approaches considered and rejected

- **Kernel-supplied "part count" propagated via glTF root `extras` (the original "(B) `assemblyParts`" path).** A kernel writes `extras.taucad.assemblyParts = ShapeConfig[].length`; `analyzeGlb` reads it back. **Rejected** because it violates the layering principle that the GLB is the single source of truth: every kernel would need to opt in to the convention, third-party kernels (or hand-authored GLBs) would silently fail the check, and the testing layer becomes coupled to per-kernel metadata that no other GLB consumer respects. The user's directive — _"this also means no extras for conveying this type of information"_ — is binding here.
- **`mode: 'strict' | 'assembly'` switch on `connectedComponents`.** Was floated to let users opt between vertex-graph (strict) and AABB-clustering (assembly) semantics. **Rejected** because the strict mode is exactly the question `watertight` answers when asserted on a single-`Shape3D` CU, and adding a mode switch re-introduces overlap with `watertight`. One question per check; one algorithm per check.
- **27-neighbour vertex probing alone (port from `isWatertight`).** Was the original "old R7." **Rejected as a primary fix** because Finding 8 establishes that no realistic vertex-coincidence epsilon recovers the helicopter case — Replicad never welds vertices across distinct `TopoDS_Shape`s. 27-neighbour probing is a vertex-layer improvement; AABB-clustering is the layer above. We retain 27-neighbour probing as an internal-diagnostics improvement to `isWatertight` if it proves needed, but it is not on the agent-facing path.

## Addendum: Full Geometry-Test Audit (Intent + Overlap)

This addendum was added in a follow-up pass after the Findings/Trade-offs above. It enumerates **every** measurement check currently exposed to the LLM via `measurementTestRequirementSchema.check` (`packages/testing/src/schemas.ts:32`), names the unique question each one answers, and identifies overlap. The user mandate is that the LLM should never have to choose between two checks that achieve the same thing.

### A. Catalog — every check we ship today

Five checks are wired end-to-end (schema → evaluator → analyzer → prompt copy → tool description):

| Check                 | Source of truth                                                                                                                                               | Question it tries to answer                                                                                 | What it actually measures                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Sensitive to                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundingBox`         | `analyze-glb.ts:33-50` (gltf-transform `inspect()` per-scene `bboxMin`/`bboxMax`); evaluator `evaluate-requirement.ts:7-85`                                   | "Is the assembled model the right SIZE / POSITION on each axis I care about?"                               | Per-axis size and center derived from the scene-level bounding box, with per-axis opt-in (`expected.size.{x,y,z}`, `expected.center.{x,y,z}` are individually optional).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Geometry. Not sensitive to colour or part split.                                                                                                     |
| `meshCount`           | `analyze-glb.ts:31` (`report.meshes.properties.length`); evaluator `evaluate-requirement.ts:103-118`                                                          | The **prompt** sells it as "number of returned shapes." The **LLM** reads it as "number of intended parts." | Number of GLB _primitives_. For Replicad this equals `ShapeConfig[].length` (or `1` for a fused `Shape3D`). For OpenSCAD/Manifold/JSCAD/OCJS today it is always `1` because those kernels emit a single fused mesh. Independent of fuse / boolean topology.                                                                                                                                                                                                                                                                                                                                                                                              | Author choice between `Shape3D` and `ShapeConfig[]`; recolouring inflates it.                                                                        |
| `vertexCount`         | `analyze-glb.ts:30` (sum of `mesh.vertices` across primitives); evaluator `evaluate-requirement.ts:140-155`                                                   | "Does the tessellation produce ~N vertices?"                                                                | Total vertex count across every primitive. Driven by the kernel's tessellation tolerance (e.g. OCCT `BRepMesh_IncrementalMesh.linearDeflection` / `angularDeflection`), not by CAD intent. The existing unit test asserts `expected: { count: boxStats.vertexCount }`, which is circular — there is no kernel-stable vertex budget for a given CAD model.                                                                                                                                                                                                                                                                                                | Tessellation tolerance, kernel version, fillet count, parameter values.                                                                              |
| `connectedComponents` | `connected-components.ts` (single-cell spatial-hash + Union-Find on per-primitive triangles); evaluator `evaluate-requirement.ts:120-138`                     | "Is this one fused solid?" (today, post-fix becomes "How many spatially-disjoint chunks?")                  | Strict triangle-graph connectivity across all primitives. Two shapes only merge into one component if their tessellators happen to land vertices in the same `ε = 1 mm` bucket — Replicad never welds vertices across distinct `TopoDS_Shape` instances, so multi-`ShapeConfig` returns are inherently >1 even when the parts physically touch (Findings 1 + 6 + 8). **Fixable, not removable**: rewriting the algorithm to per-primitive AABB overlap clustering with tunable `tolerance` (Finding 8 option 1; Trade-offs (B); R2) restores the user's intent without kernel cooperation. The check name is retained; the algorithm changes underneath. | Today: author choice between `Shape3D` and `ShapeConfig[]`; recolouring inflates it. Post-fix: only physical (or tolerance-bridged) part separation. |
| `watertight`          | `watertight.ts` (27-neighbour spatial-hash + Euclidean fallback within `ε = 1e-5`, allowing ≤1% irregular edges); evaluator `evaluate-requirement.ts:157-166` | "Is the surface CLOSED — i.e., is this manifold/3D-printable?"                                              | Fraction of edges shared by exactly two triangles, with a 1% tolerance for pole/seam artefacts. Per-CU it correctly identifies a single fused solid. On a multi-`ShapeConfig` GLB, two non-touching closed solids both pass and the analyzer aggregates them, so it does NOT distinguish "1 fused solid" from "N independently closed solids."                                                                                                                                                                                                                                                                                                           | Geometry / CAD topology. Not sensitive to colour.                                                                                                    |

### B. Overlap matrix — which checks compete for the same intent

Each row is an intent the LLM might want to express; each cell marks the checks that can express it today. Cells with more than one check are the overlap surface that confuses the LLM.

| Intent                                                                    | `boundingBox` |   `meshCount`   | `vertexCount` | `connectedComponents` | `watertight` |
| ------------------------------------------------------------------------- | :-----------: | :-------------: | :-----------: | :-------------------: | :----------: |
| "Model is the right size / centred"                                       |   ✅ unique   |                 |               |                       |              |
| "Model has N intentional parts (e.g. fuselage + tail + skids)"            |               |   ✅ overlap    |               |      ✅ overlap       |              |
| "Model is one fused single solid" (assertion on a `Shape3D` return)       |               | ✅ overlap (=1) |               |    ✅ overlap (=1)    |  ✅ overlap  |
| "Surface is closed / manifold / printable"                                |               |                 |               |                       |  ✅ unique   |
| "Tessellation produces ~N vertices"                                       |               |                 |  ⚠️ brittle   |                       |              |
| "Boolean fuse worked — no silent disconnected fragments inside one solid" |               |                 |               |       ⚠️ niche        |  ⚠️ partial  |

Three problems leap out of the matrix:

1. **`meshCount` and `connectedComponents` collide** on both "N intentional parts" and "one fused single solid." The LLM cannot pick between them on principle; it picks whichever the canonical example used last (Finding 3 + Finding 4). For OpenSCAD/Manifold/JSCAD/OCJS — single-mesh kernels — they are byte-for-byte identical for the `=1` case, which is why the benchmark suite (`apps/api/app/benchmarks/model-benchmark-suite.ts:325, 341`) doubles them up redundantly (`{ meshCount: 1, connectedComponents: 1 }`).
2. **`vertexCount` is anti-deterministic** for an agent surface. It depends on tessellation parameters owned by the kernel (and per `parameter-architecture-v2.md`, those are user-tunable), not on the CAD model the LLM is authoring. Asserting a vertex budget locks the test to a specific tessellation setting; loosening tolerance will break the test even when the geometry is identical. The check is honest as a runtime diagnostic and dishonest as an agent-surface assertion.
3. **`connectedComponents` and `watertight` overlap on "fused single solid."** A single fused `Shape3D` passes both. They diverge only in two niche cases: (a) the boolean fuse silently produced disconnected interior fragments inside one mesh — `connectedComponents > 1`, `watertight` may still pass; (b) the model is a multi-`ShapeConfig[]` of independently-closed solids — `connectedComponents = N`, `watertight = true`. Case (a) is rare and better surfaced via screenshot+watertight in tandem; case (b) is exactly the helicopter regression and `connectedComponents` actively misleads on it.

### C. Consolidation — the three checks that survive

The minimum agent-facing surface that preserves all expressible intent without overlap. All three checks are **purely computational over the GLB** — no kernel cooperation, no glTF `extras`, no per-kernel metadata.

| Check                 | Question it answers (single, unambiguous)                              | Replaces / disposition                                                                                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundingBox`         | "Is the model the right SIZE / POSITION on the axes I care about?"     | unchanged                                                                                                       | Already unique; per-axis opt-in covers every dimension intent.                                                                                                                                                                                                                                                                                                                                                   |
| `connectedComponents` | "How many SPATIALLY-DISJOINT chunks does the geometry contain?"        | name kept, algorithm rewritten; subsumes "N intentional parts" intent that `meshCount` was incorrectly used for | **Algorithm change (R2)**: per-primitive AABB overlap clustering via Union-Find, with tunable `requirement.tolerance` (default `0.1 mm`). Survives recolouring (a multi-`ShapeConfig[]` whose parts touch returns `1`). Survives tessellation (no vertex-coincidence dependency). Future kernels work for free — no `extras`, no opt-in. The current strict triangle-graph implementation is replaced wholesale. |
| `watertight`          | "Is each compilation unit's surface CLOSED — manifold / 3D-printable?" | unchanged; subsumes `vertexCount` budget intent                                                                 | Already unique for "surface closed." When asserted **per CU** (Finding 7) it also covers "is each part a single fused solid," because a CU exporting one `Shape3D` is watertight iff its boolean fuse succeeded. Multi-`ShapeConfig` assemblies test it per CU.                                                                                                                                                  |

`meshCount` and `vertexCount` are **removed from the agent-facing schema**. `analyzeGlb` continues to compute both for internal diagnostics (geometry-pipeline tests, debugging telemetry) but the `measurementTestRequirementSchema.check` enum no longer accepts them, the prompt no longer mentions them, and the tool descriptions no longer offer them. `connectedComponents` is **kept** in the agent surface — only its algorithm is replaced; the existing `countConnectedComponents` function is retired in favour of an AABB-clustering implementation living in the same file.

This collapses the matrix to the diagonal:

| Intent                                                          | `boundingBox` | `connectedComponents` | `watertight` |
| --------------------------------------------------------------- | :-----------: | :-------------------: | :----------: |
| Right size / position                                           |   ✅ unique   |                       |              |
| N spatially-disjoint chunks (multi-shape assembly _or_ fused)   |               |       ✅ unique       |              |
| Each CU's surface is closed (≈ each part's boolean fuse welded) |               |                       |  ✅ unique   |

No overlap. The LLM never has to choose between two checks for the same intent. "Is this one fused solid?" is now answered by `watertight` on a single-`Shape3D` CU (the correct semantic question — a fused solid is closed-manifold), _not_ by counting topology components.

## Recommendations

The recommendations below are the implementation blueprint for the consolidation. They are organised in shipping order: R1–R8 land in one atomic PR (no half-vocabulary intermediate state), R9 follows as a benchmark migration, R10–R11 are documentation/policy follow-ups.

### Naming + default decisions (committed)

Two decisions are committed up front so the implementation never needs to re-litigate them:

- **Name retained as `connectedComponents`.** The post-fix semantics ("count of spatially-connected chunks via AABB clustering") still match the term; the agent-surface enum is unreleased so a rename has no compatibility benefit, only churn cost across schema, evaluator, prompt, tool descriptions, benchmark fixtures, and tests. Documented as a deliberate decision so a future reader does not propose `pieces` / `disconnectedChunks` again without weighing churn.
- **Default `tolerance` for `connectedComponents` = `0.1 mm`.** Loose enough to bridge tessellation-driven vertex-coordinate drift on contacting parts (Replicad's OCCT mesher easily lands vertices >0.01 mm apart on a planar contact face), tight enough to keep parts that visibly do not touch in separate components. Schema-overridable per requirement (`tolerance: 5` for proximity-based grouping; `tolerance: 0.001` for strict touching). `watertight` keeps its tighter internal `1e-5 m` epsilon since it answers a different question (vertex welding, not part proximity).

### Recommendation table

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Priority | Effort | Impact |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | **Schema consolidation.** In `packages/testing/src/schemas.ts:32`, replace the `check` enum `['boundingBox', 'meshCount', 'vertexCount', 'connectedComponents', 'watertight']` with the consolidated set `['boundingBox', 'connectedComponents', 'watertight']`. Per project convention (no shims for unreleased agent-surface APIs), this is a hard cut: the removed enum values become parse errors. Update `packages/testing/src/schemas.test.ts` so existing `meshCount` / `vertexCount` fixtures are migrated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | P0       | Low    | High   |
| R2  | **Algorithm rewrite for `countConnectedComponents` — the central change.** Replace the entire body of `packages/testing/src/geometry/connected-components.ts` with **per-primitive AABB overlap clustering**: (1) for each TRIANGLES primitive, compute its world-space AABB from the position accessor; (2) Union-Find over primitives, merging two primitives when their AABBs overlap or are within `tolerance` on every axis; (3) return the number of distinct roots. Thread `tolerance` from `evaluate-requirement.ts` (it is already on the requirement schema) — the function signature becomes `countConnectedComponents(document: Document, toleranceMm: number)`; default `0.1 mm` lives in the evaluator, not the geometry function. Migrate `connected-components.test.ts` fixtures: `multiShapeCode` (currently asserts `2`) gains an "AABBs overlap → 1" companion case; add a "two non-overlapping cubes" case asserting `2` with default tolerance and `1` with `tolerance: 50`. The previous strict triangle-graph implementation is removed (no fallback, no `mode` switch). | P0       | Med    | High   |
| R3  | **Drop `meshCount` and `vertexCount` from the evaluator.** Remove their `case` arms from `evaluate-requirement.ts` and the corresponding fixtures from `evaluate-requirement.test.ts`. `analyzeGlb` keeps computing both fields on `GeometryStats` for internal diagnostics (geometry-pipeline regression tests, debugging telemetry); only the agent-facing evaluator branches and the schema enum (R1) are pruned. `connectedComponents` does **not** get dropped — its evaluator branch stays and now calls the rewritten algorithm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P0       | Low    | High   |
| R4  | **Replace the canonical `<test_requirements>` example** in `apps/api/app/api/chat/prompts/cad-agent.prompt.ts:115-141`. Replace `req_solid`'s `connectedComponents: 1` framing with one that uses the _new_ semantics ("the assembly groups into one connected piece — pass `tolerance` if parts touch but do not weld vertices"), and pair it with per-CU `watertight` for "boolean fuse welded each part." Same edit to the duplicated example in `apps/api/app/api/tools/tools/tool-edit-tests.ts:36-51`. Single-source the example via a shared constant (e.g. `packages/testing/src/prompt-examples.ts`) so the prompt and tool description cannot drift apart again — context-engineering policy says "never explain the same concept twice."                                                                                                                                                                                                                                                                                                                                             | P0       | Low    | High   |
| R5  | **Replace the "Available checks" sentence** (`cad-agent.prompt.ts:139` and `tool-edit-tests.ts:53`) with the three-check vocabulary. Each blurb names the one question the check answers, with no overlap, and explicitly calls out the `tolerance` knob on `connectedComponents` (see "Updated check copy" below). Source it from the same shared constant introduced in R4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P0       | Low    | High   |
| R6  | **Rewrite the failure-suggestion text in `evaluate-requirement.ts`.** Once `meshCount` / `vertexCount` cases are removed (R3), only `boundingBox` / `connectedComponents` / `watertight` need suggestion copy. Make `connectedComponents` failures explicitly recommend either (a) loosening `tolerance` if the parts visually touch but the AABBs do not overlap at the current value, (b) returning fewer top-level shapes from `main()` if the LLM intended one fused solid, or (c) raising the expected count if the model is intentionally a multi-part assembly. Make `watertight` failures recommend booleans (no `Compound` / glue layer), checking for tiny gaps with `screenshot`, and — if asserting on the assembled `main.ts` — moving the requirement to per-CU `lib/<part>.ts` entries.                                                                                                                                                                                                                                                                                          | P0       | Low    | High   |
| R7  | **Update the `<error_handling>` line** in `cad-agent.prompt.ts:255` so it stops prescribing "screenshot for `connectedComponents` failures" (which currently encourages a wrong-fix loop). Recast as: "For geometry failures, first decide whether the requirement still matches the model's intent (e.g., a `connectedComponents` failure after a recolouring may just need a higher `tolerance` or a different expected count, not boolean fuse); only screenshot when the requirement is correct and the geometry is wrong."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | P0       | Low    | Med    |
| R8  | **Add a multi-shape Replicad companion example.** Create `apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multishape.ts` (sibling to `replicad.prompt.example.ts`) that returns a `ShapeConfig[]` with per-part colours, and wire it into `replicad.prompt.config.ts` so the prompt ships both single-shape and multi-shape canonical examples. Pair it with a `test.json` snippet that asserts `boundingBox` on the assembled `main.ts` and `watertight` per `lib/<part>.ts`. The example deliberately omits a top-level `connectedComponents` requirement — multi-shape assemblies whose parts are deliberately separate (e.g. two skids) should not be tested for one-component continuity — and the prompt copy explains when `connectedComponents` _is_ appropriate (single-`Shape3D` returns, or multi-shape assemblies whose parts touch). Gives the agent a colour pattern to imitate and the matching test pattern, eliminating the regression demonstrated in the helicopter session.                                                                     | P0       | Low    | High   |
| R9  | **Migrate the benchmark suite.** `apps/api/app/benchmarks/model-benchmark-geometry.ts:15-24` defines `BenchmarkGeometryExpectation` with `meshCount` / `connectedComponents` / `watertight` fields; remove the `meshCount` field. Every entry in `apps/api/app/benchmarks/model-benchmark-suite.ts:184, 199, 214, 235, 255, 274, 290, 306, 325, 341` keeps `connectedComponents: 1` (the value is unchanged for OpenSCAD's single-fused-mesh outputs under the new algorithm — one primitive ⇒ one AABB ⇒ one component) and drops the now-redundant `meshCount: 1`. Update `apps/api/app/benchmarks/model-benchmark-geometry.test.ts` fixtures.                                                                                                                                                                                                                                                                                                                                                                                                                                                | P1       | Low    | Med    |
| R10 | **Update kernel testing docs.** `apps/ui/content/docs/(runtime)/api/testing.mdx:47` and `apps/ui/content/docs/(runtime)/guides/testing-kernels.mdx:189-213` reference `getGeometryStatsFromInspect`, `expectMeshCount`, `expectVertexCount` from `@taucad/runtime/testing` — these are _kernel author-facing_ helpers (peer-dep Vitest assertions on raw GLB), not agent-facing checks, so they stay. Add a one-paragraph "Agent-facing checks vs kernel-author assertions" callout in `testing.mdx` so contributors do not confuse the two surfaces and re-introduce `meshCount` / `vertexCount` into `measurementTestRequirementSchema`. Add a sentence noting that `connectedComponents` on the agent surface uses AABB clustering (not vertex-graph connectivity) and link this research.                                                                                                                                                                                                                                                                                                   | P1       | Low    | Low    |
| R11 | **Lift the no-overlap rule into policy.** Add a "Geometry-test surface" section to `docs/policy/testing-policy.md` (the policy already cross-links this research) prescribing: (1) the three-check agent-facing surface (`boundingBox` / `connectedComponents` / `watertight`); (2) the rule that adding a new check requires demonstrating it answers a question none of the existing three can; (3) per-CU `watertight` is the canonical way to assert "single fused solid," not `connectedComponents: 1`; (4) all agent-facing geometry checks operate purely on the GLB — no kernel-supplied metadata, no glTF `extras`. Cross-link from this research's `related` frontmatter.                                                                                                                                                                                                                                                                                                                                                                                                             | P2       | Low    | Med    |

### Items intentionally dropped from the recommendation list

Recorded here so future readers do not re-litigate them:

- **Kernel-supplied "part count" via glTF `extras` (was prior R2 — `assemblyParts`).** Dropped because the GLB is the single source of truth for the testing layer (user directive + Trade-offs "Approaches considered and rejected"). The continuity intent it tried to express is now satisfied by the rewritten `connectedComponents` (R2 above) operating purely on geometry. Future kernels emit valid glTF and inherit the check for free.
- **Optional `mode: 'strict' | 'assembly'` switch on `connectedComponents`.** Was floated as a way to opt between vertex-graph (strict) and AABB-clustering (assembly) semantics. Dropped because the strict-mode question ("did the boolean fuse weld vertices?") is exactly what `watertight` answers on a single-`Shape3D` CU; adding a mode switch re-introduces overlap with `watertight`. One question per check.
- **27-neighbour vertex probing as the primary fix to `countConnectedComponents`.** Dropped because Finding 8 establishes that no vertex-coincidence epsilon recovers the helicopter case — Replicad never welds vertices across distinct `TopoDS_Shape`s. AABB clustering operates above the vertex layer and is the correct fix layer. Whether to _also_ port 27-neighbour probing into `isWatertight` is internal-diagnostic work; defer until empirical demand.

## Rollout Sketch

1. **PR 1 (P0 batch — schema + algorithm + prompt + example)**: R1 + R2 + R3 + R4 + R5 + R6 + R7 + R8 in one atomic change. The schema cut, the `countConnectedComponents` algorithm rewrite, the evaluator pruning of `meshCount` / `vertexCount`, the prompt example, the check vocabulary, the failure suggestions, the error-handling line, and the multi-shape example all ship together so no intermediate state exposes a half-vocabulary to the LLM. Touch order: (a) `packages/testing/src/geometry/connected-components.ts` algorithm + tests; (b) `packages/testing/src/schemas.ts` enum + tests; (c) `packages/testing/src/geometry/evaluate-requirement.ts` cases + suggestions + tests; (d) `packages/testing/src/prompt-examples.ts` shared constant + tests; (e) `apps/api/app/api/chat/prompts/cad-agent.prompt.ts` (example, vocabulary, error*handling); (f) `apps/api/app/api/tools/tools/tool-edit-tests.ts` (description sourced from shared constant); (g) `apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multishape.ts` + `replicad.prompt.config.ts` wiring. Verification: (1) replay the helicopter repro session — the agent should now author `connectedComponents: 1` (with default tolerance) on the assembled `main.ts` \_and* it should pass; (2) run `cad-agent.prompt.test.ts`, `prompt-section-registry.test.ts`, `tool-edit-tests.test.ts`, `evaluate-requirement.test.ts`, `schemas.test.ts`, `connected-components.test.ts`, `watertight.test.ts`. There is no kernel-runtime work in this PR — `packages/runtime/src/kernels/replicad/utils/render-output.ts` is untouched (no `extras` propagation).
2. **PR 2 (P1 batch — benchmark + docs)**: R9 + R10. The benchmark migration is mechanical (drop `meshCount`; `connectedComponents: 1` values are unchanged because OpenSCAD emits a single fused mesh under both old and new algorithms). The docs callout prevents future contributors re-introducing the dropped checks.
3. **PR 3 (P2 — policy)**: R11 once the surface has settled in production for one or two release cycles.

### Risk + observability

- **Algorithm regression risk**: the `countConnectedComponents` rewrite changes return values for inputs whose AABBs overlap but whose triangle graphs were previously disconnected. The benchmark suite (OpenSCAD-only single fused meshes) is unaffected (one primitive ⇒ one AABB ⇒ one component, before and after). The user-facing risk surface is `test.json` files authored against the old strict-graph semantics; mitigated by the prompt rewrite (R4) authoring tests against the new semantics from PR-1 onward, and by the failure-suggestion text (R6) explicitly mentioning the `tolerance` knob.
- **Verification artefacts**: capture before/after `connectedComponents` values for the helicopter repro and at least one OpenSCAD benchmark fixture in the PR description so reviewers can see the algorithmic shift without re-running.

## Code Examples

### Updated `measurementTestRequirementSchema.check` enum (R1)

```typescript
// packages/testing/src/schemas.ts
export const measurementTestRequirementSchema = baseTestRequirementSchema.extend({
  type: z.literal('measurement'),
  check: z.enum(['boundingBox', 'connectedComponents', 'watertight']),
  expected: z.record(z.string(), z.unknown()).optional().describe('Expected values for the measurement'),
  tolerance: z
    .number()
    .optional()
    .describe(
      'Acceptable tolerance in mm. For boundingBox: per-axis tolerance on size/center. ' +
        'For connectedComponents: maximum gap between primitive AABBs that still counts as ' +
        '"connected" (default 0.1).',
    ),
});
```

### `GeometryStats` (R2 — no shape change)

```typescript
// packages/testing/src/geometry/types.ts
export type GeometryStats = {
  /** Per-axis assembled bounding box. */
  boundingBox?: { size: [number, number, number]; center: [number, number, number] };
  /**
   * Number of spatially-disjoint chunks via per-primitive AABB overlap clustering
   * with a tunable tolerance (mm). Computed lazily by the evaluator since the
   * algorithm needs the requirement-supplied tolerance.
   */
  connectedComponents: (toleranceMm: number) => number;
  /** Closed-manifold check (≤1% irregular edges). */
  watertight: boolean;
  /** Internal diagnostics — not exposed via the agent-surface schema. */
  vertexCount: number;
  meshCount: number;
};
```

(The `connectedComponents` field changes from `number` to a tolerance-parameterised getter so `analyzeGlb` does not need to commit to a tolerance up front. Implementations may memoise per-tolerance.)

### `countConnectedComponents` algorithm rewrite (R2)

Replaces the entire body of `packages/testing/src/geometry/connected-components.ts`. No glTF `extras`, no kernel cooperation — operates purely on GLB primitives.

```typescript
// packages/testing/src/geometry/connected-components.ts (sketch)
import type { Document } from '@gltf-transform/core';

type AABB = { min: [number, number, number]; max: [number, number, number] };

const computePrimitiveAABB = (positions: Float32Array): AABB => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = positions[i + axis];
      if (v < min[axis]) min[axis] = v;
      if (v > max[axis]) max[axis] = v;
    }
  }
  return { min, max };
};

const aabbsOverlapWithin = (a: AABB, b: AABB, toleranceMeters: number): boolean => {
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis] + toleranceMeters < b.min[axis]) return false;
    if (b.max[axis] + toleranceMeters < a.min[axis]) return false;
  }
  return true;
};

/**
 * Counts spatially-disjoint chunks across all TRIANGLES primitives by clustering
 * primitives whose axis-aligned bounding boxes overlap within `toleranceMm`.
 *
 * @param document - A glTF-Transform Document (positions are in glTF meter units)
 * @param toleranceMm - Maximum gap (mm) between two AABBs that still counts as connected
 * @returns The number of distinct spatial clusters
 * @public
 */
export const countConnectedComponents = (document: Document, toleranceMm: number): number => {
  const toleranceMeters = toleranceMm / 1000;
  const aabbs: AABB[] = [];

  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue; // TRIANGLES only
      const pos = primitive.getAttribute('POSITION');
      if (!pos) continue;
      aabbs.push(computePrimitiveAABB(pos.getArray() as Float32Array));
    }
  }

  if (aabbs.length === 0) return 0;

  // Union-Find over primitives. O(N²) is acceptable for the primitive counts we see
  // in practice (≤ low hundreds); swap to a sweep-line if benchmarks ever demand it.
  const parent = aabbs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      if (aabbsOverlapWithin(aabbs[i], aabbs[j], toleranceMeters)) union(i, j);
    }
  }

  const roots = new Set<number>();
  for (let i = 0; i < aabbs.length; i++) roots.add(find(i));
  return roots.size;
};
```

Notes:

- `tolerance` is in **mm** at the schema layer (matching `boundingBox` tolerance units the LLM already understands) and converted to glTF meter units inside the function. The default `0.1 mm` lives in the evaluator (R6), not in the geometry function — keeping the geometry function pure.
- The algorithm is **purely computational over the GLB**: positions only. No glTF `extras`, no scene metadata, no kernel cooperation. Future kernels emit valid glTF and the check works.
- O(N²) over primitives is fine for the realistic upper bound (low hundreds). Swap to a sweep-line / R-tree only if profiling demands it.

### Replacement canonical `test_requirements` example (R4)

```json
{
  "main.ts": {
    "requirements": [
      {
        "id": "req_width",
        "type": "measurement",
        "description": "Box is 100mm wide",
        "check": "boundingBox",
        "expected": { "size": { "x": 100 } },
        "tolerance": 1
      },
      {
        "id": "req_height",
        "type": "measurement",
        "description": "Box is 25mm tall",
        "check": "boundingBox",
        "expected": { "size": { "z": 25 } },
        "tolerance": 1
      },
      {
        "id": "req_centered",
        "type": "measurement",
        "description": "Centered at origin XY",
        "check": "boundingBox",
        "expected": { "center": { "x": 0, "y": 0 } },
        "tolerance": 0.5
      },
      {
        "id": "req_one_piece",
        "type": "measurement",
        "description": "Assembly groups into 1",
        "check": "connectedComponents",
        "expected": { "count": 1 }
      },
      { "id": "req_watertight", "type": "measurement", "description": "Mesh is watertight", "check": "watertight" }
    ]
  }
}
```

### Updated check copy (R5)

Single-sourced via a shared constant; rendered identically in the system prompt body and the `edit_tests` tool description.

```text
Available checks (each answers exactly one question — no overlap):
- boundingBox          — "Is the model the right SIZE / POSITION?" Per-axis opt-in for
                         size and center; `tolerance` is per-axis tolerance in mm.
- connectedComponents  — "How many SPATIALLY-DISJOINT CHUNKS does the geometry contain?"
                         Pure-geometry AABB clustering. `tolerance` (mm, default 0.1) is
                         the maximum gap between two parts' bounding boxes that still
                         counts as "connected." Use `expected.count: 1` for "the assembly
                         is one cohesive thing"; raise tolerance if parts visibly touch
                         but the test still reports >1.
- watertight           — "Is each compilation unit's surface CLOSED (manifold / 3D-printable)?"
                         The canonical "did the boolean fuse succeed" guardrail. Assert
                         per-CU (lib/<part>.ts) so each part is verified independently of
                         how they are returned from main().

For "is this one fused solid?" assert `watertight` on a CU that exports a single Shape3D
— a fused solid is closed-manifold iff the boolean fuse succeeded. Do NOT use
`connectedComponents` for that intent (it answers "how many spatial chunks," not
"is the boolean fuse welded").
```

### Replacement failure suggestions (R6)

```typescript
// packages/testing/src/geometry/evaluate-requirement.ts (sketch)
const DEFAULT_CONNECTED_TOLERANCE_MM = 0.1;

case 'connectedComponents': {
  const expected = (requirement.expected as { count?: number } | undefined)?.count;
  if (expected === undefined) {
    return { passed: false, reason: 'Missing expected.count', suggestion: 'Add expected: { count: N }' };
  }
  const tolerance = requirement.tolerance ?? DEFAULT_CONNECTED_TOLERANCE_MM;
  const actual = stats.connectedComponents(tolerance);
  if (actual !== expected) {
    return {
      passed: false,
      reason: `Connected components: expected ${expected}, got ${actual} (tolerance: ${tolerance}mm)`,
      suggestion:
        actual > expected
          ? `Got ${actual} disjoint chunks at ${tolerance}mm tolerance. If parts visibly touch, ` +
            `raise tolerance (e.g. tolerance: ${Math.max(tolerance * 10, 1)}). If parts are ` +
            `intentionally separate, raise expected.count to ${actual}. If you want them welded ` +
            `into one solid, fuse them in the kernel and assert watertight on the resulting CU.`
          : `Got ${actual} disjoint chunks (fewer than expected). Either lower expected.count to ` +
            `${actual} or split the model so it returns ${expected} top-level shapes.`,
    };
  }
  return { passed: true, reason: '', suggestion: '' };
}

case 'watertight': {
  if (!stats.watertight) {
    return {
      passed: false,
      reason: 'Mesh is not watertight (has boundary edges)',
      suggestion:
        'The surface has gaps. If you are asserting on an assembled main.ts that returns ' +
        'multiple ShapeConfigs, move this requirement into each lib/<part>.ts entry instead — ' +
        'multi-part assemblies are watertight per CU, not as one mesh. Otherwise check for ' +
        'failed boolean ops (use screenshot to inspect) or replace Compound with proper fuse.',
    };
  }
  return { passed: true, reason: '', suggestion: '' };
}
```

### Replicad multi-shape companion example (R8)

```typescript
// apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multishape.ts
import { drawRoundedRectangle, makeCylinder, type ShapeConfig } from 'replicad';

export const defaultParams = { bodyLength: 80, bodyWidth: 30, wheelRadius: 8 } as const;

export default function main(p = defaultParams): ShapeConfig[] {
  const body = drawRoundedRectangle(p.bodyLength, p.bodyWidth, 4).sketchOnPlane('XY').extrude(20);
  const wheelL = makeCylinder(p.wheelRadius, 6).translate([-p.bodyLength / 3, p.bodyWidth / 2, 0]);
  const wheelR = makeCylinder(p.wheelRadius, 6).translate([+p.bodyLength / 3, p.bodyWidth / 2, 0]);
  return [
    { shape: body, color: '#1E90FF', name: 'Body' },
    { shape: wheelL, color: '#222222', name: 'WheelLeft' },
    { shape: wheelR, color: '#222222', name: 'WheelRight' },
  ];
}
```

Companion `test.json`. The wheels touch the body, so the AABB-clustering algorithm groups all three into one connected piece at the default tolerance — `connectedComponents: 1` passes despite the multi-`ShapeConfig` return. Per-CU `watertight` proves each part's boolean fuse welded.

```json
{
  "main.ts": {
    "requirements": [
      {
        "id": "req_extent",
        "type": "measurement",
        "description": "Assembled extent ~80x30",
        "check": "boundingBox",
        "expected": { "size": { "x": 80, "y": 30 } },
        "tolerance": 2
      },
      {
        "id": "req_one_piece",
        "type": "measurement",
        "description": "Wheels touch body",
        "check": "connectedComponents",
        "expected": { "count": 1 }
      }
    ]
  },
  "lib/body.ts": {
    "requirements": [
      { "id": "req_body_wt", "type": "measurement", "description": "Body is watertight", "check": "watertight" }
    ]
  },
  "lib/wheel.ts": {
    "requirements": [
      { "id": "req_wheel_wt", "type": "measurement", "description": "Wheel is watertight", "check": "watertight" }
    ]
  }
}
```

For an assembly whose parts are _deliberately_ separate (e.g., two skids that do not touch), the LLM either omits the top-level `connectedComponents` requirement entirely or asserts `expected.count: <number-of-separate-clusters>` — the failure-suggestion text (R6) walks the agent through both options.

## References

- `packages/testing/src/schemas.ts` — `measurementTestRequirementSchema.check` enum to consolidate (R1); `tolerance` description to expand for `connectedComponents`.
- `packages/testing/src/geometry/types.ts` — `GeometryStats` shape change (`connectedComponents: number` becomes a tolerance-parameterised getter; `meshCount` / `vertexCount` retained as internal-diagnostic numeric fields) (R2).
- `packages/testing/src/geometry/connected-components.ts` — entire algorithm rewrite to per-primitive AABB clustering with tunable tolerance (R2). No glTF `extras` consumption.
- `packages/testing/src/geometry/connected-components.test.ts` — fixture migration: `multiShapeCode` (currently asserts `2`) gains an "AABBs overlap → 1" companion case; new "two non-overlapping cubes" case asserting `2` at default tolerance and `1` at `tolerance: 50` (R2).
- `packages/testing/src/geometry/watertight.ts` — algorithmic template for spatial hashing + Euclidean fallback (referenced in Finding 8); no functional change in this PR. The internal `1e-5 m` epsilon stays — it answers a different question (vertex welding) than `connectedComponents` (part proximity).
- `packages/testing/src/geometry/analyze-glb.ts` — no `extras` read. `connectedComponents` field becomes a getter that calls the new algorithm with the requested tolerance.
- `packages/testing/src/geometry/evaluate-requirement.ts` — drop `meshCount` / `vertexCount` cases (R3); rewrite `connectedComponents` and `watertight` suggestions; introduce `DEFAULT_CONNECTED_TOLERANCE_MM = 0.1` (R6).
- `packages/testing/src/prompt-examples.ts` — **new file**, single-source-of-truth for the canonical `<test_requirements>` example and the "Available checks" copy block; consumed by both the prompt and the `edit_tests` tool description (R4 + R5).
- `apps/api/app/api/chat/prompts/cad-agent.prompt.ts` — `<test_requirements>` example sourced from `prompt-examples.ts` (R4); check vocabulary line sourced from `prompt-examples.ts` (R5); `<error_handling>` line rewritten (R7).
- `apps/api/app/api/tools/tools/tool-edit-tests.ts` — example + checks copy sourced from `prompt-examples.ts` (R4 + R5).
- `apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example.ts` — single-shape canonical example to be paired with the multi-shape sibling (R8).
- `apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.example-multishape.ts` — **new file**, multi-`ShapeConfig[]` companion example wired into `replicad.prompt.config.ts` (R8).
- `apps/api/app/benchmarks/model-benchmark-geometry.ts`, `apps/api/app/benchmarks/model-benchmark-suite.ts`, `apps/api/app/benchmarks/model-benchmark-geometry.test.ts` — drop `meshCount` field; `connectedComponents: 1` values unchanged for OpenSCAD's single-fused-mesh outputs under the new algorithm (R9).
- `apps/ui/content/docs/(runtime)/api/testing.mdx`, `apps/ui/content/docs/(runtime)/guides/testing-kernels.mdx` — kernel-author docs to clarify with an "agent-facing vs kernel-author" callout, plus a sentence on `connectedComponents`' new AABB-clustering semantics (R10).
- `docs/policy/testing-policy.md` — destination for the no-overlap rule + the "all agent-facing geometry checks are pure-GLB" rule (R11).
- **Untouched** (explicitly): `packages/runtime/src/kernels/replicad/utils/render-output.ts`. The kernel-extras path was rejected in Trade-offs; no glTF `extras` propagation is wired.
- Related: `docs/research/multi-file-test-json-migration.md` — the per-CU `test.json` architecture this research builds on; per-CU `watertight` is the canonical "did the boolean fuse weld" guardrail and pairs with assembly-level `connectedComponents` for "is the assembly cohesive."
