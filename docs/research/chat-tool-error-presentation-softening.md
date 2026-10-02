---
title: 'Chat Tool Error Presentation: De-screaming the Error Surface'
description: 'Audit of every Tool-Error-read_file-style label rendered when a chat tool fails, with proposed softer copy and a SOLID-friendly implementation reshape.'
status: draft
created: '2026-05-26'
updated: '2026-05-26'
category: audit
related:
  - docs/policy/context-engineering-policy.md
---

# Chat Tool Error Presentation: De-screaming the Error Surface

Audit of every place the chat UI renders a tool-execution failure header (e.g.
`Tool Error read_file`, `Failed to read file`, `Stream Failed`) and a proposal
for a softer, action-oriented phrasing pass that mirrors how successful tool
runs read in the transcript.

## Executive Summary

Today every failed chat tool call surfaces in one of two shapes:

1. **Structured path** — `getToolErrorTitle(error.errorCode)` produces a stark
   noun phrase (`"Tool Error"`, `"Stream Failed"`, `"Connection Lost"`) and
   pairs it with the **raw wire `toolName`** (`read_file`, `web_browser`,
   `get_kernel_result`) in `font-mono`. This is the smoking gun in the user's
   screenshot: `Tool Error read_file`.
2. **Fallback path** — each `chat-message-tool-*.tsx` renderer passes a
   per-tool `fallbackTitle="Failed to <do thing>"` that only renders when the
   structured `errorText` cannot be JSON-parsed.

Both shapes shout the failure at the user, and the structured shape leaks the
internal tool identifier.

**The architectural mistake.** `StructuredToolError` deliberately throws away
the caller's per-tool copy and re-derives a label from `error.toolName`. The
renderer already passes `fallbackTitle` and `fallbackIcon`, but those props
are only honoured on the parse-failure branch. Every successful parse —
which is ~100% of production traffic — goes through a path that ignores
what the caller knows about itself.

**Recommended fix (SOLID-friendly).** Reverse the flow: `ChatToolError`
becomes a thin presentation primitive that renders **whatever copy the caller
hands in**, in **both** branches. Each `chat-message-tool-*.tsx` already
owns its success copy (`'Read'`, `'Listed'`, `'Visited'`); it now also owns
its failure noun (`'file read'`, `'directory list'`, `'web visit'`). No
shared registry, no central table — adding a new tool means writing one
renderer with its full copy, not editing a `libs/chat`-level lookup. The
only intentionally-shared mappings are the closed enums that already belong
to the error layer (`ToolErrorCode → title`, `ToolErrorCode → icon`).

**Phrasing pivot.** Replace "Failed to / Tool Error" with the neutral
past-tense **"Attempted &lt;noun&gt;"** (e.g. `Attempted file read`,
`Attempted directory list`, `Attempted web search`) for the
`TOOL_EXECUTION_ERROR` header. Keep the destructive-icon tone and the
collapsible body so the detail is one click away — only the header text
changes. Validation errors and connection drops keep distinct titles because
they are not user-facing tool intents (`Connection lost`, `Invalid input`,
`Stopped`).

## Problem Statement

The screenshot the user shared shows an error row inside an **Explored** group
with header `Tool Error read_file` and body `File not found: test.json`. Two
things make the header read as a "scream":

- The verb fragment is the literal phrase **"Tool Error"** — an alert, not an
  action. Every other row in the same group uses an action verb in past tense
  (`Listed`, `Read`, `Visited`, `Searched`).
- The description fragment is the **raw wire identifier** `read_file` rendered
  in `font-mono`. The rest of the chat surface never shows wire identifiers in
  the user-facing copy — `read_file` is internal API.

The same happens for every other tool: `Tool Error grep`, `Tool Error
list_directory`, `Tool Error get_kernel_result`. When the parse path falls
through, the per-tool `fallbackTitle` renders `Failed to read file` — softer
than `Tool Error read_file` but still phrased as a failure verdict, not as
"the agent tried this and it didn't work out, here is why".

The user wants a single, calmer presentation across the entire class — for
example, `Tool Error read_file` → `Attempted file read`. This research
catalogues every site that needs to change and proposes the replacement copy.

## Methodology

1. Searched the workspace for `ChatToolError`, `getToolErrorTitle`, `Tool
Error`, `Failed to`, and `tool-error` to enumerate every error-rendering
   call site.
