---
workbench-panes: minor
---

`@taucad/workbench-panes`' `ViewerStage` takes `live` on a `failed` status. With `live: false`, a failure with an action is drawn as a group named by its summary instead of an alert, for a host whose own live region already announces the failure, such as a route's announcement for a project open. The default stays an alert.
