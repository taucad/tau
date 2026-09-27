---
slicer: patch
---

A `T<n>` of 64 or more is a machine command, not a filament selection: Bambu Studio's T255, T1000 and T1100 no longer change the tool (toolpath parser identity version 4). Preview G-code of any line count: `parseGcode` no longer limits lines by default (`maximumRecords` still sets a limit), and a plate too large to preview is refused with what to do instead.
