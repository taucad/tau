---
agent-plugin: minor
workbench-panes: minor
---

The agent plugin viewer's tab has the Tau app's header: the shown file on the left and, on the right, Share and Export, which open their panes, and the workbench toggle, which shows and hides the lane. Share and Export fold to their icons in a tab narrower than 520 px and stay live once a model is shown; the Export pane says what it can export. The bottom bar ends with Viewer settings, as in the app: Copy prompt and the Panes toggle are gone, and the lane no longer has its own Hide workbench button. The inline card keeps Add to chat and Open full view, and in the tab a part's right-click menu adds that part to the chat.

`@taucad/workbench-panes` adds `components/workbench-toggle` (`WorkbenchToggleButton`: the 28 px "Toggle Workbench lane" button, pressed while the lane is open, with the frame glyph and an optional hidden-tab count) and `components/pane-action` (`PaneAction`: a labelled header action such as Share or Export, with host classes that fold it to its icon). The Tau app's viewer header draws its toggle, Share and Export with them. `PaneLane` no longer takes `onHide`: its host shows and hides it.