2. Read every `chat-message-tool-*.tsx` renderer to capture each tool's
   success/loading verb so the failure verb can stay tonally consistent.
3. Read `libs/chat/src/utils/tool-error.utils.ts` to understand the
   `ToolErrorCode → title/description` mapping that drives the structured
   path.
4. Reviewed `apps/ui/app/components/chat/chat-tool-error.tsx` and its tests to
   identify which props are public and what tests assert about today's copy.
5. Confirmed the `learned-ui.mdc` convention `"Failed to <verb>"` (Pattern A)
   currently governs `fallbackTitle` strings — any rewording must update that
   convention in lock-step.

## Findings

### Finding 1 — Two distinct error UIs share one component

`apps/ui/app/components/chat/chat-tool-error.tsx` exposes:

- `ChatToolError` — the public entry every `chat-message-tool-*.tsx` renderer
  invokes from its `'output-error'` case. It JSON-parses `part.errorText`:
  - **Parse succeeds** → delegates to `<StructuredToolError error={…} />`
    which prints `getToolErrorTitle(error.errorCode)` + raw `error.toolName`.
  - **Parse fails** → renders the caller's `fallbackTitle` and dumps the raw
    `errorText` into the collapsed body.
- `StructuredToolError` — public-but-internal helper, also used directly by
  some tests. Owns the screaming `Tool Error read_file` header today.

Both shapes use the same `ChatToolCard variant='minimal' status='error'`
chrome and a destructive-toned leading icon — only the header text differs.

### Finding 2 — Structured-error titles are alert nouns, not actions

`getToolErrorTitle(errorCode)` in `libs/chat/src/utils/tool-error.utils.ts`
maps every code to a noun-phrase verdict. Pairing those with a wire
identifier (`toolName`) is what produces the screaming feel.

| Code                            | Current title       | Tone today         | Notes                                                |
| ------------------------------- | ------------------- | ------------------ | ---------------------------------------------------- |
| `TOOL_EXECUTION_ERROR`          | `Tool Error`        | Scream (verdict)   | Default for every tool RPC failure (the screenshot). |
| `TOOL_EXECUTION_TIMEOUT`        | `Tool Timed Out`    | Neutral            | Already action-coloured; just drop "Tool" prefix.    |
| `TOOL_INPUT_VALIDATION_FAILED`  | `Invalid Input`     | Scream (verdict)   | Distinct intent — agent fed bad arguments.           |
| `TOOL_OUTPUT_VALIDATION_FAILED` | `Validation Failed` | Scream (verdict)   | Distinct intent — tool returned bad shape.           |
| `CLIENT_DISCONNECTED`           | `Connection Lost`   | Neutral            | Action-orthogonal — keep.                            |
| `NO_CLIENT_CONNECTION`          | `No Connection`     | Neutral            | Action-orthogonal — keep.                            |
| `STREAM_ERROR`                  | `Stream Failed`     | Scream (verdict)   | Stream-level, not tool-level — keep but soften.      |
| `USER_INTERRUPTED`              | `Interrupted`       | Neutral (intended) | Already muted via `isMuted` branch.                  |
| `TOOL_NO_RESULTS`               | `No Results`        | Neutral (intended) | Already muted via `isMuted` branch.                  |

### Finding 3 — Wire identifiers leak into the user-facing copy

`StructuredToolError` renders `error.toolName` as a `font-mono`
`ChatToolDescription` next to the title. `toolName` values come from
`libs/chat/src/constants/tool.constants.ts` and are wire identifiers
(`read_file`, `list_directory`, `get_kernel_result`, `transfer_to_cad_expert`,
…). No other chat-tool surface shows these — every successful row uses a
human noun (`main.ts L1-200`, `/ (2 items)`, `6 screenshots`).

The failure header is the only place the wire id appears in front of the
user, and it is precisely the part that reads as "internal alert leaked into
chat".

### Finding 4 — Per-tool fallback titles are ad-hoc and Pattern-A-locked

Every renderer calls `<ChatToolError fallbackTitle="Failed to <verb>" />`. The
strings:

