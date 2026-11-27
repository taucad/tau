---
workbench-panes: minor
---

`ParametersPane` no longer says "Loading parameter metadata…" while an entry's parameter manifest is on its way. The entry's body stays in its box as a busy group named after the entry, and a host can draw the rows' shape in it through the new optional `ParametersSource.ManifestWait` component; without one the body is drawn empty while it waits.
