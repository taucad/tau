---
title: 'Multi-File test.json Migration Blueprint'
description: 'Migration plan for restructuring test.json from a flat requirements array to a per-file map keyed by source path so multiple compilation units can be tested concurrently.'
status: active
created: '2026-04-20'
updated: '2026-06-01'
category: migration
related:
  - docs/research/geospec-standalone-cad-testing-blueprint.md
  - docs/research/vitest-style-parameter-geometry-testing-blueprint.md
  - docs/research/visual-verification-prompt-engineering.md
  - docs/research/context-injection-architecture.md
  - docs/policy/vision-policy.md
---

# Multi-File test.json Migration Blueprint

Comprehensive blueprint for migrating `test.json` from a single flat `{ requirements: [...] }` shape to a per-file map keyed by source path, so the AI agent can attach independent measurement requirements to each compilation unit (CU) and test multiple files concurrently.

## Executive Summary

`test.json` is currently a single, project-wide `{ requirements: [...] }` array. This makes it impossible to test more than one compilation unit (e.g. `main.ts` plus a sibling `pen.ts`) at a time and — observed in agentic flows — leads the model to **delete all existing requirements** when asked to generate geometry for a new file, because the schema has no way to express scoping.

This doc inventories every code, prompt, test, and doc touch-point and proposes a migration to:

```json
{
  "main.ts": { "requirements": [ ... ] },
  "pen.ts":  { "requirements": [ ... ] }
}
```

The change is **breaking with no backwards compatibility** (per user direction). The schema lives in **`packages/testing/src/schemas.ts`** and is consumed by exactly two tools (`test_model`, `edit_tests`) and one server-side runner (`GeometryAnalysisService`). The migration also requires extending the `fetch_geometry` RPC with a `targetFile` argument so each per-file run can render the correct CU's GLB — currently `fetchGeometry` is hard-wired to `mainEntryFile` and would silently test the wrong shape.

## 2026-06-01 Target-State Alignment

This migration is now a compatibility milestone, not the final testing architecture. The per-file lesson remains important: every geometry assertion needs an explicit source/compilation-unit owner. The target state is:

- GeoSpec owns the standalone `*.test.ts`/Vitest-style execution API and geometry evidence analyzers.
- `@taucad/testing` owns `test.json` to `*.test.ts` migration and preserves per-file ownership when generating test modules.
- `test.json` remains useful as a legacy input and chat-tool compatibility shape during migration, but it is not the long-term authoring surface.
- The `targetFile` RPC/evidence concept should survive as `GeometryArtifact.source`, so GeoSpec diagnostics always identify the model file or generated artifact under test.

## Problem Statement

### Observed failure mode

Agentic flow: user asks the model to generate a second model file (e.g. `pen.ts`) in a project that already has `main.ts` with requirements in `test.json`. Because the schema is a flat array with no per-file scope, the model interprets `edit_tests` as a "replace the entire requirements list with the new file's requirements" and **removes the prior file's requirements**. The user then loses test coverage for `main.ts`.

### Root cause in the schema

`packages/testing/src/schemas.ts` defines the on-disk file as:

```typescript
export const testFileSchema = z.object({
  requirements: z.array(testRequirementSchema),
});
```

There is no key, namespace, or owner field on the requirements themselves and no top-level keying. Every requirement is implicitly "for the project" and the runner (`GeometryAnalysisService.runMeasurementTests`) evaluates them all against whatever GLB the `fetch_geometry` RPC returns — which is always the `mainEntryFile`'s GLB. There is currently no concept of "test these requirements against this specific file's geometry".

### Why this is now urgent

- Users routinely have multi-file projects (`main.ts` + `lib/<component>.ts` per `getFileOrganizationStrategy`).
- `compilationUnits` is a `Map` in the project machine — every CU produces its own GLB.
- The agent can already create new files (`edit_file`/`create_file`); the gap is purely on the test-spec side.
- A single global requirements list silently couples unrelated geometry to unrelated tests.

## Scope and Non-Goals

**In scope**