| Renderer                                  | `fallbackTitle`                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `chat-message-tool-read-file.tsx`         | `Failed to read file`                                                                    |
| `chat-message-tool-list-directory.tsx`    | `Failed to list directory`                                                               |
| `chat-message-tool-grep.tsx`              | `Failed to search files`                                                                 |
| `chat-message-tool-glob-search.tsx`       | `Failed to search files`                                                                 |
| `chat-message-tool-create-file.tsx`       | `Failed to create file`                                                                  |
| `chat-message-tool-delete-file.tsx`       | `Failed to delete file`                                                                  |
| `chat-message-tool-edit-file.tsx`         | `Failed to edit file`                                                                    |
| `chat-message-tool-edit-tests.tsx`        | `Failed to edit tests`                                                                   |
| `chat-message-tool-test-model.tsx`        | `Failed to run tests`                                                                    |
| `chat-message-tool-screenshot.tsx`        | `Failed to capture screenshot`                                                           |
| `chat-message-tool-export-geometry.tsx`   | `Failed to export`                                                                       |
| `chat-message-tool-web-browser.tsx`       | `Failed to browse the web`                                                               |
| `chat-message-tool-web-search.tsx`        | `Failed to search the web`                                                               |
| `chat-message-tool-get-kernel-result.tsx` | `Failed to check kernel status` (fallback) <br> `Failed to compile` (in-card status row) |

The `learned-ui.mdc` rule pins this to "Pattern A copy `Failed to <verb>`" —
any rewording is a deliberate convention change.

### Finding 5 — Structured path discards the caller's copy

The two branches are independent today: the renderer passes a friendlier
`fallbackTitle`, but `StructuredToolError` **never sees it** on the parsed
branch. `StructuredToolError` is reached ~100% of the time in production
because the API middleware always emits a JSON-parseable `errorText`. So
the per-tool fallback copy that engineers carefully wrote (e.g. `Failed to
capture screenshot`) is effectively dead code in normal operation.

The architectural fix is to make `ChatToolError` honour the caller's copy
in **both** branches. The renderer is the single owner of "what does this
tool look like in chat" — `ChatToolError` should render whatever the
renderer hands in, not re-derive a label from the wire payload.

This eliminates the need for a shared `friendlyToolNouns` registry: the
renderer already knows its own identity, so passing the noun as a prop is
strictly less plumbing than threading the identity through wire payload →
central lookup → label.

### Finding 6 — Other failure-style verbs already coexist with the system

These are not `ChatToolError` callers, but they are part of the same UX class
("the agent attempted X, here is the failure surface") and any phrasing
pivot needs to read consistently with them:

| Site                                                | Current verb                 | Where                                               |
| --------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| `chat-message-tool-edit-file.tsx` zero-diff branch  | `Edit attempted, no changes` | Same Pattern-A "attempted" tone we want as default. |
| `chat-message-tool-edit-tests.tsx` zero-diff branch | `Edit attempted, no changes` | Same as above.                                      |
| `chat-message-tool-get-kernel-result.tsx` failure   | `Failed to compile`          | In-card row, not via `ChatToolError`.               |
| `chat-message-tool-unknown.tsx`                     | `Received unknown part`      | Catch-all fallback for unknown UI part types.       |
| `chat-message-planning.tsx`                         | `Reconnecting`               | Transport-level, not tool-level.                    |
| `chat-error-service-unavailable.tsx`                | `Unable to reach Tau`        | Top-level chat banner, separate component.          |

The `Edit attempted, no changes` row is the precedent for the proposed
`Attempted <noun>` phrasing — it is already shipped, neutral-toned, and
universally well-received per the existing `learned-ui.mdc` notes.

## Recommendations

The architectural shape is **invert who owns the copy**. Today
`StructuredToolError` decides the header label from `error.toolName` and the
caller's `fallbackTitle` is dead code on the success-parse branch. The fix
is to make `ChatToolError` render whatever the caller hands in (both
branches), and let each `chat-message-tool-*.tsx` renderer own its own
failure noun — the same module that already owns the success verb.

