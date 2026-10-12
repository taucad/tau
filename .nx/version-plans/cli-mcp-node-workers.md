---
cli: minor
---

`tau mcp` runs each project's kernels in their own worker thread instead of sharing one realm. A model that runs past `--operation-timeout` (default 600 s) or ends its thread costs only its own project that thread, which the project's next call replaces, while other projects keep working; two projects' models now compute in parallel. A project's thread with no call in flight for `--idle-release` (default 900 s) is released, returning its memory. Server shutdown terminates every thread, including one running a model that never returns.
