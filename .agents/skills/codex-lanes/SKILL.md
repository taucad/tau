---
name: codex-lanes
description: Fan implementation work out to parallel GPT-5.6 Sol lanes running on the Codex app-server, then adversarially review the result and route findings back for remediation. Lanes share the working copy and are kept apart by disjoint path budgets, and each lane reports back individually the way Claude subagents do. Use when delegating implementation to Codex, running parallel agent lanes, splitting a program across multiple implementers, asking for a second implementation pass, or when the user mentions Sol lanes, Codex lanes, fan-out, or adversarial review of delegated work.
---

# Codex Lanes

Dispatch contract for orchestrating parallel Codex implementation lanes. The orchestrator decomposes, dispatches, reviews, routes, and reports. Codex does the implementation.

Lanes work **in the current checkout**, exactly like Claude subagents: they see your uncommitted work, and their edits land where you expect. Nothing is snapshotted, branched, or merged. Isolation comes from disjoint path budgets, not from separate checkouts.

Lanes also _report back_ like Claude subagents: one background call per lane, one harness notification per lane as each finishes, and the notification's output file is the lane's report. There is no deadline — a lane that is alive and producing output is waited on for as long as the work takes.

Rationale and evidence: `docs/research/codex-orchestration-plane-blueprint.md` (the plane) and `docs/research/codex-lanes-subagent-parity-blueprint.md` (per-lane supervision). Read them only when a rule needs justifying or amending.

## The rule that must never be broken

Never let a lane be owned by a Claude session: an owned job is torn down — worker killed, record erased, result unrecoverable — by that session's SessionEnd hook.

`lanes.mjs` strips `CODEX_COMPANION_SESSION_ID` from every companion call it makes, so `lane`, `redispatch`, `wait`, and `collect` are safe as-is. The rule bites only when you invoke the companion **directly** (`setup`, `adversarial-review --wait`, `transfer`, `cancel`): prefix those with `env -u CODEX_COMPANION_SESSION_ID`. There is no upside to leaving it set.

## Preconditions

```bash
CC=$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1)
LANES="<skill-dir>/scripts/lanes.mjs"   # <skill-dir> is announced as "Base directory for this skill"
env -u CODEX_COMPANION_SESSION_ID node "$CC" setup --json
```

Resolve `LANES` once and reuse it. The loader prints the skill's base directory when this skill
loads; take it from there rather than guessing. Both paths work from any repository, so a wave
spanning several repos still uses one `CC` and one `LANES`.

Gate on `codex.available` and `auth.loggedIn`. **Do not gate on the aggregate `ready` field.**

`setup` verifies auth through the shared broker, so while any Codex turn is in flight — including one
started by another Claude session on this repository — it returns:

```jsonc
{ "ready": false, "auth": { "verified": null, "detail": "Shared Codex broker is busy." } }
```

That is a **healthy** state proving a lane is running, not a fault. Dispatch is unaffected: `task` and
`review` catch the busy code and fall back to a private app-server automatically. Gating a wave on
`ready: true` will stall a program behind a concurrent session for no reason.

Run `setup` once before the first dispatch, not as a per-wave gate. If Codex is missing or logged out,
stop and report — do not try to install or authenticate.

### Concurrency across sessions

The plugin runs **one broker per workspace root** (git toplevel), shared by every client in that
repository including other Claude sessions, and it is strict single-flight: one in-flight request or
stream at a time, others rejected with `-32001 Shared Codex broker is busy`. The automatic fallback to
a private app-server means lanes still run concurrently — measured: a second lane dispatched and
completed while a long turn held the broker.

Two consequences worth knowing. A session ending tears down the shared broker, so a concurrent
session's next call takes the direct-fallback path — a wobble, not a failure. And if you want brokers
that are genuinely independent across sessions, give each its own workspace root via the opt-in
worktree mode below.

## Workflow

### 1. Decompose into disjoint path budgets

Split the work into lanes where **no two lanes own the same file**. State each lane's budget explicitly in its brief. Nothing enforces it mechanically, so the budget is the whole isolation story — treat overlap as a design error, not a risk to manage.

Prefer one new file, or one tightly-scoped existing file, per lane. Work that must edit a shared file belongs in a single lane, done sequentially.

Record the pre-dispatch state so you can attribute changes afterwards:

```bash
git status --porcelain > /tmp/lanes-before.txt
```

### 2. Launch lanes — one background call per lane

Write each brief to a file, then make **one Bash call per lane** with `run_in_background: true` and
the lane's name as the call's description:

```bash
# run_in_background: true, description: "Lane N1 rust-core"
node "$LANES" lane N1 "$PWD" "$(cat /tmp/n1-brief.txt)" --ledger /tmp/lanes-wave1.txt
```