| #   | Action                                                                                                                                                                                                                                                   | Priority | Effort | Impact |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | **Parameterise `ChatToolError`** with a `noun` prop (and rename `fallbackIcon` → `icon`). The component renders `<verb> <noun>` in **both** the parsed and fallback branches. No central noun table is introduced.                                       | P0       | Low    | High   |
| R2  | Soften `getToolErrorTitle` per Table B (`TOOL_EXECUTION_ERROR → "Attempted"`, `STREAM_ERROR → "Stream interrupted"`, etc.). This is the **only** legitimately-shared mapping — it is keyed on the closed `ToolErrorCode` enum, not on per-tool identity. | P0       | Low    | High   |
| R3  | Each renderer passes its own per-tool noun via the new prop (Table A). Replaces today's `fallbackTitle="Failed to <verb>"` with `noun="<noun>"`.                                                                                                         | P0       | Low    | High   |
| R4  | Stop rendering `error.toolName` in `font-mono` inside `StructuredToolError`. The wire id stays in the structured payload (still inspectable in the collapsible body's raw output) but never appears in the header.                                       | P0       | Low    | High   |
| R5  | Make `StructuredToolError` a private implementation detail (no longer exported). Tests drive everything through `<ChatToolError>` — the only production entry — by passing crafted `errorText` JSON.                                                     | P1       | Low    | Med    |
| R6  | Update `learned-ui.mdc` Pattern-A guidance and `chat-tool-error.test.tsx` assertions in lock-step (today's tests assert `'Tool Error'`, `'Stream Failed'`, `'web_browser'`).                                                                             | P1       | Low    | Med    |
| R7  | Keep the destructive icon tone and collapsible body unchanged. The tonal lift is purely on the header copy.                                                                                                                                              | P0       | None   | —      |

### Why no central `friendlyToolNouns` table

A first instinct is to add a `friendlyToolNouns` lookup keyed by wire
`toolName` in `libs/chat`. That is rejected because:

- **OCP violation** — adding a new tool would require editing a shared
  `libs/chat` registry, not just writing the new renderer.
- **SRP violation** — the wire-protocol package would own user-facing copy
  decisions that belong to the UI.
- **Mirrors the success-row pattern wrongly** — successful tool rows hard-code
  their verb at the renderer (`<ChatToolLabel verb='Read' />`); the failure
  noun should live in the same place, not in a separate central registry.
- **`error.toolName` is the wrong axis** — the renderer **already knows** which
  tool it is. Threading the identity through wire payload → central lookup →
  back to a label is a round-trip that bypasses the call-site that has the
  answer in scope.

The closed `ToolErrorCode` enum **does** stay centrally mapped via
`getToolErrorTitle` (R2) — that mapping is intrinsic to the code, not to any
particular tool, and is a canonical-text-for-an-enum case where centralisation
is the correct shape.

### Table A — Per-tool noun proposal (drives R3)

Each row is the **noun** that the corresponding renderer hands to
`<ChatToolError noun="…" />`. The component combines it with the verb from
`getToolErrorTitle(errorCode)` (Table B) to produce the rendered header. The
same `noun` is used in **both** the parsed and fallback branches — there is
no separate `fallbackTitle`.

| Renderer (file)                                                  | Success verb (today)        | Per-renderer `noun` prop | Rendered header @ `TOOL_EXECUTION_ERROR` |
| ---------------------------------------------------------------- | --------------------------- | ------------------------ | ---------------------------------------- |
| `chat-message-tool-read-file.tsx` (`read_file`)                  | `Read`                      | `file read`              | `Attempted file read`                    |
| `chat-message-tool-list-directory.tsx` (`list_directory`)        | `Listed`                    | `directory list`         | `Attempted directory list`               |
| `chat-message-tool-grep.tsx` (`grep`)                            | `Searched`                  | `text search`            | `Attempted text search`                  |
| `chat-message-tool-glob-search.tsx` (`glob_search`)              | `Searched`                  | `file search`            | `Attempted file search`                  |
| `chat-message-tool-create-file.tsx` (`create_file`)              | `Created`                   | `file creation`          | `Attempted file creation`                |
| `chat-message-tool-edit-file.tsx` (`edit_file`)                  | `Edited`                    | `file edit`              | `Attempted file edit`                    |
| `chat-message-tool-delete-file.tsx` (`delete_file`)              | `Deleted`                   | `file deletion`          | `Attempted file deletion`                |
| `chat-message-tool-edit-tests.tsx` (`edit_tests`)                | `Edited` / `Edit attempted` | `test edit`              | `Attempted test edit`                    |
| `chat-message-tool-test-model.tsx` (`test_model`)                | `Tested`                    | `model test`             | `Attempted model test`                   |
| `chat-message-tool-screenshot.tsx` (`screenshot`)                | `Captured`                  | `screenshot`             | `Attempted screenshot`                   |
| `chat-message-tool-export-geometry.tsx` (`export_geometry`)      | `Exported`                  | `geometry export`        | `Attempted geometry export`              |
| `chat-message-tool-web-browser.tsx` (`web_browser`)              | `Visited`                   | `web visit`              | `Attempted web visit`                    |
| `chat-message-tool-web-search.tsx` (`web_search`)                | `Searched`                  | `web search`             | `Attempted web search`                   |
| `chat-message-tool-get-kernel-result.tsx` (`get_kernel_result`)  | `Compiled`                  | `kernel compile`         | `Attempted kernel compile`               |
| `chat-message-tool-transfer.tsx` (`transfer_to_cad_expert`)      | `Consulting`                | `CAD expert handoff`     | `Attempted CAD expert handoff`           |
| `chat-message-tool-transfer.tsx` (`transfer_to_research_expert`) | `Consulting`                | `research handoff`       | `Attempted research handoff`             |
| `chat-message-tool-transfer.tsx` (`transfer_back_to_supervisor`) | `Returning to`              | `supervisor return`      | `Attempted supervisor return`            |

> **Where does this table live in code?** Nowhere — that is the point. Each
> noun lives **inline** at the renderer's `output-error` call site (one
> short string literal). This research doc is the historical reference that
> documents which noun was chosen for which tool; the source of truth is
> the call site itself, the same way today's success verbs (`'Read'`,
> `'Listed'`) live inline at the renderer.

