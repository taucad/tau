---
title: 'Replicad `makeBaseBox` Center-Ambiguity Failure Mode'
description: 'Root-cause investigation: why the agent repeatedly mis-positions makeBaseBox geometry and how to fix it at source rather than in the prompt.'
status: active
created: '2026-05-15'
updated: '2026-05-15'
category: investigation
related:
  - docs/policy/context-engineering-policy.md
  - apps/api/app/api/chat/prompts/cad-agent.prompt.ts
  - apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.config.ts
---

# Replicad `makeBaseBox` Center-Ambiguity Failure Mode

Investigates why the CAD agent repeatedly mis-positions `replicad.makeBaseBox` geometry across complex multi-component models, and decides whether the fix belongs in the system prompt or in the upstream replicad source surfaced via `libs/api-extractor`.

## Executive Summary

`replicad.makeBaseBox(x, y, z)` has **partially-centered** semantics — centered in X and Y, origin-based in Z — that are nowhere documented. Both the upstream source (`repos/replicad/packages/replicad/src/shortcuts.ts`) and the api-extractor output consumed by the agent (`libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts`) carry no JSDoc on the function. The signature `(xLength: number, yLength: number, zLength: number) => Shape3D` is behaviour-free. In the data-center transcript the agent first assumed "fully centered", then over-corrected to "fully origin-based", and never landed on the actual hybrid semantics — its `cbox` recovery helper is itself mathematically wrong (off by `x/2, y/2` on the XY axes). The smoking gun is **missing JSDoc at the source**, not a prompt or workflow issue. The correct fix is to add JSDoc to `repos/replicad/packages/replicad/src/shortcuts.ts` (and the small set of similarly under-documented primitives) and re-run `pnpm nx extract-replicad api-extractor`. Per `docs/policy/context-engineering-policy.md` (Single Source of Truth, Examples Over Rules) and the user's standing "fix at source, never band-aid" preference, prompt-level guidance is the wrong altitude.

## Problem Statement

A complex multi-file replicad model (the "Data Center Setup" transcript at `~/Downloads/initial_design_2026-05-15T01-55.md`) failed bounding-box tests on the very first render:

```
- FAIL [lib/server.ts]: 1U server is ~44mm tall
  Bounding box mismatch:
    size.z: expected 44.45 (±2), got 64.425 — extends from
    'AnyShape#part1' (z.min=0.000) to 'AnyShape#part0' (z.max=64.425)
```

The reported height (`64.425 mm`) is exactly `h + h/2` where `h = 42.95 mm`. Every chassis "ear" component built with `makeBaseBox(earW, 4, h)` and `.translate([..., ..., h/2])` ended up doubly Z-shifted because the agent thought the box was centered in Z (so `h/2` would put the centre at `h/2` and the top at `h`). In reality the box already runs `0..h` in Z, so translating by `+h/2` placed it at `h/2..3h/2`.

The same misconception then drove the agent to "fix" the issue by introducing a `cbox` helper (transcript line 2205 onward):

```typescript
// makeBaseBox spans (0,0,0) to (x,y,z). Helper to get a centered box.
export function cbox(x: number, y: number, z: number): Shape3D {
  return makeBaseBox(x, y, z).translate([-x / 2, -y / 2, -z / 2]);
}
```

The comment is wrong — `makeBaseBox` does **not** span `(0,0,0)` to `(x,y,z)` — and the helper itself silently breaks XY positioning across the entire downstream model.

## Methodology

1. Read the full agent transcript from `~/Downloads/initial_design_2026-05-15T01-55.md`, isolating every `makeBaseBox` call site and every `<thinking>` block referencing centring/origin semantics.
2. Inspected the upstream replicad source via the workspace `repos/` mount: `repos/replicad/packages/replicad/src/shortcuts.ts`.
3. Inspected the api-extractor output the agent actually consumes: `libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts` and `libs/api-extractor/src/generated/replicad/replicad-api-data.json`.
4. Audited the api-extractor pipeline (`libs/api-extractor/src/extract-replicad-api.ts`) for JSDoc-stripping behaviour.
5. Audited every replicad doc page mentioning `makeBaseBox` under `repos/replicad/packages/replicad-docs/`.
6. Audited the kernel-specific prompt config (`apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.config.ts`) and canonical example (`replicad.prompt.example.ts`).

