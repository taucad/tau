---
name: pr-review-coordinator
description: Automatically fetches unresolved PR review comments from GitHub and dispatches fixes to pr-issue-fixer subagents. Use when asked to fix PR comments, resolve PR review issues, address PR feedback, or fix a specific PR number.
disable-model-invocation: true
---

# PR Review Coordinator

Fetches unresolved PR review threads from GitHub and dispatches fixes to `pr-issue-fixer` subagents. Single-command automation -- user says "fix PR comments" and everything runs end-to-end.

## Workflow

### Step 1: Fetch Unresolved Comments

Run from the workspace root:

```bash
.agent/skills/pr-review-coordinator/scripts/fetch-pr-comments.sh [PR_NUMBER]
```

- Omit PR_NUMBER to auto-detect from the current git branch
- Pass `--all` to include already-resolved threads
- Requires: `gh` CLI (authenticated), `jq`

The script outputs JSON with this structure:

```json
{
  "pr": { "number": 123, "title": "...", "url": "..." },
  "threadCount": 5,
  "threads": [
    {
      "id": "PRRT_...",
      "isResolved": false,
      "isOutdated": false,
      "file": "src/utils/cache.ts",
      "line": 45,
      "startLine": null,
      "diffSide": "RIGHT",
      "comments": [
        {
          "author": "reviewer",
          "body": "...",
          "createdAt": "...",
          "url": "..."
        }
      ]
    }
  ]
}
```

If `threadCount` is 0, report "No unresolved review comments found" and stop.

### Step 2: Parse Issues

Transform each thread from the JSON into an issue:

| Field      | Source                                                          |
| ---------- | --------------------------------------------------------------- |
| File       | `thread.file`                                                   |
| Lines      | `thread.line` (+ `thread.startLine` for ranges)                 |
| Problem    | First comment's `body` (the original review)                    |
| Suggestion | Actionable fix extracted from comment body or follow-up replies |
| Context    | Full comment thread conversation                                |

**Infer priority from content:**

- **Critical**: security, data loss, crash, vulnerability
- **High**: bug, incorrect behavior, missing error handling, race condition
- **Medium**: performance, missing validation, code quality, memory leak
- **Low**: style, nit, naming, documentation

**Infer category:** cache-management | error-handling | performance | code-style | testing | documentation | security | architecture

Skip threads where `isOutdated: true` unless the issue is clearly still relevant.

### Step 3: Group and Prioritize

1. Sort by priority (Critical first)
2. Group by file (same-file issues run sequentially)
3. Flag conflicts (multiple issues on same lines)

### Step 4: Dispatch to Fixers

Use the Task tool with `subagent_type="pr-issue-fixer"`:

```
Use Task tool:
- subagent_type: "pr-issue-fixer"
- prompt: |
    Fix this PR review issue:
    - File: [path]
    - Lines: [numbers]
    - Priority: [level]
    - Category: [category]
    - Problem: [description]
    - Suggestion: [fix with code snippets]
    - Context: [full thread conversation]

    After fixing, run verification and report status.
```

**Parallelization:**

- PARALLEL: Issues in different files (max 4 concurrent)
- SEQUENTIAL: Issues in the same file

### Step 5: Compile Results

After all fixers complete:

```markdown
## PR Review Resolution Summary

### PR: #[number] - [title]

### Processed: X/Y unresolved threads

| Status | File           | Issue                    | Thread |
| ------ | -------------- | ------------------------ | ------ |
| ✅     | path/file.ts   | Brief description        | [link] |
| ⚠️     | path/other.ts  | Partial - [what remains] | [link] |
| ❌     | path/broken.ts | [reason]                 | [link] |
| 👤     | path/arch.ts   | Needs human review       | [link] |

### Verification

- Typecheck: ✅/❌
- Tests: N passed, M failed

### Follow-up

- [ ] Items needing human review
- [ ] Threads to resolve on GitHub
```

### Step 6: Final Verification

Run after all issues addressed:

```bash
pnpm nx typecheck <project>
pnpm nx test <project> --watch=false
```

## Guidelines

- Preserve code snippets from reviewer suggestions
- Skip "nitpick" or "optional" issues unless user requests otherwise
- For vague comments, include the full thread conversation for context
- Flag conflicting suggestions for human decision
- Do NOT auto-resolve threads on GitHub; list them for manual resolution