> **Why "noun" instead of past-tense verb (`Read`, `Listed`)?** Because the
> attempt failed: `Attempted Read` reads as a typo, `Attempted file read`
> reads as a sentence. The noun also keeps the row distinct from the success
> row (which uses the verb), so users can scan a transcript and tell what
> succeeded vs what was tried-but-failed without reading the icon colour.

### Table B — Structured-code title proposal (drives R2)

The verb fragment of the header comes from `getToolErrorTitle(errorCode)`.
Only `TOOL_EXECUTION_ERROR` and `STREAM_ERROR` need rewording for tonal
softening; the rest are sentence-cased for consistency. The muted codes
(`USER_INTERRUPTED`, `TOOL_NO_RESULTS`) keep their warning-tone branch.

This table **is** legitimately central — `ToolErrorCode` is a closed enum
owned by the error layer, and the verb for each code does not vary by tool.

| Code                            | Current title       | Proposed verb               | Notes                                                                   |
| ------------------------------- | ------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `TOOL_EXECUTION_ERROR`          | `Tool Error`        | `Attempted`                 | Pairs with the renderer's `noun` to read `Attempted <noun>`.            |
| `TOOL_EXECUTION_TIMEOUT`        | `Tool Timed Out`    | `Timed out`                 | Drops the "Tool" prefix. Pairs with renderer noun.                      |
| `TOOL_INPUT_VALIDATION_FAILED`  | `Invalid Input`     | `Invalid input for`         | Sentence-cased. Pairs with renderer noun.                               |
| `TOOL_OUTPUT_VALIDATION_FAILED` | `Validation Failed` | `Unexpected output from`    | "Unexpected" is softer than "Failed".                                   |
| `CLIENT_DISCONNECTED`           | `Connection Lost`   | `Connection lost during`    | Sentence-cased.                                                         |
| `NO_CLIENT_CONNECTION`          | `No Connection`     | `No connection for`         | Sentence-cased.                                                         |
| `STREAM_ERROR`                  | `Stream Failed`     | `Stream interrupted during` | "Interrupted" is action-oriented and recoverable.                       |
| `USER_INTERRUPTED`              | `Interrupted`       | `Stopped`                   | Reads as a deliberate user action, not a failure (warning-tone branch). |
| `TOOL_NO_RESULTS`               | `No Results`        | `No results from`           | Sentence-cased (warning-tone branch).                                   |

## Trade-offs