One call does everything: dispatches (`task --background --write --model gpt-5.6-sol`, session-id
stripped internally), records the job id in the ledger, then supervises — phase transitions and a
periodic heartbeat stream into the task's output file, and when the lane lands, its report (task
summary, or review verdict + findings) and the observed reasoning effort are printed before the
process exits. The harness then notifies you: **one notification per lane, as each finishes**, while
the others keep running. Dispatch every lane in the same turn, then keep working or end the turn.

Dispatch variants: `--review [--scope auto|working-tree|branch] [--base <ref>]` makes the lane an
adversarial review, with the brief as focus text; `--read-only` drops `--write`; `--effort xhigh`
pins effort when a run must be reproducible from its transcript alone.

Supervision matches Claude subagents — **no deadline**. Worker alive and producing output → the
waiter waits, however long it takes. Worker dead → exit `1` immediately. Worker alive but silent for
`--stall-min` minutes (default 15) → advisory exit `3`; nothing is killed. `--deadline-min N` exists
as an opt-in time box for a wave you deliberately budget.

`--background` on the Codex side means lanes dispatched sequentially in one turn run concurrently.
**Do not spawn Claude subagents to parallelize** — the concurrency is on the Codex side, and
subagents add cost without adding parallelism.

**Effort:** omitting `--effort` (the default) sends `effort: null`, so lanes inherit
`model_reasoning_effort` from `~/.codex/config.toml` — the only route to `max`, since the plugin's
`--effort` allowlist stops at `xhigh`. Set it once:

```toml
model_reasoning_effort = "max"
```

Every completed lane's report ends with `observed reasoning_effort=<value>` read from its rollout.
Treat `xhigh` there as "the config flip has not happened", not as an error.

### 3. React to each lane's wake

Read the finished task's output file — it **is** the lane's report:

| Exit | Meaning                                                         | Response                                                                                                                                                             |
| ---- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Completed; report + observed effort printed                     | Report the lane's outcome inline, attribute its budget, continue with the remaining lanes                                                                            |
| `3`  | Worker **ALIVE** but quiet (stalled) or past an opt-in time box | Peek the printed log path, then run the printed `Re-arm` command as a new background task. **Never re-dispatch** — the worker is still inside the lane's path budget |
| `1`  | Dead: failed, cancelled, zombie, or unreadable                  | Run the printed `Re-dispatch` command as a new background task; the brief is stored in the job record                                                                |

Report each lane as its wake arrives rather than batching the wave — partial results are decision
fuel, and the user should see progress.

Never hand-roll polling or parse job state files inline. Every conversational poll costs a turn, an
unbounded loop cannot notify you, and an inline `node -e` JSON parser is the single most reliable way
to break a wave: one missing parenthesis produced a monitor that spun for an hour emitting nothing
but `SyntaxError` while six finished lanes sat uncollected. The wake's output file is the report; to
read a report again later, use `collect`.

### 4. Wave recovery and budget attribution

The `--ledger` file from §2 is the wave's registry (`<lane-name> <job-id> <cwd>` lines). If your
per-lane waiters died — a previous session ended, a task was killed — re-attach to the whole wave
with one background call; lanes survive session death, so nothing is lost:

```bash
# run_in_background: true
node "$LANES" wait /tmp/lanes-wave1.txt
```

Same exit contract, wave-wide: `0` all completed (reports printed inline), `1` any lane dead, `3`
every remaining lane alive but quiet. `collect` re-prints reports for a ledger at any time. A single
dead lane recovers with the printed one-liner: `node "$LANES" redispatch <job-id> --cwd <dir>`.

After a wave lands, attribute every change against the budgets:

```bash
git status --porcelain > /tmp/lanes-after.txt
diff /tmp/lanes-before.txt /tmp/lanes-after.txt
```

Every newly changed file must fall inside exactly one lane's budget. Anything outside all budgets is a finding in its own right — report it rather than quietly accepting it.

### 5. Review

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" adversarial-review --wait \
  --scope working-tree --json > /tmp/review.json
