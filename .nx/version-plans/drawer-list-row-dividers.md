---
taucad-ui: minor
---

Every phone drawer of rows now draws its rows in one list, `DrawerList` (with `drawerRowAttributes` to mark a row), so a responsive `DropdownMenu`'s items get the same hairline between rows as a `ComboBoxResponsive`'s options. The `drawer-row-dividers` utility, which `DrawerList` applies, replaces `command-item-dividers` and also divides rows marked `data-drawer-row`. Desktop popovers and menus are unchanged.

A drawer's top corners now take a 44px radius with its edge border running round them, a responsive `DropdownMenu`'s separators and header divider are inset like the row hairlines instead of spanning the drawer, and a highlighted drawer row is a rounded surface inset 8px from the edge instead of a full-width band.

Every drawer's header row is now `DrawerBar` (60px, `--drawer-bar-height`, which a grab strip also takes) with `drawerBarTitleClass` for its title, and its icon actions are `DrawerAction`, a 44px bordered circle (`drawerActionClass`).
