---
taucad-ui: minor
---

Every phone drawer of rows now draws its rows in one list, `DrawerList` (with `drawerRowAttributes` to mark a row), so a responsive `DropdownMenu`'s items get the same hairline between rows as a `ComboBoxResponsive`'s options. The `drawer-row-dividers` utility, which `DrawerList` applies, replaces `command-item-dividers` and also divides rows marked `data-drawer-row`. Desktop popovers and menus are unchanged.

A drawer's top corners now take a 44px radius with its edge border running round them, a responsive `DropdownMenu`'s separators and header divider are inset like the row hairlines instead of spanning the drawer, and a highlighted drawer row is a rounded surface inset 6px from the edge instead of a full-width band.

Every drawer's header row is now `DrawerBar` (60px, `--drawer-bar-height`, which a grab strip also takes) with `drawerBarTitleClass` for its title, and its icon actions are `DrawerAction`, a 44px bordered circle (`drawerActionClass`).

A drawer row's shape is now exported as `drawerRowClass` (1rem padding, 1rem icon, 0.75rem gap), and `DrawerDivider` draws a drawer's header hairline (`variant: 'header'`) or a divider between row groups (`variant: 'group'`), so every drawer lines its rows, titles and dividers up on the same 16px and 44px edges. The `drawer-command-rows` utility moves a drawer's command search field, headings and rows to its 16px edge, and `drawer-inset-hairlines` insets the full-width `border-t` and `border-b` hairlines of content a drawer shares with a desktop popover.
