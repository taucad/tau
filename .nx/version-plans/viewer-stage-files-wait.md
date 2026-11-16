---
workbench-panes: minor
---

`@taucad/workbench-panes`' `ViewerStage` takes `isWaiting`, which keeps the canvas region `aria-busy` while the host waits for what the canvas will draw, such as the model's files. A `failed` status takes an optional `action`, such as a "Try again" button: the stage then draws the failure as one alert with the summary, the message and the action. A canvas the renderer has not sized yet fills the canvas region instead of the element's 300 by 150 default, so it is attached at the stage's size.
