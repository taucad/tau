---
agent-plugin: minor
workbench-panes: minor
---

The agent plugin viewer's part menu has a keyboard route. In the tab, fullscreen and the browser page, the canvas region is focusable (`region "Model viewer"`); with it focused, Shift+F10 or the Menu key opens the selected part's menu at the region's centre on its first item, and closing the menu gives focus back to the canvas. The selected part's name in the header opens the same items as a dropdown ("Actions for <name>"). A touch long-press is not part of this change.

`@taucad/workbench-panes`: the coordinate-anchored `ViewerModelComponentActionMenu` moves focus between its enabled items with ↓, ↑, Home and End (a pointer-opened menu used to ignore them), and takes `shouldFocusFirstItem` (start on the first item, as when a key opened the menu) and `returnFocusTo` (where focus goes when the menu closes with focus inside it). `ModelComponentActionDropdown` takes `children` for its trigger's content, an ellipsis icon when absent.
