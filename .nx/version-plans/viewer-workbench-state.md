---
mcp: minor
host: minor
agent-plugin: minor
workbench: minor
workbench-panes: minor
---

The Tau viewer page restores the view the project's `.tau/workbench` records keep, as the Tau app does. The page reads it through the new app-only `app_workbench_state` tool and seeds its graphics and camera before the first frame: camera, display, grid, field of view, up direction, section, pinned measurements and hidden and isolated parts. So reloading or reopening the page keeps the person's view, and an `arrange_workbench` layout survives a reload. The page also reports its display, grid, field of view, section and measurements as `TauViewerViewState.settings` (guarded by `accepts`), and `tau mcp` writes them into the view record with the same codec the app uses; `view_state` leaves them out of what the model reads.

`@taucad/workbench` adds `viewSettingsSchema`, `cameraPresetOrientations` and the `ViewSettings` and `ComponentDisplay` types. `@taucad/workbench-panes/records/view-record` is the shared translation between a view record and the viewer (`graphicsSettingsForView`, `newViewRecord`, `viewCameraOrientation`, `viewSettingsOf`, `toPersistedSectionCut`, `toViewMeasurements`), moved from the Tau app.
