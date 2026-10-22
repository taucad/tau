---
workbench-panes: patch
---

A tap on a Dockview header button opens it the first time on a touch screen. `@taucad/workbench-panes`' `dockviewStyleOverrides` reveals the new-tab and split actions on group hover only where a pointer can hover (`@media (hover: hover)`) and keeps them visible on touch screens, so iOS no longer spends the first tap revealing them; the header buttons' hover fill no longer sticks after a tap.
