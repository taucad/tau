---
agent-plugin: minor
workbench-panes: minor
---

The viewer page names the part under the pointer as the Tau app's viewer does: a small label beside the cursor with the part's name, as the Model pane names it, and what it does in the mechanism while kinematics can be dragged. The label goes when the pointer leaves the canvas or the part menu opens, and never takes the pointer, so picking, the right-click part menu and Add to chat work through it.

The page's pane tabs now sit in its one top row, as the app's dock groups share theirs: the file tab, Share and Export over the canvas, then the lane's tabs, the `+` menu and the workbench toggle, top right. The second row of tabs is gone. With the lane closed, the toggle ends the canvas header.

`@taucad/workbench-panes` adds `component-menu/component-name-badge` (`HoveredModelComponentBadge`, `useHoveredModelComponentName`, `ModelComponentNameBadge`, `placeModelComponentNameBadge`), which the Tau app's viewer now draws its hover label from too, and `PaneLane` takes a `headerEnd` slot at the end of its header row.