- On-disk format change for `test.json` (breaking).
- Schema in `packages/testing` and tool schema in `libs/chat`.
- `test_model` and `edit_tests` tool implementations.
- `fetch_geometry` RPC contract and browser handler.
- UI rendering of both tool cards (failures grouped by file).
- System prompt and tool descriptions in `cad-agent.prompt.ts` and the two tool definitions.
- Tool-result trimmer / offloader middleware shape detectors.
- All affected tests and policy/research doc snippets.

**Out of scope**

- The `screenshot` tool (also hard-wired to `mainEntryFile` — see Finding 9). Tracked as a follow-up; same architectural fix applies but not strictly required for multi-file testing to work because tests don't depend on screenshots.
- The benchmark suite (`apps/api/app/benchmarks/`) — it never reads `test.json`; it builds `MeasurementTestRequirement[]` synthetically via `expectationToRequirements`. Untouched unless we want benchmark/on-disk parity (separate decision).
- Any migration of pre-existing in-the-wild `test.json` files — the user explicitly waived backwards compatibility.
- Cross-file requirements (e.g. "main.ts must reference a part from pen.ts"). All requirements remain scoped to a single CU.

## Methodology

- Grep across the workspace for `test.json`, `test_model`, `edit_tests`, `testFileSchema`, `TestModelOutput`, `editTests*`, `testModelInput*`, `requirements`.
- Followed every reference into Read of the call site.
- Re-derived data flow for both tools end-to-end (UI → controller → tool → RPC → browser handler → graphics → runner → response).
- Cross-checked the tool-result trimmer and offloader middleware against the proposed `TestModelOutput` shape.
- Explored prompt sections and JSON example fragments referenced by `cad-agent.prompt.test.ts` so test expectations can be rewritten without surprises.

No on-disk `test.json` fixtures exist in the repo (verified by glob). The only canonical examples live in source strings — `cad-agent.prompt.ts`, `tool-edit-tests.ts`, `docs/research/node-vfs-applicability.md`.

## Findings

### Finding 1: On-disk schema lives in `packages/testing`, consumed only by API tooling

`packages/testing/src/schemas.ts` owns `testFileSchema`, `testRequirementSchema`, `measurementTestRequirementSchema`, `TestFile`, `TestModelOutput`, `TestPass`, `TestFailure`. The schema is exported from the package entry (`packages/testing/src/index.ts`), but the only file in the workspace that calls `testFileSchema.parse` is **`apps/api/app/api/tools/tools/tool-test-model.ts`**. `edit_tests` does not validate against the schema at all today — it merges JSON text via `FileEditService.applyFileEdit` (Morph) and writes the result back unchecked.

Implication: the migration does not have to chase Zod consumers across the codebase; it has one true caller. We can — and should — extend `edit_tests` to validate the result against the new schema after Morph applies the edit, to catch model-introduced shape errors at the source.

### Finding 2: `test_model` tool reads only the project-wide `test.json`

`apps/api/app/api/tools/tools/tool-test-model.ts` performs a fixed sequence:

1. `readFile { targetFile: 'test.json' }` via RPC.
2. `JSON.parse` + `testFileSchema.parse`.
3. Pass `requirements` array into `geometryAnalysisService.runMeasurementTests(glb, requirements)`.
4. Single GLB fetched via `fetch_geometry { artifactId: toolCallId }` — no file scoping.

The whole tool runs once per `test_model` invocation and produces one combined `TestModelOutput`. There is no concept of "per-file" anywhere in the tool body, the input schema (`testModelInputSchema = z.object({})`), or the output shape.

### Finding 3: `edit_tests` hard-codes `'test.json'` and embeds a single-file JSON example in its description

`apps/api/app/api/tools/tools/tool-edit-tests.ts` has:

- `const testFile = 'test.json'`.
- `defaultTestFile = JSON.stringify({ requirements: [] }, null, 2)` for the file-not-found path.
- A long description block that **includes a literal JSON example** showing the old top-level `requirements` shape — this is the most prompt-engineering-sensitive surface to update.
- Reads via `readFile { targetFile: 'test.json' }`, applies the edit through `FileEditService.applyFileEdit`, writes back via `createFile { targetFile: 'test.json' }`.

The tool intentionally edits free-form JSON text via Morph rather than a structured patch, so the only shape-related changes are: tool description, default content, and (recommended) post-write validation against the new `testFileSchema`.

