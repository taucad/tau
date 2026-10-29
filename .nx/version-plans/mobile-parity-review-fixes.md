---
taucad-ui: patch
viewer: patch
---

`@taucad/ui`'s `Drawer` and `DrawerNestedRoot` provide their snap state through `Context.Provider`, so React 18 peers inside the package's `^18.0.0 || ^19.0.0` range keep working. `@taucad/viewer` marks its internal viewer control sizing helpers `@internal`.
