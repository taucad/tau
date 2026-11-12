---
cli: minor
revisions: minor
host: minor
agent-host: minor
---

A save is a history entry and has no number; a named point is a version (V1, V2, …). "Revision" and "Rev" are reserved for a release workflow.

Breaking:

- `tau revisions` is removed, with no alias. Its verbs are now `tau history` (`log`, `diff`, `describe`, `save`, `switch`, `discard`) and `tau version` (`create`, `list`, `rename`). A JSON record's `kind` follows the command, for example `history`, `history-save`, `history-place` and `version`. `tau history log` prints a row's short id, title, author, time and, for a version, `V3` with its name, and `--provenance` adds the agent and run.
- The agent tool `revisions` is now `history`. Its rows carry no position field; a version row carries its number and name.
- A restore or undo entry's generated title names the entry it brought back: `Restored V2`, `Restored “Add vent slots”`, or `Restored an earlier point` when nothing names it; never `Restored Rev N`. An undo reads `Undid …` the same way.
- A place's `line` is the branch alone, `main`, and a project with nothing saved reads `No history yet`.
- The undo refusals say `Restore an earlier point instead.`, and a publish of an empty project says it `has no history yet`.