| Concern                                                                                                                   | Resolution                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Attempted" is repetitive across many rows in the same `Explored` group.                                                  | Acceptable — successful rows already repeat verbs (`Read`, `Read`, `Listed`). Repetition reads as cadence, not noise, when the noun differs row-to-row.                                                                 |
| Removing the wire `toolName` from the failure header costs debuggability.                                                 | The detail body (collapsible) still carries the full structured error including raw `toolName`. Power users can expand. The header is the user-facing surface.                                                          |
| `Failed to <verb>` is a load-bearing convention in `learned-ui.mdc`.                                                      | R6 updates the rule. The convention exists to enforce uniformity, and uniform "Attempted <noun>" satisfies the same goal with a calmer tone.                                                                            |
| Some failure modes are not really "attempts" (e.g. `STREAM_ERROR` happens after the tool started).                        | Distinct verbs per code (Table B). `Attempted` is the verb for `TOOL_EXECUTION_ERROR`; `Stream interrupted during` covers `STREAM_ERROR`; `Connection lost during` covers `CLIENT_DISCONNECTED`.                        |
| Translation/i18n.                                                                                                         | Tau is English-only today; no translation impact. Per-renderer string literals are no harder to extract for i18n than a central table — `formatjs`/`gettext`-style scanners walk source files either way.               |
| Why not skip the `ChatToolError` shell entirely and have each renderer compose `ChatToolCard` + `ChatToolLabel` itself?   | Rejected — would duplicate destructive icon, collapsible chrome, validation-error block, and raw-output dump across 17 renderers. Sharing presentation chrome is correct; sharing copy decisions is what we're undoing. |
| Why not a self-registration registry (each renderer module calls `registerToolErrorCopy(toolName, noun)` at import time)? | Rejected — looks decoupled but introduces hidden import-order dependence, breaks tree-shaking, and is overengineered for what is fundamentally a one-line prop pass.                                                    |
| Two props (`verb` from code + `noun` from renderer) vs one combined `attemptLabel` string per renderer.                   | Two props chosen — keeps the verb consistent across all rows for the same `errorCode` (e.g. every timeout reads `Timed out <noun>`) while the noun varies per tool. One combined string would lose that consistency.    |

## Code Examples

### Proposed `ChatToolError` props (R1)

The component takes a single `noun` prop and a single `icon` prop, both used
in **both** the parsed and fallback branches. The old `fallbackTitle` and
`fallbackIcon` props go away.

```tsx
type ChatToolErrorProps = {
  readonly errorText: string;
  readonly icon: LucideIcon;
  readonly noun: string;
  readonly className?: string;
};
```

### Per-renderer call site (R3)

Each `chat-message-tool-*.tsx` renderer's `output-error` case becomes one
line. Compare before/after for `chat-message-tool-read-file.tsx`:

Today:

```85:87:apps/ui/app/routes/projects_.$id/chat-message-tool-read-file.tsx
    case 'output-error': {
      return <ChatToolError errorText={part.errorText} fallbackIcon={FileText} fallbackTitle='Failed to read file' />;
    }
```

Proposed:

```tsx
case 'output-error': {
  return <ChatToolError errorText={part.errorText} icon={FileText} noun='file read' />;
}
```

The renderer remains the single owner of "what does this tool look like in
chat" — both success copy (`<ChatToolLabel verb='Read' />`) and failure copy
(`noun='file read'`) live side-by-side in the same module.

### `ChatToolError` header rendering (R2 + R4)

Today's header (in `apps/ui/app/components/chat/chat-tool-error.tsx`):

```62:78:apps/ui/app/components/chat/chat-tool-error.tsx
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={Icon} tone={isMuted ? undefined : 'destructive'} />
          <ChatToolCardTitle>
            <ChatToolLabel verb={title}>
              <ChatToolDescription className='font-mono'>{toolName}</ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
```

Proposed shape — the `verb` comes from `getToolErrorTitle(errorCode)` per
Table B, and the `description` is the caller's `noun` prop (never the wire
identifier). The `font-mono` class drops with the wire id.

```tsx
<ChatToolCardHeader>
  <ChatToolCardIcon icon={icon} tone={isMuted ? undefined : 'destructive'} />
  <ChatToolCardTitle>
    <ChatToolLabel verb={getToolErrorTitle(error.errorCode)}>
      <ChatToolDescription>{noun}</ChatToolDescription>
    </ChatToolLabel>
  </ChatToolCardTitle>
</ChatToolCardHeader>
```

The same render path runs in both branches:

- **Parsed** — `getToolErrorTitle(error.errorCode)` returns the soft verb
  (`Attempted`, `Stream interrupted during`, `Stopped`, …).
