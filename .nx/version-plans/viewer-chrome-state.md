---
agent-plugin: minor
host: minor
mcp: minor
workbench-panes: minor
---

The agent plugin viewer keeps its lane per project (open state, tabs, width and the Model pane's sections), shows part thumbnails that `tau mcp` renders through the page-only `app_part_thumbnails`, and opens the shared part gallery. Adds `TauViewerModel.projectKey`, `PaneLaneLayout` with the `PaneLane` props `initialLayout` and `onLayoutChange`, and `@taucad/workbench-panes/model/part-gallery`.
