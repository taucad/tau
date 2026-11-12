---
viewer: minor
---

The viewer's keyboard shortcuts are intents that the graphics actor decides. Each key sends one `viewerShortcutPressed` event (`fitView`, `section`, `measure`, `grid`, `projection`, `escape` or `removeCut`) through the bar's keyboard adapter, a callback actor, and graphics emits `viewerShortcutApplied` with the outcome the bar announces. A key claims its event only when graphics acts on it, so Escape, Delete and Backspace pass through otherwise.

New exports from `@taucad/viewer/machines/graphics.machine`: the `ViewerShortcut`, `ViewerShortcutOutcome` and `ViewerShortcutCamera` types, and the event and emitted event above.

Delete and Backspace no longer announce "Cut removed" for a focused chip whose cut is already gone; graphics leaves that key unhandled.
