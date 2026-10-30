---
parameters: patch
viewer: patch
workbench-panes: patch
---

A parameter edit is no longer refused with "The field changed since this edit began." because of the editor's own earlier step.

- **`@taucad/parameters`**: `ParameterSetRequestBase` takes an optional `editor`. The set actor records, per field, the editor whose value edit last committed there and the value it left; while the field still holds that value, it is the base for that editor's next edit. Only another writer's change refuses an editor.
- **`@taucad/viewer`**: a number row tracks its own edits with a state machine, so while the rendered value still trails its own settled steps it keeps showing and building on its last value and never reports its own earlier value as changed elsewhere.
- **`@taucad/workbench-panes`**: the parameter controller sends one editor id for its pane.