### Finding 4: `fetch_geometry` RPC is hard-wired to `mainEntryFile`

`libs/chat/src/rpc/handlers/handle-fetch-geometry.ts` defers to `graphics.fetchGeometry()` with no parameters. The browser implementation in `apps/ui/app/hooks/rpc-handlers.ts:208–246` uses:

```typescript
const { compilationUnits, mainEntryFile } = projectSnapshot.context;
const mainUnit = compilationUnits.get(mainEntryFile);
```

This is the **single largest non-obvious blocker** in the migration. Even after we per-file the requirements, calling `runMeasurementTests` against `pen.ts`'s requirements with the `main.ts` GLB would silently produce wrong results. The RPC contract must learn an optional `targetFile`, and the browser handler must look up the matching CU from `compilationUnits` rather than always grabbing main.

### Finding 5: `TestModelOutput` is a flat (failures, passes, passed, total) shape

`packages/testing/src/schemas.ts` defines:

```typescript
testModelOutputSchema = z.object({
  failures: z.array(testFailureSchema),
  passes: z.array(testPassSchema),
  passed: z.number(),
  total: z.number(),
  geometryArtifactPath: z.string().optional(),
});
```

To preserve actionable per-file feedback the model can act on, the output should grow a per-file dimension. Two viable options (analyzed in Trade-offs §1).

### Finding 6: Tool-result trimmer middleware detects `TestModelOutput` by shape

`apps/api/app/api/chat/middleware/tool-result-trimmer.middleware.ts` uses `isTestModelShape`:

```typescript
return Array.isArray(content['failures']) && typeof content['total'] === 'number';
```

…and a corresponding trimmer that removes `passes`/`passed` and keeps `failures`/`total`. If the output shape changes (e.g. nested per-file results), both the detector and the trimmer must be updated. Tests live in `tool-result-trimmer.middleware.test.ts` and reference `TestModelOutput` fields directly.

`apps/api/app/api/chat/middleware/tool-offloading.middleware.test.ts` also references `name: 'test_model'` in two test cases that exercise large JSON output offloading — likely no behavioral change needed but the test fixtures will need new shapes.

### Finding 7: System prompt embeds the single-file JSON example as a fenced code block

`apps/api/app/api/chat/prompts/cad-agent.prompt.ts` lines 87–105 contain a `<test_requirements>` block with a literal example JSON that the model uses as the canonical reference for the file shape. This is the **second most prompt-engineering-sensitive surface** (after the `edit_tests` description). Test assertions in `cad-agent.prompt.test.ts` only check section presence/absence (`<test_requirements>`), not the JSON inside, so the test asserts won't break — but the prompt-eval evidence comment header (`// EVAL(...)`) is policy-bound, so prompt changes must be paired with a benchmark run per the prompt-change-log convention at the top of that file.

### Finding 8: UI rendering assumes a single, undivided `TestModelOutput`

- `apps/ui/app/routes/projects_.$id/chat-message-tool-test-model.tsx`: renders one bundle of failures and passes; no file grouping; one `geometryArtifactPath` shown as a single badge.
- `apps/ui/app/routes/projects_.$id/chat-message-tool-edit-tests.tsx`: hard-codes `const testFile = 'test.json'` and renders a single `CollapsibleFileOperation` for that path. Edit_tests still operates on the whole file in JSON form, so this only needs cosmetic copy updates.
- `apps/ui/app/components/chat/chat-tool-selector.tsx`: copy "Edit test requirements in test.json" — one-line update.
- `apps/ui/app/utils/chat.utils.ts`: `toolSerializers[toolName.testModel].output` formats `${output.passed}/${output.total} passed` and iterates `output.failures` — must learn the new shape (or remain flat-aggregated, see Trade-offs §1).
- `apps/ui/app/utils/assistant-message-activity.ts`: `countTestCases` reads `part.output.passes.length + part.output.failures.length`. If the output is grouped per-file, the count must walk file groups.

### Finding 9: Adjacent multi-file gaps that are NOT in scope but worth flagging

