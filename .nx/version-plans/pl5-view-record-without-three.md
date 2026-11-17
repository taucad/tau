---
workbench-panes: patch
---

`@taucad/workbench-panes/records/view-record` no longer imports three.js: `viewCameraOrientation` resolves the camera's up axis with `@taucad/camera`, now a dependency, and returns the same orientation. A host that loads view records on its first screen no longer loads three.js with them.
