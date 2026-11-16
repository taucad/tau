---
taucad-ui: minor
---

New `WaitIndicator` in `@taucad/ui/components/wait-indicator`, `useWaitClock` and `WaitClockProvider` in `@taucad/ui/hooks/use-wait-clock`, and the loading timing ladder in `@taucad/ui/utils/wait-timing` (`indicatorDelayMilliseconds` 1,000, `indicatorMinimumMilliseconds` 500, `slowWaitMilliseconds` 10,000, `acknowledgeMilliseconds` 100, `waitPhaseAt`). The indicator is a spinner with words in a slot a region's frame already has: hidden until a wait passes 1,000 ms, held at least 500 ms once shown, and from 10,000 ms showing its slow words and an optional Retry. A CSS animation, not a script timer, does the waiting, so a server-rendered indicator keeps time before hydration through the `--wait-offset` root variable. The `wait-reveal`, `wait-hold`, `wait-until-slow` and `wait-after-slow` utilities in `tokens.css` drive it.
