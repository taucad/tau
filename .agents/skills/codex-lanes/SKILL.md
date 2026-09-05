---
name: codex-lanes
description: Runs and recovers parallel implementation or review lanes through an available Codex companion transport. Use when a task needs that transport for disjoint implementation work; prefer current native subagent tools when they already provide the required delegation and recovery.
---

# Codex Lanes

This is an optional execution transport. [Work Charter](../work-charter/SKILL.md) owns selected scope, one coordinator queue, acceptance and recovery; [the artifact contract](../create-research/artifacts.md) owns durable evidence. Do not introduce a second scheduler or completion ledger. Native job IDs are observations attached to the existing task/attempt.

Lanes normally share the current checkout and see uncommitted work. Disjoint path ownership and byte baselines provide attribution; they do not enforce sandbox isolation. Prefer native subagents when available. Use this helper when the companion transport supplies a capability the current host needs.

## Inspect the available transport

Resolve the installed `codex-companion.mjs` from the host's plugin catalog or its actual plugin cache and read its help/version. Set `CC` to that discovered path and `LANES` to this skill's `scripts/lanes.mjs`. Do not install or authenticate a missing companion as a side effect of delegation.

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" setup --json
```

The helper removes `CODEX_COMPANION_SESSION_ID` from companion calls so a caller session's lifecycle hook does not own and erase background jobs. Apply the same prefix to direct companion calls. Preserve all other native trust, approval and sandbox settings.

Inspect actual availability/auth fields and errors. A busy shared broker can yield an unverified aggregate setup result while an existing lane is alive; this is not proof of logout or failure. The inspected companion supports a private app-server fallback. Confirm that behavior on the installed version rather than repeatedly running setup during live work.

Leave worker model/class selection to the agent and harness defaults; honor explicit operator overrides through supported per-call settings. Omitted `--model` and `--effort` inherit the operator's existing configuration; report observed values when available. Never edit user-global model configuration to force a lane setting.

## Claim paths and freeze bytes

Before dispatch, inspect surviving jobs and the coordinator queue. Record task/attempt, selected outcome, exclusive paths, shared-contract owner, permitted artifact writer and acceptance check. Different reported files may share one implementation owner; serialize that owner. A read-only worker returns results through the parent's supported save channel.

Set `LANE_RUN` to the authorized durable execution directory. Capture bytes before the wave:

```bash
node "$LANES" snapshot "$PWD" "$LANE_RUN/before.json"
```

This hashes tracked and non-ignored untracked files, modes and symlink targets without changing Git state. It does not traverse optional checkouts or hash ignored credentials. Record specifically authorized ignored outputs separately when a lane owns them. Git status alone misses later edits to an already-dirty file; it is supporting context, not attribution.

## Dispatch and supervise

Persist each exact brief first. Include the selected task/attempt, current root-to-target instruction chain, relevant skill references, allowed writes, semantic verification and checkpoint channel. Do not assume a custom native worker type exists or that every host preloads skills identically.

```bash
node "$LANES" lane N1 "$PWD" "$(cat "$LANE_RUN/n1-brief.txt")" \
  --ledger "$LANE_RUN/lanes-wave1.txt"
```

Use the current host's supported background execution tool for a long supervisor. One helper call dispatches one job, records its identity and prints progress plus its final report. Persist returned output promptly; an ephemeral notification is not its durable copy. Continue independent work while other lanes run.

Supported variants include `--read-only`, `--review --scope working-tree`, a known `--base`, and a supported `--model`/`--effort`. Sidebar placement is best effort (`--section` or `--no-section`); it never establishes task acceptance.

The supervisor has no default deadline. A live worker with progress keeps running. A quiet worker or an opt-in time box returns advisory exit `3` without killing it. Unreadable state is unknown liveness, also advisory; inspect it instead of dispatching a second writer. Exit `0` means native completion; exit `1` means observed failed/cancelled/dead state. Both still require coordinator inspection.

## Recover the existing attempt

```bash
node "$LANES" lane --attach <job-id> --cwd <checkout>
node "$LANES" wait "$LANE_RUN/lanes-wave1.txt"
node "$LANES" collect "$LANE_RUN/lanes-wave1.txt"
```

The text job registry uses `name job-id cwd` per line; use a checkout path without whitespace for this legacy transport. Preserve workspace identity because the companion resolves jobs relative to the checkout. Never use an ambiguous “resume last” for multiple lanes.

Reattach live jobs. Missing records, missing/invalid PIDs and unreadable status do not prove death. The companion deliberately clears `pid` to `null` on settled failed/cancelled records; that explicit terminal shape is stopped. A missing PID, or `null` on active/unknown records, remains unknown. The `redispatch` command refuses completed, live and unknown-liveness jobs; only a known-stopped unfinished job can reuse its stored prompt. Before redispatch, reconcile partial bytes and permissions, record a new attempt in the existing queue and retain the previous evidence:

```bash
node "$LANES" redispatch <dead-job-id> --cwd <checkout> --name <new-attempt> \
  --ledger "$LANE_RUN/lanes-wave1.txt"
```

Cancellation is a deliberate coordinator action through the companion's supported cancel command. Inspect the resulting state and bytes before releasing ownership. A late result may supply evidence but cannot overwrite a newer attempt or mark the queue verified.

## Attribute, review and accept

```bash
node "$LANES" snapshot "$PWD" "$LANE_RUN/after.json"
node "$LANES" changes "$LANE_RUN/before.json" "$LANE_RUN/after.json"
```

Map every changed path to exactly one recorded owner and inspect its actual diff. Outside-budget or competing changes require reconciliation; never silently stage or accept another task's work. A byte delta identifies a change, not its correctness.

Give a fresh native reviewer the bounded source diff and semantic acceptance question. The companion's read-only adversarial review is an optional transport:

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" adversarial-review --wait \
  --scope working-tree --json > "$LANE_RUN/review.json"
```

Validate the returned payload and source claims. Assess each finding against the selected outcome; a verdict, confidence number or severity label alone is not acceptance. Route material findings to the current path owner, remediate and rerun affected checks. Do not dispatch overlapping remediation while the original worker is alive.

Report job and task/attempt IDs, changed paths, checks, actual observed effort, persisted evidence and unresolved work. Only the coordinator marks selected tasks verified.

## Optional worktrees

Use worktrees when branch review or conflicting ownership requires them. Check the native tool's starting-state semantics; a fresh worktree may omit uncommitted changes. Carry only the explicitly selected source set through a reviewed patch or native working-tree handoff. Never use a blanket `git add -A` snapshot or copy ignored credentials into a lane.

Worktrees do not isolate ports, databases or external services. Record those resource owners separately. Clean up only the worktrees and temporary outputs this task created after their useful results are preserved.

## Helper verification

Run `pnpm nx run scripts:validate-agent-lanes`. Its focused checks cover a live writer being refused before dispatch, model inheritance and overrides, and byte changes that leave Git status unchanged. Native host discovery, skill inheritance and actual task quality require their own observed probes.