## Findings

### Finding 1: `makeBaseBox` is partially centered — XY centred, Z corner-based

The actual implementation in `repos/replicad/packages/replicad/src/shortcuts.ts`:

```1:16:repos/replicad/packages/replicad/src/shortcuts.ts
import { Shape3D } from "./shapes";
import Sketcher from "./Sketcher";

export const makeBaseBox = (
  xLength: number,
  yLength: number,
  zLength: number
): Shape3D => {
  return new Sketcher()
    .movePointerTo([-xLength / 2, yLength / 2])
    .hLine(xLength)
    .vLine(-yLength)
    .hLine(-xLength)
    .close()
    .extrude(zLength);
};
```

Reading the geometry:

| Axis | Sketch / extrude operation                    | Resulting span                      |
| ---- | --------------------------------------------- | ----------------------------------- |
| X    | `movePointerTo([-x/2, y/2]).hLine(x)`         | `[-x/2, +x/2]` (**centred**)        |
| Y    | `movePointerTo([-x/2, y/2]).vLine(-y)`        | `[-y/2, +y/2]` (**centred**)        |
| Z    | `.extrude(z)` from sketch on default XY plane | `[0, +z]` (**corner-based at z=0**) |

This hybrid is the worst of both worlds. It matches neither the THREE.js / `manifold.cube({ center: true })` convention (fully centred) nor the OpenSCAD default `cube([x,y,z])` convention (fully corner-based), and it does not match the sibling `makeBox(corner1, corner2)` (explicit corner-to-corner) within replicad itself. There is no naming or signature signal pointing to the hybrid.

The replicad docs implicitly confirm the hybrid via face-selection examples but never state it explicitly:

````76:88:repos/replicad/packages/replicad-docs/docs/tutorial-overview/modifications.md
```js withWorkbench
const { makeBaseBox, EdgeFinder } = replicad;

export default function main() {
  let base = makeBaseBox(30, 50, 10);
  return base.chamfer(
    {
      distances: [5, 2],
      selectedFace: (f) => f.inPlane("YZ", 15),
    },
    (e) => e.inPlane("XY", 10)
  );
}
````

````

`f.inPlane("YZ", 15)` against `makeBaseBox(30, 50, 10)` selects the +X face at `x = 15 = +x/2` (proves XY centred), and `e.inPlane("XY", 10)` selects the top face at `z = 10 = +z` (proves Z corner-based). The doc never says any of this in prose.

### Finding 2: Upstream replicad has zero JSDoc on the primitive

`repos/replicad/packages/replicad/src/shortcuts.ts` ships `makeBaseBox` with no leading `/** … */` block. The same is true for every other `make*` shortcut in that file. Consequently the bundled type declaration the agent reads is signature-only:

```1521:1525:libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts
export declare const makeAx3: (center: Point, dir: Point, xDir?: Point) => gp_Ax3;

export declare const makeBaseBox: (xLength: number, yLength: number, zLength: number) => Shape3D;

export declare const makeBezierCurve: (points: Point[]) => Edge;
````

…and the structured API data the prompt embeds is a near-empty record:

```1072:1077:libs/api-extractor/src/generated/replicad/replicad-api-data.json
    {
      "name": "makeBaseBox",
      "kind": "constant",
      "category": "Primitives & Makers",
      "signature": "export declare const makeBaseBox: (xLength: number, yLength: number, zLength: number) => Shape3D;"
    },
```

There is no behavioural information anywhere in the agent's reachable surface area. Even Monaco IntelliSense (driven by the same bundled `.d.ts`) cannot help a human user disambiguate.

