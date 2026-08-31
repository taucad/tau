---
name: codex-lanes
description: Fan implementation work out to parallel GPT-5.6 Sol lanes running on the Codex app-server, then adversarially review the result and route findings back for remediation. Lanes share the working copy and are kept apart by disjoint path budgets, the same way Claude subagents are. Use when delegating implementation to Codex, running parallel agent lanes, splitting a program across multiple implementers, asking for a second implementation pass, or when the user mentions Sol lanes, Codex lanes, fan-out, or adversarial review of delegated work.
---

# Codex Lanes

Dispatch contract for orchestrating parallel Codex implementation lanes. The orchestrator decomposes, dispatches, reviews, routes, and reports. Codex does the implementation.

Lanes work **in the current checkout**, exactly like Claude subagents: they see your uncommitted work, and their edits land where you expect. Nothing is snapshotted, branched, or merged. Isolation comes from disjoint path budgets, not from separate checkouts.

Rationale and evidence: `docs/research/codex-orchestration-plane-blueprint.md`. Read it only when a rule needs justifying or amending.

## The rule that must never be broken

Prefix **every** companion invocation — dispatch and read alike — with `env -u CODEX_COMPANION_SESSION_ID`.

The plugin's SessionStart hook injects that variable with this session's id. A job dispatched while it is set is owned by this session, and the SessionEnd hook **terminates the worker and erases the job record**, with no way to recover the result. With the variable unset, jobs survive session end and stay visible to any reader. There is no upside to leaving it set.

## Preconditions

```bash
CC=$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | sort -V | tail -1)
env -u CODEX_COMPANION_SESSION_ID node "$CC" setup --json
```

Requires `ready: true`. If Codex is missing or logged out, stop and report — do not try to install or authenticate.

## Workflow

### 1. Decompose into disjoint path budgets

Split the work into lanes where **no two lanes own the same file**. State each lane's budget explicitly in its brief. Nothing enforces it mechanically, so the budget is the whole isolation story — treat overlap as a design error, not a risk to manage.

Prefer one new file, or one tightly-scoped existing file, per lane. Work that must edit a shared file belongs in a single lane, done sequentially.

Record the pre-dispatch state so you can attribute changes afterwards:

```bash
git status --porcelain > /tmp/lanes-before.txt
```

### 2. Dispatch

One dispatch per lane, all from the repository root:

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" task --background --write \
  --model gpt-5.6-sol --effort xhigh "<lane brief>"
```

Capture each job id from stdout with `(task|review)-[a-z0-9]+-[a-z0-9]+` and record it against its lane in a `lanes.txt` of `<lane-name> <job-id>` lines.

`--background` detaches the worker, so lanes dispatched sequentially in one turn run concurrently. **Do not spawn Claude subagents to parallelize** — the concurrency is on the Codex side, and subagents add cost without adding parallelism.

Pass `--model` and `--effort` explicitly rather than inheriting `~/.codex/config.toml`, so a run is reproducible from its transcript. Omit `--write` for read-only lanes; it maps to the `workspace-write` sandbox.

### 3. Wait, without polling

Each conversational poll costs a turn. Launch **one** backgrounded shell that blocks until every lane is terminal and let the harness notify you when it exits:

```bash
# run_in_background: true
while :; do
  DONE=0
  while read -r LANE ID; do
    S=$(env -u CODEX_COMPANION_SESSION_ID node "$CC" status "$ID" --json \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).job.status)}catch{console.log("?")}})')
    case "$S" in completed|failed|cancelled) DONE=$((DONE+1));; esac
  done < lanes.txt
  [ "$DONE" -eq "$(wc -l < lanes.txt)" ] && break
  sleep 10
done
echo "all lanes terminal"
```

A failed lane reaches `failed` promptly with a usable error payload — it does not hang.

### 4. Collect and check budgets

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" result <job-id> --json
```

Returns `{job: {...}}` with `summary`, `threadId`, and `logFile`. Read `summary` whole; it is multi-line markdown, so tail-extracting its last line yields a stray code fence.

Then attribute every change against the budgets:

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

Use `--scope working-tree` for uncommitted work, or `--scope branch --base <ref>` once the work is committed. Prefer `--wait` over `--background`: `--wait` puts the schema-validated payload on stdout, which is what routing consumes. Review is always read-only and cannot modify the tree it judges.

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

Map `finding.file` to its owning lane's budget, then dispatch a fresh remediation lane:

```bash
env -u CODEX_COMPANION_SESSION_ID node "$CC" task --background --write \
  --model gpt-5.6-sol --effort xhigh \
  "Fix: <title> in <file>:<line_start>-<line_end>. <body> Recommendation: <recommendation>. Change only <file>."
```

Findings are self-contained, so a fresh lane re-reads the file and fixes it. Do **not** rely on `--resume-last` to continue a lane's thread: with several lanes in one checkout it is ambiguous, and it has been observed failing outright with `No previous Codex task thread was found for this repository`.

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

Then dispatch from each worktree, merge the lane branches when done, and `git worktree remove` each one. Set `worktree.baseRef: "head"` in settings and add a `.worktreeinclude` for gitignored files such as `.env`, or lanes will silently lack both your branch state and your environment.

## Interface notes

| Observation                                                                                                   | Consequence                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Job ids are `task-` for tasks and `review-` for reviews, never `job-`                                         | Match `(task\|review)-[a-z0-9]+-[a-z0-9]+`, or a review dispatch is silently unpollable                                          |
| `status <id> --json` → `{workspaceRoot, job}`; `status --all --json` → `{running, recent, latestFinished, …}` | Poll a known lane by id. For a sweep read **all three** buckets — the newest finished job sits in `latestFinished`, not `recent` |
| `result <id>` is unparseable while the job runs                                                               | Poll with `status`, collect with `result`                                                                                        |
| A backgrounded review's structured payload is at `storedJob.result.result`, not `result`                      | Prefer `--wait --json` and capture stdout                                                                                        |
| Writes outside the workspace are refused by the sandbox                                                       | Cross-repository tampering is contained; within the workspace, budgets are the only boundary                                     |
| Lanes inherit `~/.codex/config.toml`, `AGENTS.md`, and Codex-side skills                                      | Lanes are **not hermetic**. Treat operator config as an input when reproducing a run                                             |
| `cancel <id> --json` interrupts a running turn and leaves the tree coherent                                   | Use it to abandon a lane                                                                                                         |

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
