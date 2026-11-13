---
taucad-ui: minor
---

New `useWaitClockSource` in `@taucad/ui/hooks/use-wait-clock` returns the clock waits are measured on (the nearest `WaitClockProvider`'s, or the performance timeline), so a region can record when its own wait started, such as a gesture or a Retry, on the same clock its `WaitIndicator` reads.