### Finding 3: The api-extractor does not strip JSDoc — replicad simply has none to extract

`libs/api-extractor/src/extract-replicad-api.ts` does set `removeComments: true` on its TypeScript printer (line 105), but only for the **structured signature string** in `replicad-api-data.json`. The bundled `.d.ts` consumed by both the prompt (`replicadTypes` in `libs/api-extractor/src/index.ts`) and Monaco IntelliSense is the verbatim original `node_modules/replicad/dist/replicad.d.ts`:

```226:238:libs/api-extractor/src/extract-replicad-api.ts
export function buildBundledTypes(): Record<string, string> {
  const originalTypes = readFileSync(typeDefinitionsPath, 'utf8');

  return {
    replicad: [
      '// Bundled type declarations for replicad.',
      '// Auto-generated by extract-replicad-api.ts - do not edit manually.',
      '',
      originalTypes.trim(),
      '',
    ].join('\n'),
  };
}
```

So if the upstream `replicad.d.ts` had JSDoc, the agent would see it. The pipeline is fine. The upstream source is the gap.

### Finding 4: The agent's "recovery" was itself wrong

Once the bounding box test failed, the agent made a second wrong assumption — that the box is fully corner-based at `(0,0,0)` — and authored this helper (transcript line 2205):

```typescript
// makeBaseBox spans (0,0,0) to (x,y,z). Helper to get a centered box.
export function cbox(x: number, y: number, z: number): Shape3D {
  return makeBaseBox(x, y, z).translate([-x / 2, -y / 2, -z / 2]);
}
```

Tracing the resulting span against the **true** `makeBaseBox` semantics:

| Axis | True `makeBaseBox` span | After `cbox` translate `[-x/2, -y/2, -z/2]` | Intended       | Actual                    |
| ---- | ----------------------- | ------------------------------------------- | -------------- | ------------------------- |
| X    | `[-x/2, +x/2]`          | `[-x, 0]`                                   | `[-x/2, +x/2]` | **WRONG** — off by `-x/2` |
| Y    | `[-y/2, +y/2]`          | `[-y, 0]`                                   | `[-y/2, +y/2]` | **WRONG** — off by `-y/2` |
| Z    | `[0, +z]`               | `[-z/2, +z/2]`                              | `[-z/2, +z/2]` | correct                   |

The cure is worse than the disease. Because every part of the data centre uses `cbox` consistently, the model's parts are correctly aligned **relative to each other**, so the screenshot looks plausible — but every absolute `translate` argument the agent computes (rack centre, aisle widths, floor span) is now off by half a part in X and Y. A correct helper would only translate Z:

```typescript
const cbox = (x: number, y: number, z: number): Shape3D => makeBaseBox(x, y, z).translate([0, 0, -z / 2]); // XY already centred
```

The agent could not recover even with empirical evidence in front of it because the hybrid semantic is too unintuitive to guess from negative results alone. Each axis fails in a different direction; bounding-box deltas don't disambiguate them in isolation.

### Finding 5: Repeat-rate across the transcript

Counting `makeBaseBox` call sites that are immediately followed by a Z-axis translate of `+h/2` (the smoking-gun pattern), within the data-center transcript alone:

| File            | `makeBaseBox` calls | `translate([…, …, h/2])` after | Rate |
| --------------- | ------------------: | -----------------------------: | ---: |
| `lib/server.ts` |                   7 |                              7 | 100% |
| `lib/switch.ts` |                   6 |                              6 | 100% |
| `lib/rack.ts`   |                  14 |                             13 |  93% |
| `lib/crac.ts`   |                   6 |                              6 | 100% |

Every single call needed a corrective translate that wouldn't have existed if `makeBaseBox` were either fully centred or fully corner-based. This is a structural failure mode, not a one-shot mistake.

### Finding 6: The same risk class affects the other `make*` shortcuts