- `screenshot` tool also assumes `mainEntryFile`. Multi-file screenshotting will eventually need the same `targetFile` extension on `captureScreenshot`/`captureObservations` RPCs and a `mode`-orthogonal `targetFile` argument on the tool input. Not blocking this migration.
- The system prompt's `<workflow>` step "Verify: Call `get_kernel_result` after file changes" — `get_kernel_result` already takes `targetFile`, so it is fine.

### Finding 10: Inventory of every file requiring change

Grouped by package boundary; "kind" = `breaking-shape` (consumes new schema), `wiring` (passes data through), `prompt` (string content the model reads), `copy` (UI label), `test` (assertions), `docs` (markdown).

| #   | Path                                                                            | Kind           | What changes                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | `packages/testing/src/schemas.ts`                                               | breaking-shape | `testFileSchema` → record keyed by source path; new `TestFileEntry` type; possibly new output shape                                                          |
| F2  | `packages/testing/src/index.ts`                                                 | wiring         | Re-export new symbols if added                                                                                                                               |
| F3  | `apps/api/app/api/tools/tools/tool-test-model.ts`                               | breaking-shape | Iterate file map; loop `runMeasurementTests` per CU; aggregate or nest output; pass `targetFile` to `fetch_geometry`; rewrite all error `suggestion` strings |
| F4  | `apps/api/app/api/tools/tools/tool-edit-tests.ts`                               | prompt         | Update description + example JSON; new `defaultTestFile` shape; add post-write Zod validation                                                                |
| F5  | `apps/api/app/api/chat/prompts/cad-agent.prompt.ts`                             | prompt         | Replace `<test_requirements>` JSON example with multi-file map; update workflow wording                                                                      |
| F6  | `apps/api/app/api/chat/prompts/cad-agent.prompt.test.ts`                        | test           | Section-presence assertions still pass; add an assertion that the example is the new shape                                                                   |
| F7  | `apps/api/app/api/analysis/geometry-analysis.service.ts`                        | wiring         | `runMeasurementTests` may stay per-CU and be called multiple times (preferred) — no internal change                                                          |
| F8  | `apps/api/app/api/analysis/geometry-analysis.service.test.ts`                   | test           | Add a test for repeated invocation; no per-file state expected                                                                                               |
| F9  | `libs/chat/src/schemas/tools/test-model.tool.schema.ts`                         | wiring         | Comments only (input still empty `z.object({})`); update `editTestsInputSchema.codeEdit.describe` text                                                       |
| F10 | `libs/chat/src/schemas/rpc.schema.ts`                                           | breaking-shape | Add optional `targetFile` to `fetchGeometryRpc.input`                                                                                                        |
| F11 | `libs/chat/src/rpc/handlers/handle-fetch-geometry.ts`                           | wiring         | Forward `targetFile` to `graphics.fetchGeometry({ targetFile })`                                                                                             |
| F12 | `libs/chat/src/rpc/rpc-dependencies.ts`                                         | breaking-shape | `RpcGraphicsClient.fetchGeometry` signature gains optional `{ targetFile }` arg                                                                              |
| F13 | `apps/ui/app/hooks/rpc-handlers.ts`                                             | breaking-shape | `createBrowserGraphicsClient.fetchGeometry` reads `targetFile ?? mainEntryFile`; `compilationUnits.get(targetFile)`                                          |
| F14 | `apps/ui/app/hooks/rpc-handlers.test.ts`                                        | test           | Add coverage for explicit `targetFile`                                                                                                                       |
| F15 | `apps/ui/app/routes/projects_.$id/chat-message-tool-test-model.tsx`             | breaking-shape | Render failures grouped by file; multiple `GeometryArtifactBadge`s; per-file pass/fail counts                                                                |
| F16 | `apps/ui/app/routes/projects_.$id/chat-message-tool-edit-tests.tsx`             | copy           | Title still references `test.json` (correct); no structural change                                                                                           |
| F17 | `apps/ui/app/components/chat/chat-tool-selector.tsx`                            | copy           | Description update                                                                                                                                           |
| F18 | `apps/ui/app/utils/chat.utils.ts`                                               | breaking-shape | `toolSerializers[toolName.testModel].output` walks per-file groups                                                                                           |
| F19 | `apps/ui/app/utils/chat.utils.test.ts`                                          | test           | Update fixture JSON for `tool-test_model` serializer test                                                                                                    |
| F20 | `apps/ui/app/utils/assistant-message-activity.ts`                               | breaking-shape | `countTestCases` walks file groups                                                                                                                           |
| F21 | `apps/ui/app/utils/assistant-message-activity.test.ts`                          | test           | Update fixtures for `tool-test_model` parts                                                                                                                  |
| F22 | `apps/api/app/api/chat/middleware/tool-result-trimmer.middleware.ts`            | breaking-shape | `isTestModelShape` detector + `testModel` trimmer for new shape                                                                                              |
| F23 | `apps/api/app/api/chat/middleware/tool-result-trimmer.middleware.test.ts`       | test           | Update `createTestModelOutput` fixture and assertions                                                                                                        |
| F24 | `apps/api/app/api/chat/middleware/tool-offloading.middleware.test.ts`           | test           | Update test_model fixture JSON to new shape                                                                                                                  |
| F25 | `libs/chat/src/schemas/tool-schemas-registry.ts`                                | wiring         | Type-only — no change unless output shape adds dimensions                                                                                                    |
| F26 | `libs/chat/src/types/tool.types.ts`                                             | wiring         | Same                                                                                                                                                         |
| F27 | `apps/ui/app/lib/monaco-model-service.test.ts`                                  | docs/cosmetic  | Uses `'test.json'` as a path-normalization example only; rename to avoid misreads (optional)                                                                 |
| F28 | `docs/policy/vision-policy.md`                                                  | docs           | Update TDD-via-test.json description                                                                                                                         |
| F29 | `docs/research/node-vfs-applicability.md`                                       | docs           | Update inline example                                                                                                                                        |
| F30 | `docs/research/context-injection-architecture.md`                               | docs           | Reflect new `<test_requirements>` example                                                                                                                    |
| F31 | `docs/research/visual-verification-prompt-engineering.md`                       | docs           | Optional snippet alignment                                                                                                                                   |
| F32 | `docs/research/chat-rendering-audit.md`                                         | docs           | Refresh row for `ChatMessageToolTestModel` once UI changes land                                                                                              |
| F33 | `apps/ui/app/lib/monaco-model-service.test.ts` & similar _(generic path tests)_ | docs/cosmetic  | None functional                                                                                                                                              |

