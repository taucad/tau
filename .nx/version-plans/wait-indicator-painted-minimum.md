---
taucad-ui: minor
---

`WaitIndicator` now keeps a shown indicator on screen for its 500 ms minimum counted from the frame it actually showed in, and times its CSS delays on the document timeline. Before, a long task could cut the minimum short twice over: a delay measured from `performance.now()` started on the timeline as it stood before the task, so it ended early by the task's length, and a reveal that a long task painted late still held only until its predicted time. `WaitClock` gains an optional `animationNow()`, the time a CSS animation started now counts its delay from (the default clock reads `document.timeline.currentTime`; clocks without it keep using `now()`), and `useWaitClock` returns `revealed`, to call from the reveal animation's `animationstart`.
