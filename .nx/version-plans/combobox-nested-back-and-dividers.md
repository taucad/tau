---
taucad-ui: minor
---

`ComboBoxResponsive` stacks its mobile drawer on the drawer it opens from without being told to: `isNested` now defaults to whether the combobox renders inside a drawer. A nested drawer shows its title with a Back control above the list, so it can be closed by tapping as well as by dragging. Drawer lists draw a hairline between rows, inset to where each row's text starts, through the new `command-item-dividers` utility.
