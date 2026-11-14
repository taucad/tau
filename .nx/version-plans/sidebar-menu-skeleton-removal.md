---
taucad-ui: minor
---

Breaking: `SidebarMenuSkeleton` is removed from `@taucad/ui/components/sidebar`. Sidebar rows load in place (UI Policy § 5): draw the real rows from what is remembered, and put a `WaitIndicator` from `@taucad/ui/components/wait-indicator` in the group label's trailing slot while they load.
