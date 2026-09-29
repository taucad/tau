# @taucad/xstate-testing

Private XState v6 test harness for Tau's owner machines (`docs/policy/xstate-policy.md`, MC-R23).

- `@taucad/xstate-testing/inspect`: `guardActors` fails a test on any untaken dead letter, unanswered delivery (an unanswered timer included) or fault; `recordTransitions` records every delivery; `validated(machine)` checks runtime schemas in tests only.
- `@taucad/xstate-testing/clock`: `StepClock` fires chained timers in due order and exposes `nextDue()`.
- `@taucad/xstate-testing/paths`: `pathTable`, `unansweredEvents`, `unreachedStates` and `foreignEventChanges` over `xstate/graph`.
- `@taucad/xstate-testing/fakes`: scripted promise and callback actors, a fake parent and `recordEmitted`.

Use it as a devDependency only.
