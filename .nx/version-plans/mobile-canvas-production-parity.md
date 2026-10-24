---
taucad-ui: minor
viewer: minor
workbench-panes: minor
---

Shared components meet the reviewed mobile canvas. `@taucad/ui`'s `Button` gains `touch` and `icon-touch` sizes (44px), a responsive surface context lets an embedded host report its own phone viewport and portal container to `useIsMobile` and the overlays, and a detented bottom drawer gets a 24px grabber row (`--drawer-handle-height`) whose handle is a keyboard slider: arrows, Home and End move between detents, and Enter or Space cycles them. Titles and other content inside the sheet no longer move it.

`@taucad/viewer`'s `ViewerControls` takes a `mobileAction`, such as AR, shown after Fit view in place of Fullscreen on phones, and `enableTouchTargets` for touch-sized controls in an embedded surface. On a phone the bar fits the space it is given, wraps its controls and scrolls its tool rows; a desktop pane's bar still never shrinks below its rows. The phone's glyph-only grid trigger names the grid size and its lock state, as its tooltip does (`Grid 10 mm, locked, units and grid`).

`@taucad/workbench-panes`' model tree shows hidden components and the header count in the muted foreground colour instead of a reduced opacity, so they keep text contrast.
