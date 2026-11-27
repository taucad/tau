---
revisions: minor
---

`gitCommandActivity` (`@taucad/revisions/node`) gains two methods:

- `during(phase, run)` counts the Git processes a store's open or a turn's admission starts.
- `observe(listener)` reports, as a `GitActivityEvent`, each Git process that ran a second or longer (its subcommand, milliseconds, exit code or the bound that stopped it, and phase) and each phase as it ends. Events carry no paths or arguments.

The native port's `init` runs as the `open` phase. Turn admission names its span as `admission` through a meter's optional `during`. The toolchain's version probes are metered too.