The same JSDoc gap applies to every shortcut in `shortcuts.ts` and every `make*` in `shapeHelpers.ts`. Of particular concern (signatures from `replicad-api-data.json`):

| Symbol          | Signature                                          | Centring behaviour                                                              |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `makeBaseBox`   | `(x, y, z) => Shape3D`                             | Hybrid (XY centred, Z corner) — **the smoking gun**                             |
| `makeCylinder`  | `(radius, height, location?, direction?) => Solid` | Corner-based at `location` (default `[0,0,0]`); `location` is the bottom centre |
| `makeBox`       | `(corner1, corner2) => Solid`                      | Fully corner-based, explicit; safe                                              |
| `makeEllipsoid` | `(aLength, bLength, cLength) => Solid`             | Centred on origin (per OCCT `BRepPrimAPI_MakeRevol` convention); not documented |
| `makeSphere`    | (varies)                                           | Centred on origin; not documented                                               |
| `makeCircle`    | `(radius, center?, normal?) => Edge`               | Centre is a parameter — safe                                                    |

`makeBox` and `makeCircle` make the centre/corner explicit via parameters; the rest are guess-work without JSDoc.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                     | Priority | Effort  | Impact   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | -------- |
| R1  | **Add JSDoc to `repos/replicad/packages/replicad/src/shortcuts.ts` `makeBaseBox`** documenting the hybrid centring (XY centred, Z corner-based at `z=0`). Submit upstream PR via the existing fork.                                                        | P0       | Low     | High     |
| R2  | Add equivalent JSDoc to `makeCylinder`, `makeEllipsoid`, `makeSphere`, and any other `make*` primitive in `shortcuts.ts` / `shapeHelpers.ts` that lacks it.                                                                                                | P0       | Low     | High     |
| R3  | Re-run `pnpm nx extract-replicad api-extractor` so `libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts` and `replicad.bundled.json` carry the new JSDoc.                                                                                | P0       | Trivial | High     |
| R4  | Verify the agent benefits: rerun the data-center prompt against `tool-use,smoke` benchmarks and compare bounding-box pass-rate before/after. Record as `// EVAL(makeBaseBox-jsdoc)` in `cad-agent.prompt.ts`.                                              | P0       | Low     | High     |
| R5  | Do **not** add a kernel-specific note about `makeBaseBox` to `replicad.prompt.config.ts`. Per `docs/policy/context-engineering-policy.md` (Single Source of Truth, Trust Model Capability), primitive semantics belong in the API surface, not the prompt. | P0       | None    | Negative |
| R6  | Do **not** rewrite `replicad.prompt.example.ts` to inject a `makeBaseBox` example just to teach centring. The canonical example exists to demonstrate full-loop kernel patterns, not to backfill missing API docs.                                         | P1       | None    | Negative |
| R7  | (Defensive, optional) Add a `dts-validation`-style test in `libs/api-extractor` asserting that every public `make*` primitive in the bundled `.d.ts` has a non-empty leading JSDoc block. Prevents regressions when bumping replicad.                      | P2       | Medium  | Medium   |

## Trade-offs

| Option                                                               | Pros                                                                                                                                                                                                           | Cons                                                                                                                                                                                                         | Verdict |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| **A. JSDoc in upstream replicad source** (R1–R3)                     | Single source of truth; benefits humans, IDE users, every LLM consumer; no prompt bloat; matches the user's standing "fix at source" preference; replicad source edits are in scope per learned-runtime memory | Requires a build of replicad and the api-extractor refresh; one upstream PR cycle                                                                                                                            | **GO**  |
| B. Inject behaviour notes into `replicad.prompt.config.ts`           | Lands in one commit, no upstream coordination                                                                                                                                                                  | Violates Single Source of Truth (the same fact has to be re-asserted whenever a new under-documented primitive shows up); prompt grows with every primitive; doesn't help Monaco IntelliSense or human users | NO-GO   |
| C. Augment `extract-replicad-api.ts` with a per-symbol JSDoc overlay | Keeps upstream untouched                                                                                                                                                                                       | Band-aid (explicitly rejected per learned preferences); the overlay table becomes a parallel knowledge base that drifts from upstream; helps neither humans nor IntelliSense                                 | NO-GO   |
| D. Replace `makeBaseBox` calls in agent output via post-processing   | Could "auto-correct" the bug                                                                                                                                                                                   | Wrong altitude — papers over a behavioural ambiguity rather than fixing it; the same ambiguity will keep biting on every other primitive                                                                     | NO-GO   |

