---
taucad-ui: minor
---

Every phone drawer of rows now draws its rows in one list, `DrawerList` (with `drawerRowAttributes` to mark a row), so a responsive `DropdownMenu`'s items get the same hairline between rows as a `ComboBoxResponsive`'s options. The `drawer-row-dividers` utility, which `DrawerList` applies, replaces `command-item-dividers` and also divides rows marked `data-drawer-row`. Desktop popovers and menus are unchanged.
