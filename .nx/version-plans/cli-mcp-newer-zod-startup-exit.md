---
cli: patch
host: patch
---

`tau mcp` starts under a newer Zod. Zod 4.5 and later close a fixed-length tuple with `additionalItems: false`, which the provider tool-schema conversion `@taucad/host` bundles refused, so an install whose peers resolved a newer Zod than the CLI's own crashed at startup with "Provider tool schema has a tuple that cannot use one items schema". The conversion now accepts that closed tuple and keeps emitting the same homogeneous fixed-length array under every Zod 4 release.

`tau mcp` now exits non-zero with its error when it cannot start serving. It used to print the error and keep running, holding its stdin and signal listeners, so the agent app that launched it never saw it fail.