### Finding 11: Two consumers will need to decide aggregated vs. nested output

The `TestModelOutput` shape returned by `tool-test-model.ts` is consumed by:

1. **The LLM** (via tool result message + trimmer middleware): wants compact, file-tagged failures so it can decide which file to fix.
2. **The UI** (via `chat-message-tool-test-model.tsx`): wants groupable per-file display.
3. **The activity counter** (`assistant-message-activity.ts:countTestCases`): wants total test count.

A simple aggregated shape with a `file` tag on each failure/pass minimizes downstream churn and serves all three. A fully nested shape (`{ files: { 'main.ts': { failures, passes, ... }, ... } }`) is more self-describing but doubles the migration surface.

Recommendation in Trade-offs §1.

## Recommendations

| #   | Action                                                                                                                                                                                                                         | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| R1  | Replace `testFileSchema` with `z.record(z.string(), z.object({ requirements: z.array(testRequirementSchema) }))`                                                                                                               | P0       | Low    | High   |
| R2  | Extend `fetchGeometryRpc.input` with optional `targetFile`; thread it through `RpcGraphicsClient.fetchGeometry` and `createBrowserGraphicsClient` so `compilationUnits.get(targetFile ?? mainEntryFile)` resolves the right CU | P0       | Med    | High   |
| R3  | Rewrite `tool-test-model.ts` to iterate the file map, fetch each CU's GLB, run measurement tests per CU, and emit a tagged output shape (Trade-offs §1 picks aggregated)                                                       | P0       | Med    | High   |
| R4  | Update `tool-edit-tests.ts` description JSON example, default content, and add `testFileSchema.safeParse` after Morph apply to fail loudly on malformed agent edits                                                            | P0       | Low    | High   |
| R5  | Update `cad-agent.prompt.ts` `<test_requirements>` example to the multi-file map shape; add one EVAL benchmark line documenting before/after pass-rate                                                                         | P0       | Med    | High   |
| R6  | Update tool-result trimmer detector and trimmer for the new `TestModelOutput` shape; update its tests                                                                                                                          | P0       | Low    | Med    |
| R7  | UI: render `chat-message-tool-test-model.tsx` failures grouped by file with per-group pass/fail counts and one artifact badge per file                                                                                         | P1       | Med    | Med    |
| R8  | UI: update `chat-tool-selector.tsx`, `chat.utils.ts`, `assistant-message-activity.ts` and their tests to handle tagged failures/passes                                                                                         | P1       | Low    | Low    |
| R9  | Update docs (`vision-policy`, `node-vfs-applicability`, `context-injection-architecture`, `visual-verification-prompt-engineering`, `chat-rendering-audit`)                                                                    | P2       | Low    | Low    |
| R10 | Follow-up (NOT in this PR): extend `screenshot` tool and `captureScreenshot`/`captureObservations` RPCs with the same `targetFile` pattern so multi-file visual inspection works                                               | P2       | Med    | Med    |