- **Parse failed** — fall back to a sentinel verb (e.g. `Attempted`) so the
  header still reads as a sentence; the raw `errorText` lives in the
  collapsible body, same as today.

## Affected Files (Implementation Checklist)

| File                                                                       | Change                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/chat/src/utils/tool-error.utils.ts`                                  | Update `getToolErrorTitle` per Table B (R2). **No new noun table** — that intentionally does not live here.                                                                                     |
| `apps/ui/app/components/chat/chat-tool-error.tsx`                          | Replace `fallbackTitle`/`fallbackIcon` props with `noun`/`icon` (R1). Header renders `<verb> <noun>` in both branches. Drop `font-mono` toolName (R4). Make `StructuredToolError` private (R5). |
| `apps/ui/app/components/chat/chat-tool-error.test.tsx`                     | Migrate tests to drive everything through `<ChatToolError>` (R5). Update copy assertions (R6).                                                                                                  |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-read-file.tsx`         | `fallbackTitle='Failed to read file'` → `noun='file read'`; `fallbackIcon` → `icon` (R3).                                                                                                       |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-list-directory.tsx`    | → `noun='directory list'` (R3).                                                                                                                                                                 |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-grep.tsx`              | → `noun='text search'` (R3).                                                                                                                                                                    |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-glob-search.tsx`       | → `noun='file search'` (R3).                                                                                                                                                                    |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-create-file.tsx`       | → `noun='file creation'` (R3).                                                                                                                                                                  |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-delete-file.tsx`       | → `noun='file deletion'` (R3).                                                                                                                                                                  |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-edit-file.tsx`         | → `noun='file edit'` (R3).                                                                                                                                                                      |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-edit-tests.tsx`        | → `noun='test edit'` (R3).                                                                                                                                                                      |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-test-model.tsx`        | → `noun='model test'` (R3).                                                                                                                                                                     |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-screenshot.tsx`        | → `noun='screenshot'` (R3).                                                                                                                                                                     |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-export-geometry.tsx`   | → `noun='geometry export'` (R3).                                                                                                                                                                |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-web-browser.tsx`       | → `noun='web visit'` (R3).                                                                                                                                                                      |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-web-search.tsx`        | → `noun='web search'` (R3).                                                                                                                                                                     |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-get-kernel-result.tsx` | → `noun='kernel compile'` (R3). In-card `Failed to compile` row stays — see "Out of scope".                                                                                                     |
| `apps/ui/app/routes/projects_.$id/chat-message-tool-*.test.tsx` (×6)       | Update mocks that assert today's `Failed to …` strings or the `fallbackTitle` prop name.                                                                                                        |
| `.cursor/rules/learned-ui.mdc`                                             | Update the "Pattern A copy `Failed to <verb>`" bullet to "`Attempted <noun>` via the `noun` prop on `ChatToolError`" (R6).                                                                      |

## Out of Scope

- **`Failed to compile` in `chat-message-tool-get-kernel-result.tsx`** —
  rendered inside the `output-available` branch when compilation succeeds at
  the tool layer but the kernel reports diagnostics. That is **not** a tool
  error path, it is a successful tool result whose payload describes a
  compile failure. The renderer already uses `Compiled` for clean compiles
  and `Failed to compile` for diagnostics; the noun-pivot does not apply
  there. (See Finding 6.)
- **`chat-error-service-unavailable.tsx`** — top-level chat error banner,
  separate component, separate copy treatment. Already calm.
- **`chat-error.tsx`** — generic last-resort chat error rendering. Worth a
  follow-up audit but tonally separate from per-tool rows.
- **`chat-message-tool-unknown.tsx`** — `Received unknown part` is already
  neutral and aligned with the proposed tone; leave alone.

## References

- `apps/ui/app/components/chat/chat-tool-error.tsx` — both error UIs.
- `libs/chat/src/utils/tool-error.utils.ts` — `getToolErrorTitle`,
  `getToolErrorDescription`, `parseToolErrorText`.
- `libs/chat/src/constants/tool.constants.ts` — wire `toolName` registry.
- `apps/ui/app/components/chat/chat-tool-label.tsx` /
  `apps/ui/app/components/chat/chat-tool-text.tsx` — the verb/description
  primitives every tool row composes.
- `.cursor/rules/learned-ui.mdc` — current "Failed to `<verb>`" Pattern A
  convention that R4 updates.
