---
workbench-panes: minor
---

`graphicsSettingsForView(record, resolved?)` takes an optional resolution of the view's inheritable leaves (`resolveViewSettings(...).values` from `@taucad/workbench`) and seeds the display flags, up direction and field of view from it. Without it the record's own values are used, as before.
