---
agent-plugin: minor
cli: minor
host: minor
mcp: minor
workbench-panes: minor
---

The agent plugin viewer keeps its lane per project (open state, tabs, width and the Model pane's sections), shows part thumbnails that `tau mcp` renders through the page-only `app_part_thumbnails`, and opens the shared part gallery. Adds `TauViewerModel.projectKey`, `PaneLaneLayout` with the `PaneLane` props `initialLayout` and `onLayoutChange`, and `@taucad/workbench-panes/model/part-gallery`. The viewer bar gains the shared `@taucad/workbench-panes/shell/capture-view-control`, a Capture that saves to `exports/` through `app_save_capture`, and a render timeout kept in `.tau/workbench/entries.json` through `app_viewer_settings` that bounds how long `show_model` waits for the entry's watched render (`RENDER_TIMEOUT`); the Export pane keeps its choices per project in the same lane store; the page follows the host's high-contrast theme and accent.
