---
taucad-ui: patch
---

`useIsMobile` reads the viewport on the first client render instead of after an effect, so a phone no longer mounts the desktop layout for one frame before switching to the mobile one. Server rendering and hydration still report `false`.
