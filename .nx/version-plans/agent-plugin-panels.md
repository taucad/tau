---
mcp: minor
host: minor
cli: minor
agent-plugin: minor
---

`tau mcp` serves `get_parameters` and `apply_parameter_operation`, so an agent outside Tau reads a model's parameters and edits them through the same checked sidecar writes Tau uses. Each `tau mcp` process writes through a private filesystem authority, made on its first edit and removed when it exits. `openLocalParameterActors` (new in `@taucad/host`) provides those actors. The viewer page's tab and fullscreen compositions gain a side panel: the component tree (select, hide and show), the model's parameters (an edit is written to the sidecar and the page shows the model rendered with it), the selected part's properties, and view switches for the grid, axes, edges and surfaces. When the person moves the camera or hides a part, `tau mcp` keeps that view in the project's `.tau/workbench` records (a view of the entry with the camera pose, and the entry's hidden and isolated parts), so Tau opens the project the same way. Only what the person changed since the page's previous report is written, so the page never reverts what `arrange_workbench` or Tau wrote meanwhile; a record another writer changed or that is invalid is left as it is. The page's camera report gains optional `frameId` and `perspectiveZoom`.