```

Use `--scope working-tree` for uncommitted work, or `--scope branch --base <ref>` once the work is committed. Prefer `--wait` over `--background`: `--wait` puts the schema-validated payload on stdout, which is what routing consumes. For a long review dispatched as a lane instead, use `lane <name> <cwd> "<focus>" --review` and the payload arrives in the wake. Review is always read-only and cannot modify the tree it judges.

The payload carries `parseError` (must be `null`) and a `result`:

```jsonc
{
  "verdict": "approve | needs-attention",
  "summary": "string",
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "title": "",
      "body": "",
      "file": "",
      "line_start": 1,
      "line_end": 1,
      "confidence": 0.0,
      "recommendation": "",
    },
  ],
  "next_steps": ["string"],
}
```

For a large program, review per path-group rather than in one pass, so findings map cleanly back to lanes.

### 6. Route findings

**Gate on `severity` and `confidence`. Never gate on `verdict`.**

`approve` is reachable on trivial diffs, but on substantive code the reviewer reliably finds something true, so its absence says nothing about whether a lane is done. Blocking on `verdict == "approve"` risks never landing.

Default gate: `severity` in `{critical, high}` with `confidence >= 0.8`. Medium findings are frequently true but marginal — record them without blocking.

Map `finding.file` to its owning lane's budget, then dispatch a fresh remediation lane the same way as §2:

```bash
# run_in_background: true, description: "Lane FIX-1 <short title>"
node "$LANES" lane FIX-1 "$PWD" \
  "Fix: <title> in <file>:<line_start>-<line_end>. <body> Recommendation: <recommendation>. Change only <file>." \
  --ledger /tmp/lanes-fixes.txt
```

Findings are self-contained, so a fresh lane re-reads the file and fixes it. Do **not** rely on `--resume-last` to continue a lane's thread: with several lanes in one checkout it is ambiguous, and it has been observed failing outright with `No previous Codex task thread was found for this repository`. A follow-up to a finished lane is always a fresh lane re-reading the files.

Re-review after remediation. Success is the routed finding disappearing and the severity ceiling dropping — not a verdict flip.

### 7. Report

The work is already in the working copy. There is no merge step and nothing to clean up. Report per lane: job id, status, duration, files changed, budget verdict, and the review findings with what was routed.

## Optional: one worktree per lane

Use worktrees only when you want **branch-per-lane for pull-request review**, or when lanes genuinely must touch overlapping files. They cost a snapshot, a merge, and a cleanup, and they are the reason uncommitted work can go missing — a worktree checks out a commit, and by default branches from your repository's default branch, not your current work.

To carry the working copy into worktrees without disturbing it, build a snapshot commit with plumbing — this touches neither HEAD, the index, the working tree, nor your active branch:

```bash
SNAP=$(GIT_INDEX_FILE=$(mktemp -u) bash -c \
  'git read-tree HEAD && git add -A && git commit-tree $(git write-tree) -p HEAD -m "lane snapshot"')
git worktree add ../repo-lane-1 -b lane-1 "$SNAP"
```

Then dispatch from each worktree (`lane N1 ../repo-lane-1 "<brief>"`), merge the lane branches when done, and `git worktree remove` each one. Set `worktree.baseRef: "head"` in settings and add a `.worktreeinclude` for gitignored files such as `.env`, or lanes will silently lack both your branch state and your environment.

## Interface notes

| Observation                                                                                                   | Consequence                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `lane`/`wait` exit codes: `0` completed · `1` dead · `2` usage · `3` worker alive but quiet                   | `3` is never a failure — peek, then re-arm. Only `1` justifies `redispatch`                                    |
| Job ids are `task-` for tasks and `review-` for reviews, never `job-`                                         | Match `(task\|review)-[a-z0-9]+-[a-z0-9]+`, or a review dispatch is silently unpollable                        |
| `status <id> --json` → `{workspaceRoot, job}`; `status --all --json` → `{running, recent, latestFinished, …}` | For a manual sweep read **all three** buckets — the newest finished job sits in `latestFinished`, not `recent` |
| Every companion command resolves the job in the workspace of its `cwd`                                        | `lane --attach`, `redispatch`, and ledger lines must carry the lane's cwd, or the job is "not found"           |
| A backgrounded review's structured payload is at `storedJob.result.result`, not `result`                      | `lanes.mjs` reads both paths; when calling `result` by hand prefer `--wait --json` reviews                     |
| Writes outside the workspace are refused by the sandbox                                                       | Cross-repository tampering is contained; within the workspace, budgets are the only boundary                   |
| Lanes inherit `~/.codex/config.toml`, `AGENTS.md`, and Codex-side skills                                      | Lanes are **not hermetic**. Treat operator config as an input when reproducing a run                           |
| `cancel <id> --json` interrupts a running turn and leaves the tree coherent                                   | Use it to abandon a lane (the stall block prints the exact command)                                            |

## Briefing a lane with session context

To hand this conversation's context to Codex rather than restating it:

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" transfer --json
```

Returns `{threadId, resumeCommand, sourcePath}`. Use when a lane needs program-wide context a brief cannot carry.

## Lane brief template

```text
<Task, stated as an outcome.>

Path budget: you may create or modify ONLY <paths>.
Constraints: <language, module system, dependency limits>.
Verification: <how you must check your own work>.
Do not run any git command.
End your final message with: REPORT files=<comma-separated> tests=<none|pass|fail>
```

The git prohibition matters: lanes share the working copy, so a lane running `git add -A` would stage every other lane's work.