## Trade-offs

### §1 Output shape: tagged-flat vs. nested-by-file

Both options keep one `TestModelOutput` per `test_model` tool call.

**Option A — Tagged-flat (recommended):**

```typescript
testModelOutputSchema = z.object({
  failures: z.array(testFailureSchema.extend({ targetFile: z.string() })),
  passes: z.array(testPassSchema.extend({ targetFile: z.string() })),
  passed: z.number(),
  total: z.number(),
  geometryArtifactPaths: z.record(z.string(), z.string()).optional(),
});
```

**Option B — Nested-by-file:**

```typescript
testModelOutputSchema = z.object({
  files: z.record(
    z.string(),
    z.object({
      failures: z.array(testFailureSchema),
      passes: z.array(testPassSchema),
      passed: z.number(),
      total: z.number(),
      geometryArtifactPath: z.string().optional(),
    }),
  ),
  passed: z.number(),
  total: z.number(),
});
```

| Dimension                       | A — Tagged-flat                                  | B — Nested                                       |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| Trimmer middleware delta        | Add `targetFile` to detector tolerance (trivial) | Detector + trimmer rewrite (re-emit nested)      |
| LLM token cost                  | One `targetFile` repeated per item               | One key per file; less repetition for many tests |
| `countTestCases` change         | Same `failures.length + passes.length`           | Sum across `Object.values(files)`                |
| UI render (group by file)       | `groupBy(failures, f => f.targetFile)`           | Already grouped                                  |
| `chat.utils.ts` serializer      | Single loop with file prefix                     | Outer loop over files + inner loop               |
| Backwards-compat with detectors | Detector still works (failures + total)          | Detector must be rewritten                       |
| Discoverability for the model   | Each row is self-describing                      | Map shape mirrors `test.json` structure          |

