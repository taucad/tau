---
name: work-charter
description: Implements an authorized selection from a Tau charter, blueprint or curated plan using a durable queue, disjoint native agent lanes, semantic acceptance and recovery. Use when asked to implement selected work IDs, execute a blueprint as specified, or resume its unfinished implementation.
---

# Work Charter

Own execution of the selected outcome, from dependency resolution through verification and closeout. Use [the research artifact contract](../create-research/artifacts.md). Native tasks execute work; the coordinator-owned queue records the authoritative acceptance state. Reuse native execution tools; do not create a second scheduler.

Use `create-charter` to establish an unresolved program architecture, `create-research` for investigation alone, and the relevant domain skill for a simple local change that needs no charter queue.

## Resolve selection and authority

1. Read the governing document, selected IDs, applicable rulings and current execution state. “Implement the blueprint as specified” selects its defined implementation scope; non-goals and deferred items remain excluded. If IDs are ambiguous, resolve the specific ambiguity before dependent work while progressing independent authorized items.
2. Record the document revision/content fingerprint, the user's authorization, selected outcome/IDs and acceptance evidence. Preserve the governing document. Never rewrite a ruling or edit a user-curated plan to make implementation fit; use its authorized native todo state and an explicit queue mapping.
3. Resolve prerequisites. Schedule those already authorized and necessary for the selected outcome. A prerequisite that changes the outcome, governing invariant or authority needs a specific decision, not silent expansion into the whole charter. Preserve existing completed evidence and identify only affected work when a ruling changes.
4. Inspect the checkout, dirty paths, surviving jobs, source owners and available tools before dispatch. Use existing native task/subagent tools; `codex-lanes` is an optional transport when its companion is available. Do not start duplicate jobs merely because a prior worker is quiet.

## One coordinator, one durable queue

For a new program, keep one Markdown task table under its research artifact run. Record:

| Field                 | Required meaning                                                          |
| --------------------- | ------------------------------------------------------------------------- |
| Task ID and selection | Stable ID, governing document/IDs and outcome                             |
| Prerequisites         | Verified predecessor tasks or shared-contract decisions                   |
| Ownership             | Exclusive paths, shared-contract owner and current attempt/worker/job ID  |
| Acceptance            | The relevant semantic check or other direct evidence                      |
| State and recovery    | Current state, evidence/checkpoint path, unresolved issue and next action |

Only the coordinator changes claims, shared indexes and completion state. Workers return results for their assigned task and attempt. Serialize claims before dispatch; link native job/todo state as an observation. Before granting a claim, check that no active attempt or overlapping writer already owns it. If an adapter cannot accept a supplied task ID, record its returned ID against the attempt before dispatching another item.

Use `waiting → ready → running → review → verified` where helpful. A failed or interrupted attempt retains its evidence and becomes resumable work; it is never automatically verified. These are execution semantics, not a requirement to build a state-machine library.

A Markdown queue supports **one coordinator**. If independent coordinators must claim concurrently, first select and verify an existing atomic-claim backend; do not represent an unchecked shared file as multi-writer safe. Scope changes and stale callbacks do not transfer ownership: reconcile the active attempt and acceptance evidence first.

## Implement with useful concurrency

Decompose along actual ownership and dependencies. Different symptom files can share one root cause; those edits belong to one owner or an ordered shared-contract task. When subagent workers are requested, fill available capacity with independent, concrete lanes, then refill from the next-ready set. Leave worker model/class selection to the agent and harness defaults; honor explicit operator overrides. Discover current limits rather than baking in an agent count.

Each brief contains task/attempt ID, selected outcome, governing rulings, relevant source, exclusive write budget, acceptance check, durable output path and permitted checkpoint channel. Workers may inspect dependencies, but must return a newly discovered write collision to the coordinator before crossing ownership. Existing user changes remain attributable and intact.

Read and trace the real flow before changing it. Compose the domain authoring, generation, dependency, bug-investigation or release skill that owns the actual task. Compose enabled domain skills within the current authorization; a deliberate manual-only leaf needs actual user invocation and cannot be a required autonomous helper. Loading a skill does not grant publication or destructive authority.

Apply Ponytail after understanding the requirement: **as complex as necessary and as simple as possible**. Fix the shared root cause, reuse existing/native mechanisms, and remove superseded code within scope. Do not use “for now” shortcuts to weaken an invariant, leave an authorized migration unfinished, or carry a compatibility layer without a current need. Do not add unselected features in the name of completeness.

For an authorized sweeping migration of unreleased APIs, complete the architectural cutover without compatibility shims or deprecation phases unless the user changes that scope. An earlier MVP deferral does not narrow a later complete-migration instruction.

## Verification and recovery

Use the smallest meaningful acceptance evidence for each change. Prefer applicable existing checks; add a focused semantic regression check for changed non-trivial behavior. Run project checks through Nx and follow `testing-policy`. Verify UI/runtime outcomes when needed. Passing frontmatter, a worker's assertion, or exit zero alone cannot establish the selected behavior.

Give a fresh reviewer a bounded correctness question and the actual diff/evidence. Keep post-implementation review separate from `adversarial-review`, which owns pre-implementation research review. Resolve material findings and rerun affected checks; stop expanding verification after relevant checks pass unless new changes or failures justify it.

On interruption or a new session:

1. Read the queue, governing decisions, lane checkpoints and saved outputs.
2. Inspect native jobs by recorded identity. Reattach live work. For unknown liveness, investigate rather than dispatch a second writer; redispatch only known-dead unfinished scope under a new recorded attempt.
3. Recover supported results through the permitted writer and validate them. A denied write payload is proposed content, not proof of a saved or correct result.
4. Fence stale results by task/attempt identity. A late result may supply evidence but cannot silently overwrite a newer owner or mark its task complete.
5. Resume missing acceptance or implementation only. Retain verified work unless a changed source/ruling invalidates its assumptions.

Context, quota and interruption are continuation events. Persist usable evidence before handoff. Exploration needed for correctness has no artificial time deadline; neither elapsed time nor a fixed worker count is evidence of completion. Explicit operator scope and proportionality limits still apply. Once the question’s acceptance signal is established, close that question and preserve its evidence; do not repeat completed exploration merely to fill a time or worker budget.

## Human attention and closeout

Resolve empirical facts and reversible details consistent with intent autonomously. Ask only about an unresolved objective/invariant, a material trade-off between valid outcomes, unavailable evidence that changes the authorized result, or missing authority. Supply the recommendation, resolved evidence, affected task IDs and independent work that can continue. Do not re-ask for authorization already present.

Close out only the selected scope after semantic acceptance and relevant review. Record changed paths, observed checks, unresolved limitations and the next-ready set. Validate research/artifact links, check the separate Tau Brain Git boundary, and distinguish local saving, commit and backup. Do not silently commit, push, publish, schedule a future run or implement the unselected remainder.
