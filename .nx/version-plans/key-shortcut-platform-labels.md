---
taucad-ui: minor
---

`KeyShortcut` takes a `combination` in place of a label. The chip then carries both platforms' labels and shows the one `<html data-platform>` names before hydration (`other` for Windows and Linux, absent for macOS), so a chip drawn at first paint keeps its box when the page learns the platform. Without that attribute it follows `usePlatform`, as a label passed as children does.