**Verdict: A.** The on-disk file _is_ nested (matches the user's spec) but the tool result is consumed primarily by the LLM, where row-level self-description is valuable and the trimmer surface is minimized. The UI can `groupBy` cheaply and still derive the canonical "per-file" view.

### §2 Where to validate the agent's edits

- **In `edit_tests` only** — Morph applies, then `testFileSchema.safeParse(JSON.parse(...))`. Reject the write on failure with an error that the LLM can act on. Recommended.
- **In a pre-write file watcher** — too implicit; fails outside the tool's feedback loop.
- **Skip validation** (today's behavior) — caused the deletion-of-all-requirements failure mode in the first place.

### §3 Migration of existing on-disk `test.json` files

User has explicitly opted into a hard break. There are no committed fixtures, so the cost is borne only by users with live projects. `tool-test-model.ts` will surface a clear `invalid_test_file` failure the first time it parses an old-shape file, which the agent can repair via `edit_tests`. No automatic migration code needed.

### §4 Concurrency model inside `tool-test-model.ts`

Per-CU `fetch_geometry` calls can run in parallel via `Promise.all` since the browser graphics machine resolves each CU independently. Two caveats:

1. The browser-side `compilationUnits.get(...)` reads a snapshot — concurrent calls are safe.
2. The artifact-write path (`fileSystem.writeBinaryFile`) collides if two requests share a `toolCallId` (artifact path = `.tau/artifacts/${toolCallId}.glb`). Solution: append the `targetFile` slug to the artifact name (`.tau/artifacts/${toolCallId}__${slug(targetFile)}.glb`). This is a small RPC handler change — already covered by R2.

## Code Examples

### Proposed `testFileSchema` (R1)

```typescript
export const testFileEntrySchema = z.object({
  requirements: z.array(testRequirementSchema),
});

export const testFileSchema = z.record(z.string(), testFileEntrySchema);

export type TestFileEntry = z.infer<typeof testFileEntrySchema>;
export type TestFile = z.infer<typeof testFileSchema>;
```

### Proposed `tool-test-model.ts` core loop (R3)

```typescript
const testFile = testFileSchema.parse(JSON.parse(testFileContent.content));
const entries = Object.entries(testFile);

const perFileResults = await Promise.all(
  entries.map(async ([targetFile, { requirements }]) => {
    const geometryResult = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId,
      rpcName: rpcName.fetchGeometry,
      args: { artifactId: toolCallId, targetFile },
    });

    assertRpcSuccess(geometryResult, {
      toolName: toolName.testModel,
      toolCallId,
      clientErrorMessage: `Failed to fetch geometry for ${targetFile}`,
    });

    const result = await geometryAnalysisService.runMeasurementTests(geometryResult.glb, requirements);

    return { targetFile, result, artifactPath: geometryResult.artifactPath };
  }),
);

const failures = perFileResults.flatMap(({ targetFile, result }) => result.failures.map((f) => ({ ...f, targetFile })));
const passes = perFileResults.flatMap(({ targetFile, result }) => result.passes.map((p) => ({ ...p, targetFile })));

return {
  failures,
  passes,
  passed: passes.length,
  total: failures.length + passes.length,
  geometryArtifactPaths: Object.fromEntries(
    perFileResults.filter((r) => r.artifactPath !== undefined).map((r) => [r.targetFile, r.artifactPath!]),
  ),
};
```

### Proposed `fetch_geometry` RPC contract delta (R2)

```typescript
const fetchGeometryRpc = defineRpc({
  input: zod.object({
    artifactId: zod.string().optional(),
    targetFile: zod.string().optional(),
  }),
  success: zod.object({
    glb: zod.instanceof(Uint8Array),
    artifactPath: zod.string().optional(),
  }),
});
```

`createBrowserGraphicsClient.fetchGeometry`:

```typescript
async fetchGeometry({ targetFile }: { targetFile?: string } = {}): Promise<FetchGeometryRpcResult> {
  const projectSnapshot = projectRef.getSnapshot();
  const { compilationUnits, mainEntryFile } = projectSnapshot.context;
  const path = targetFile ?? mainEntryFile;
  const unit = compilationUnits.get(path);
  if (!unit) {
    return { success: false, errorCode: 'UNKNOWN', message: `No compilation unit for ${path}` };
  }
  // ...rest unchanged
}
```

### Proposed `<test_requirements>` prompt fragment (R5)

````text
<test_requirements>
test.json is a map keyed by source file. Each key holds the requirements that
will be evaluated against THAT file's geometry only. Add or update keys when
introducing new files; never delete other files' requirements.

```json
{
  "main.ts": {
    "requirements": [
      { "id": "req_width",   "type": "measurement", "description": "Box is 100mm wide", "check": "boundingBox", "expected": { "size": { "x": 100 } }, "tolerance": 1 },
      { "id": "req_solid",   "type": "measurement", "description": "Single connected solid", "check": "connectedComponents", "expected": { "count": 1 } }
    ]
  }
}
````

</test_requirements>

```

## Diagrams

### Current data flow (single-file)

```

LLM
│ test_model({})
▼
tool-test-model.ts
│ readFile { 'test.json' }
▼
RPC → handle-read-file → fileSystem
│ testFileSchema.parse → requirements[]
│ fetchGeometry { artifactId }
▼
RPC → handle-fetch-geometry → graphics.fetchGeometry()
│ reads compilationUnits.get(mainEntryFile)
▼
returns ONE GLB
│
▼
GeometryAnalysisService.runMeasurementTests(glb, requirements)
│
▼
TestModelOutput { failures, passes, passed, total }

```

### Proposed data flow (multi-file)

```

LLM
│ test_model({})
▼
tool-test-model.ts
│ readFile { 'test.json' }
│ testFileSchema.parse → Map<targetFile, { requirements }>
│
│ Promise.all(entries):
│ fetchGeometry { artifactId, targetFile } ──┐
│ runMeasurementTests(glbForTargetFile, ...) │ per CU
│ ┘
▼
TestModelOutput {
failures: [ { ..., targetFile }, ... ],
passes: [ { ..., targetFile }, ... ],
passed, total,
geometryArtifactPaths: { 'main.ts': '...', 'pen.ts': '...' }
}

```

## Migration Plan (Sequenced)

Each step compiles independently. No step is skippable.

1. **Schemas first (`packages/testing/src/schemas.ts`).** Define `testFileEntrySchema`, replace `testFileSchema` with the record form, add `targetFile` to `testFailureSchema`/`testPassSchema`, add `geometryArtifactPaths` to `testModelOutputSchema`. Run `pnpm nx test testing --watch=false`.
2. **RPC contract (`libs/chat/src/schemas/rpc.schema.ts` + `rpc-dependencies.ts` + `handle-fetch-geometry.ts`).** Add optional `targetFile` to input + handler signature; pass through to `graphics.fetchGeometry`. Update artifact path to include slug if `targetFile` is provided. Run `pnpm nx test chat --watch=false`.
3. **Browser RPC handler (`apps/ui/app/hooks/rpc-handlers.ts` + `.test.ts`).** Resolve `compilationUnits.get(targetFile ?? mainEntryFile)`. Run `pnpm nx test ui --watch=false ./app/hooks/rpc-handlers.test.ts`.
4. **`tool-test-model.ts`.** Per-CU loop with `Promise.all`. Update all four error result branches' `suggestion` strings to mention multi-file. Run `pnpm nx test api --watch=false`.
5. **`tool-edit-tests.ts`.** Update tool description (JSON example), `defaultTestFile`, and add post-write `testFileSchema.safeParse` validation that throws a `ToolError` with the validation issue text on failure. Run `pnpm nx test api --watch=false`.
6. **System prompt (`cad-agent.prompt.ts`).** Replace `<test_requirements>` JSON example. Add `// EVAL(<benchmark>)` line. Update workflow text to reference per-file scoping. Run benchmark suite per `package-release` skill conventions if pass-rate regression is suspected.
7. **Trimmer middleware (`tool-result-trimmer.middleware.ts` + `.test.ts`).** Update detector to require `targetFile` on at least one failure (or keep loose) and the trimmer's projection. Update offloader test fixtures.
8. **UI rendering (`chat-message-tool-test-model.tsx` + serializer + activity counter + selector copy).** Group failures by `targetFile`; one `GeometryArtifactBadge` per file from `geometryArtifactPaths`. Update tests.
9. **Docs.** Vision policy, three research docs.

A reasonable "minimum-viable-PR" boundary is steps 1–6 (server-side & schema-correct); steps 7–9 can land in a follow-up if the PR is too large, since the UI gracefully degrades by showing all failures together (the `targetFile` field is just unused).

## References

- `packages/testing/src/schemas.ts` — schema source of truth
- `apps/api/app/api/tools/tools/tool-test-model.ts` — read/run loop
- `apps/api/app/api/tools/tools/tool-edit-tests.ts` — write loop with Morph
- `libs/chat/src/schemas/rpc.schema.ts` + `apps/ui/app/hooks/rpc-handlers.ts` — RPC contract and browser graphics client
- `apps/api/app/api/chat/prompts/cad-agent.prompt.ts` — `<test_requirements>` prompt fragment
- `apps/api/app/api/chat/middleware/tool-result-trimmer.middleware.ts` — shape detector + trimmer
- Related: `docs/research/visual-verification-prompt-engineering.md`, `docs/research/context-injection-architecture.md`
- Policy: `docs/policy/vision-policy.md` (TDD-via-test.json product position)
```
