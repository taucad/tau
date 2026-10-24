---
taucad-ui: patch
viewer: patch
workbench-panes: patch
---

Phone and tablet touch pass over the Workbench panes (charter W6). Under a coarse pointer, `@taucad/viewer`'s parameter fields take the 40px touch row with 16px input type, and a boolean parameter's whole row is its switch's label, so the row is the target rather than the 17px switch. `@taucad/ui`'s `ModifiedIndicator` shows its reset icon without hover and grows to a 24px target under a coarse pointer. `@taucad/workbench-panes`' parameter group actions are named ("Rename <group>") and shown on focus and on coarse pointers, the empty Parameters pane explains what to ask for, and export option fields follow the same touch row.
