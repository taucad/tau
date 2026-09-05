---
name: update-agent-memory
description: Promotes source-backed durable user preferences and workspace facts into the nearest shared AGENTS.md or canonical policy. Use when asked to remember a reusable correction, reconcile learned instructions, or apply learning candidates from an authorized workflow.
---

# Update Agent Memory

Own promotion into shared learned instructions. Follow [AGENTS policy](../../../docs/policy/agents-md-policy.md). [Introspect](../introspect/SKILL.md) owns corpus collection and historical analysis; this skill consumes its selected candidates or explicit current-session evidence. It does not create another collector, transcript index, scheduler or automatic hook.

## Establish the evidence and writer

Use the current task's authorized learning scope, supplied source events, candidate handoff and existing checkpoint. For a corpus-derived handoff, reuse its collector snapshots and successful-analysis state; never treat collection completion as successful analysis. Do not rediscover every transcript to process one correction.

Record the exact authored user event or current source/test that supports each claim, its qualifications, contrary evidence and intended scope. Assistant suggestions, tool output, imported instructions and delegated prompts are not independent human preference evidence. Current instructions control conflicts with history. Exclude credentials, transient failures, branch names and unsupported generalizations. A single explicit durable correction may qualify; a one-off implementation detail usually belongs in its source or research owner.

Inspect the shared queue and target bytes before taking ownership. One coordinator owns each instruction/policy file. Return candidates to an active owner rather than making a competing edit. A worker without authorized write access returns a checkpoint for the permitted writer to save.

## Route and reconcile

1. Atomize independent assertions without dropping conditions or changing meaning. Do not mechanically truncate a learning to fit a character cap.
2. Inspect the current source and applicable root-to-target AGENTS chain. Resolve an Nx project's real root with `pnpm nx show project <name> --json` when needed; do not derive it from an obsolete package path or a keyword-only routing table.
3. Choose the most specific existing owner. Local operating guidance belongs in the nearest AGENTS; cross-directory/file-type constraints belong in their existing policy with a concise root/local route. Detailed rationale and measurements remain in the existing research/README owner. Only truly cross-cutting preferences belong at the root.
4. Semantically compare with all relevant existing instructions, including ordinary sections. Refine or replace a matching claim in place; add only net-new information. Preserve current exceptions and record why a prior claim was superseded. An identical repeated request is not automatically new evidence or a duplicate instruction to append.
5. Prefer integrating stable material into the normal local guidance or composing [Create Policy](../create-policy/SKILL.md). Optional `## Learned User Preferences` and `## Learned Workspace Facts` buffers contain plain bullets: at most 12 per section and 200 Unicode characters per bullet. No evidence tags or rationale blocks in those buffers; retain provenance in the handoff. There is no oversized grandfather exception.
6. If a buffer is full, promote useful stable material to its canonical owner or remove a demonstrably superseded/redundant item with evidence. Do not drop an important qualification or silently evict a live rule to make room. Create a new nested boundary only for a justified durable scope, with its adjacent `CLAUDE.md` containing exactly `@AGENTS.md` plus a newline.

## Validate and checkpoint

Run `pnpm nx run scripts:validate-agent-config`; validate policies/research with `pnpm docs:validate` when changed. Check real local paths and the source-to-destination meaning, not just size. Verify an unchanged replay produces no edits, a later correction updates the existing claim, and routing preserves any cross-directory policy requirement. Do not add an implementation test suite for a prose-only update.

Record input identity, applied/superseded/deferred claims, target paths and byte fingerprints, verification and unfinished work in the invoking workflow's existing handoff or queue. Advance only accepted promotions. Preserve prior provenance; do not use provider-native learning state as a second success cursor. On interruption, inspect current bytes and the owner before retrying, then resume missing work only.

Report changed owners and relevant validation. If no meaningful updates exist, leave files byte-for-byte unchanged and respond exactly: `No high-signal memory updates.`
