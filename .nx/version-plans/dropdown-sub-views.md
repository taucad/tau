---
taucad-ui: minor
viewer: minor
---

Dropdown submenus open as sub-views in place instead of flyouts: `DropdownMenuSubTrigger` pushes its `DropdownMenuSubContent` onto a view stack shared by the menu and its phone drawer, the sub-view leads with a Back row, and Escape or Backspace in an empty search steps back one level with focus returned to the trigger. The new `@taucad/ui/view-stack` entry exports `useViewStack`, `stepBackOnEmptySearch`, `ViewStackBack`, `ViewStackBackContent`, `viewStackBackRowClass` and `viewStackEnterClass` for surfaces that build their own stack. `ComboBoxResponsive` takes `subViews` with a controlled `search` and `onSearchChange`; a query searches every level at once. `DropdownMenuSelectItem` is now a sub-view radio list that steps back on choice, and its `title`, `description` and popover props are removed. The viewer's kernel settings open their kernel list as a sub-view.
