---
taucad-ui: minor
---

`@taucad/ui/utils/wait-timing` adds two marks to the wait ladder: `skeletonDelayMilliseconds` (300 ms), when a region's skeleton bars show, and `detailDelayMilliseconds` (3,000 ms), when a measurable wait's detail line shows. A running wait's timing now carries `skeletonDelay` and `detailDelay` beside `revealDelay` and `slowDelay`, and `waitingTiming` takes an optional `progressedAt`. `tokens.css` adds the `wait-skeleton` and `wait-detail` utilities that read them.

The slow mark now counts from a wait's last progress. `useWaitClock` takes an optional `progress` and returns a `stall` count to key the swapped elements on, and `WaitIndicator` restarts its slow swap whenever its `progress` changes, so a wait whose numbers still move is never called slow and never offers its retry. `WaitIndicator`'s retry control now says "Try again" by default instead of "Retry"; pass `retryLabel` to keep other words.
