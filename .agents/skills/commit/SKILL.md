---
name: commit
description: Previews, stages, and commits requested changes as policy-compliant atomic commits, or pushes committed work when authorized. Use when the current task asks for a commit preview, staging, committing, or pushing; command modes remain available for precise scope.
argument-hint: '[dry|stage|push|unsafe [continue|proceed]]'
---

# Commit

Read the applicable repository commit policy before planning commits or changing the index.

## Modes

- `/commit`: create local commits; never push.
- `/commit dry`: list every commit that would be made and all of its files; never stage, commit, or push.
- `/commit stage`: stage exactly one logical group for review, then stop.
- `/commit push`: create local commits, then push them to configured upstreams.
- `/commit unsafe`: accept that commits may be unsafe. Dry-run only hunks relevant to changes in this chat; never stage, commit, or push.
- `/commit unsafe continue` or `/commit unsafe proceed`: continue the latest `/commit unsafe` dry run by committing its planned hunks locally; never push.

Reject other arguments or mode combinations.

## Workflow

1. Default to changes made in the current task. Explicit user paths override that scope. Inspect diffs only for those paths, plus cached filenames to detect unrelated staged work; do not inventory unrelated worktree diffs.
2. Treat this as packaging existing work, not implementation. Do not create, edit, format, regenerate, or delete files except to resolve an in-scope commit-hook failure.
3. Determine each proposed group and its paths. A group is the smallest independently revertible change. Split whenever one Conventional Commit type and subject cannot accurately describe every path, even within one project, directory, feature, or task. Keep tests and generated artifacts with the source change they verify or derive from.
4. If the index contains content outside the current group, mutating modes stop instead of rearranging it. Dry mode reports the conflict as a blocker without changing it.
5. Reuse validation completed in the current task; do not rerun it. Mutating modes run `git diff --cached --check`, then rely on repository hooks.
6. Choose a message that follows the repository policy.

For `/commit dry`, resolve every group exactly as `/commit` would, including groups in separate repositories. Report groups in execution order with the repository root, proposed Conventional Commit message, and status plus path of every file. Report known validation state and blockers. Do not stop merely because there are several groups, and do not change files, the index, refs, or remotes.

For `/commit unsafe`, follow `/commit dry` at hunk granularity. Include only hunks relevant to changes in this chat, even when their files also contain unrelated hunks. Treat uncertain hunk attribution as an accepted risk rather than a blocker. Report each included file path and hunk header.

For `/commit unsafe continue` and `/commit unsafe proceed`, require a preceding `/commit unsafe` dry run in this chat. Reinspect only its planned hunks; if they changed since the dry run, rerun `/commit unsafe` and stop. Otherwise, process one group at a time: stage only the planned hunks, review the cached diff, run `git diff --cached --check`, commit, then verify status and the new log entry before continuing.

For `/commit stage`, require one logical group. If the scope contains several groups, report them and wait. Otherwise, stage its explicit paths, show the cached names and diff summary, run `git diff --cached --check`, then stop.

For `/commit` and `/commit push`, process one group at a time: stage explicit paths, review the cached diff, commit, then verify status and the new log entry before continuing.

For `/commit push`, finish every local commit first. Before the first push, verify every committed repository's current branch has a configured upstream. If all do, run plain `git push` in each repository; otherwise push none and report the missing upstream.

## Boundaries

For an interrupted lint-staged hook, first inspect its logged backup commit and current index without restoring anything. A backup can survive after its stash reference is dropped. Verify its index parent's relationship to the intended current HEAD and compare the affected paths before proposing recovery; never apply an unrelated surviving backup or restore the whole worktree. This inspection does not authorize a reset, stash operation or overwrite.

- Never push unless invoked as `/commit push`; never force-push, push tags, or create an upstream.
- Never stage or commit in `/commit dry` or bare `/commit unsafe` mode.
- Never amend, stash, reset, bypass hooks, or include unrelated changes.
- If a hook fails, fix only an in-scope cause and retry; otherwise report the blocker.
- “All changes” expands scope but does not collapse distinct logical groups.
