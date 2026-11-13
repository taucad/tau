---
taucad-ui: minor
viewer: patch
---

On a phone, Viewer settings open as the responsive menu's bottom drawer, titled "Viewer settings", instead of a popover clipped behind the viewer bar. Grid & units, Timeout and Kernel settings open in the same drawer under its Back row; the desktop menu and its beside-the-bar placement are unchanged. The settings' Back rows are now named `Back to Viewer settings` (they read `Back to Options`).

`DropdownMenuToggleGroupItem` and `DropdownMenuSliderItem` gain drawer forms inside a responsive `DropdownMenu`: touch rows of the shared drawer list, and a slider row whose drag scrubs instead of moving the sheet. `DropdownMenuSliderItem` takes `isInset` to start its label where an indicator row's text does.
