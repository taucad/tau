---
workbench-panes: minor
---

`ViewerStage`, `useViewerPartMenu` and `useViewerModelComponentActionMenuData` take an absent graphics actor, so a host can lay out the stage before its view has one: the stage shows its status and failure with no hover label, no part menu opens, and the stage keeps its identity when the actor arrives.