## Code Examples

Proposed JSDoc to add upstream (the minimal terse form, matching the existing replicad doc voice — no embedded research-doc IDs per the workspace rule about external repos):

```typescript
/**
 * Builds a rectangular box of the given lengths.
 *
 * The box is centred on the origin in X and Y (spanning `[-x/2, +x/2]` and
 * `[-y/2, +y/2]`) and corner-based in Z (spanning `[0, +z]`). Translate by
 * `[0, 0, -z/2]` to centre the box fully, or use {@link makeBox} when you
 * want explicit two-corner control.
 *
 * @example
 * const slab = makeBaseBox(30, 50, 10);
 * // slab spans x: [-15, 15], y: [-25, 25], z: [0, 10]
 */
export const makeBaseBox = (xLength: number, yLength: number, zLength: number): Shape3D => {
  // … (unchanged)
};
```

The equivalent prompt-only "fix" we are explicitly rejecting (for the record):

```typescript
// REJECTED: would land in replicad.prompt.config.ts
codeStandards: `…
<replicad_pitfalls>
\`makeBaseBox(x, y, z)\` is centred in X and Y but corner-based in Z. Translate by \`[0, 0, -z/2]\` to centre fully.
</replicad_pitfalls>
…`,
```

This violates the policy's Single Source of Truth rule (Part 2 §2 — "Tool description = HOW; system prompt = WHEN"), pollutes the cached static prompt with primitive-level mechanics, and does nothing for the editor IntelliSense path or for humans reading replicad source. Every other under-documented primitive would demand the same treatment, ratcheting the prompt without a ceiling.

## Diagrams

Spatial layout of `makeBaseBox(x, y, z)` viewed down the +Y axis:

```
        +Z
        |
   +z   |───────┐
        |       |
        |       |
        |       |     <-- box corner at (-x/2, -y/2, 0)
   0    └───────┘────────── +X
       -x/2     +x/2
```

Agent's first mental model (fully centred — wrong):

```
        +Z
        |
   +z/2 ┌───────┐
        |       |
        |       |
        |       |
   -z/2 └───────┘────────── +X
       -x/2     +x/2
```

Agent's second mental model (fully corner-based — also wrong):

```
        +Z
        |
   +z   ┌───────┐
        |       |
        |       |
        |       |
   0    └───────┘────────── +X
       0       +x
```

Neither matches reality.

## References

- Transcript: `~/Downloads/initial_design_2026-05-15T01-55.md` (lines 65, 2153–2185, 2589–2600)
- Source: `repos/replicad/packages/replicad/src/shortcuts.ts`
- Source: `repos/replicad/packages/replicad/src/shapeHelpers.ts`
- Docs: `repos/replicad/packages/replicad-docs/docs/tutorial-overview/modifications.md`
- Docs: `repos/replicad/packages/replicad-docs/docs/advanced-topics/studio-features.md`
- Generated: `libs/api-extractor/src/generated/replicad/modules/replicad/index.d.ts` (lines 1521–1527)
- Generated: `libs/api-extractor/src/generated/replicad/replicad-api-data.json` (lines 1072–1089)
- Pipeline: `libs/api-extractor/src/extract-replicad-api.ts`
- Prompt: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts`
- Prompt: `apps/api/app/api/chat/prompts/kernel-prompt-configs/replicad.prompt.config.ts`
- Policy: `docs/policy/context-engineering-policy.md`
