---
taucad-ui: minor
---

`ComboBoxResponsive` stacks its mobile drawer on the drawer it opens from without being told to: `isNested` now defaults to whether the combobox renders inside a drawer. A nested drawer shows its title with a Back control above the list, so it can be closed by tapping as well as by dragging. Drawer lists draw a hairline between rows, inset to where each row's text starts, through the `drawer-row-dividers` utility. Touch rows, a drawer list's filter field and the Back control share one 40px height, the new `--spacing-touch-row` theme token (`min-h-touch-row`, `h-touch-row`, `size-touch-row`); touch menu rows drop from 44px to 40px on phones.
