---
taucad-ui: patch
viewer: patch
workbench-panes: patch
---

Phone and tablet touch pass over the Workbench panes (charter W6). Under a coarse pointer, `@taucad/viewer`'s parameter fields take the 40px touch row with 16px input type, and a boolean parameter's whole row is its switch's label, so the row is the target rather than the 17px switch. `@taucad/ui`'s `ModifiedIndicator` shows its reset icon without hover and grows to a 24px target under a coarse pointer. `@taucad/workbench-panes`' parameter group actions are named ("Rename <group>") and shown on focus and on coarse pointers, the empty Parameters pane explains what to ask for, and export option fields follow the same touch row. In the model tree, a hidden part is labelled "Hidden" (its row button is named "<part>, hidden") and keeps its Show action in view, row actions show under a coarse pointer as well as `hover: none`, and the empty tree says when parts appear. Kinematics joint values and its filter take the touch row under a coarse pointer, entry header actions in Parameters and Kinematics show under a coarse pointer, and the Kinematics pane with no geometry units says when joints appear. The Share pane's checkbox labels are 24px targets under a coarse pointer.
