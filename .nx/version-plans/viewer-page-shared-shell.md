---
agent-plugin: minor
---

The viewer page draws the Tau app's viewer shell from `@taucad/workbench-panes` instead of its own copy: the canvas region, part menu, hover label, header Share and Export, file tab and loading status are the same components the app's viewer draws. The file tab shows the app's cube glyph, fades a long name and gives the full path as its tooltip; Share and Export fold to their icons below the app's viewer width; loading shows the app's status pill with its percentage, and a failure the app's runtime error notice. The header's part name follows the selected part wherever it was picked, in the canvas, the Model pane or by the agent. The canvas region is now an application region named "Model viewer", as in the app.
