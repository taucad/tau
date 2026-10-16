---
workbench-panes: minor
viewer: minor
taucad-ui: minor
host: minor
mcp: minor
agent-plugin: minor
project-core: minor
cli: minor
---

`@taucad/workbench-panes` is a new package holding the Tau workbench's Parameters, Model, Kinematics, Export and Share panes, their paneview primitives, the dockview theme and a pane registry, behind a `WorkbenchPanesHost` port that each host implements: the Tau app over its project, the agent plugin's viewer page over its MCP tools. `PaneLane` lays the panes out as tabs with the workbench's `+` menu and shortcuts, for a host without dockview's grid. `@taucad/viewer` exports `ViewerControls`, the app's viewer bar with its tool rows, shortcuts and Viewer settings, and `useViewerShortcuts`; `ModelViewer` takes `gizmoContainer` to draw the view cube in a container's top-right corner. `@taucad/ui` exports `styles/base.css`, the app's base layer (token borders, focus rings, selection and scrollbars). The agent plugin's full view is now the Tau workbench: Geist and Tau tokens, the app's bar over the canvas, the view cube top-right, and the five panes; only light or dark and the background follow the host. `@taucad/host` shows a GLB exported from a source with that source, so its panes have parameters, kinematics and exports, and its loopback page reaches `get_parameters` and `apply_parameter_operation` in the linked model's project. `@taucad/mcp`'s `show_model` description asks agents to show the source rather than an exported GLB. The page's Export pane exports through `export_model` and saves or downloads the result (`app_export_formats`, `app_save_export`, `app_read_artifact`), its Share pane makes a direct link (`app_share_link`), and right-clicking a part on the canvas or a row in the Model pane opens the app's part menu (Isolate, Hide, Show all, Focus on part, Show kinematics, Reveal in the Model pane). `@taucad/project-core` exports the share artifact, direct link, locator, snapshot and error modules the app's share flow used, so the host can build the same direct link. `tau mcp` passes the runtime to the viewer for exports and the source closure of a shared entry.
