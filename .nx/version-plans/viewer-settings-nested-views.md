---
taucad-ui: minor
viewer: minor
---

Every sub-view's Back row reads "Back". `ViewStackBackContent` takes no props and `ViewStackBack` no longer takes `title`; the Back row keeps its compact styling and its `Back to <parent>` accessible name, and `DropdownMenuSubContent`'s `title` now names only the sub-view's group. A sub-view trigger's chevron gives up its `ml-auto` when a value before it already takes the free space (`menuViewTriggerChevronClass`), so a row's value sits against the chevron instead of mid-row.

The viewer bar loses its grid readout: `@taucad/viewer/cad/grid-control` and `GridSizeIndicator` are removed, and Viewer settings gains a Grid & units row below Field of view that opens the unit list and the Lock grid size switch. Kernel settings is one row reading "Defaults" or "N changed" that opens a sub-view, a preset-or-explicit setting is one radio list of its presets and Custom, and `KernelSettings` no longer takes `isDefaultOpen`. Timeout, Grid & units and Kernel settings each show a heading in their sub-view. The Reset view row and `ViewerViewFields.resetView` are removed. Inside a viewer bar, the settings menu opens to the right of the bar when the viewer pane has room for it, and above the gear otherwise. Fullscreen uses the `Maximize2` and `Minimize2` glyphs.
