---
agent-plugin: patch
workbench-panes: patch
---

The workbench lane's tabs share its header and stay clear of its buttons. `@taucad/workbench-panes`' `PaneLane` gives each tab an equal share of the header up to 144 px, down to 48 px, with its title dissolving at the end as the app's dock tabs do and the full title as a tooltip; past that the tablist scrolls, never under the `+` or Hide button. In the agent plugin viewer at its default 340 px lane the three opening tabs fit, and a click at a tab's centre activates it without scrolling it into view first.
