---
parameters: patch
viewer: patch
workbench-panes: patch
---

A parameter edit is no longer refused with "The field changed since this edit began." because of the editor's own earlier edit, and a form change no longer reverts a field committed after the form last rendered.

- **`@taucad/parameters`**: `ParameterSetRequestBase` and the `replace-group-values` operation take an optional `editor`. The set actor records, per field, the editor whose edit last committed there and the value it left; while the field still holds that value, it is the base for that editor's next edit. `replace-group-values` also takes an optional `base`, the group values the edit was made from: only the fields that differ from it are written, and a changed field that another writer also moved refuses the replacement.
- **`@taucad/viewer`**: number, boolean, text and number-or-text rows track their own edits with a state machine, so while the rendered value still trails their own writes they keep showing and building on their last value, keep every typed character, and never report their own earlier value as changed elsewhere. A row's `ParameterCommit` accepts only a `FieldBase` minted by its edit lineage. `Parameters`' `onParametersChange` receives a second argument, the values the change was made from.
- **`@taucad/workbench-panes`**: `ParametersSource` gains `editValues`, which writes a form change with its required `base`; `replaceValues` stays the whole-group replacement. The controller sends one editor id for its pane, and `setValue` settles quietly when a newer edit of the field displaced it.
