---
workbench-panes: minor
agent-plugin: minor
---

The Share pane's link methods copy inside the press.

- **`@taucad/workbench-panes`**: the link body hands the clipboard the link, or the promise of the link it is still making, before anything is awaited (`copyText` from `@taucad/ui/utils/clipboard`), so Safari and iOS no longer refuse the copy after a slow share. When the clipboard still refuses, the link is shown selected with "Select the link and copy it." instead of an error. `ShareLinkMethod.shouldRemakeLink` makes a fresh link on every press and never holds the choices; changing one removes the link shown. A method without it still makes its link once and copies it on later presses.
- **`@taucad/agent-plugin`**: the viewer page's direct link is made again from the shown project on every press.
