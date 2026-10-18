---
cli: minor
---

`tau mcp` keeps finished model builds across restarts, as Tau Desktop and `tau serve` do. It runs the durable SQLite compute store in a worker thread, started with the first project's runtime, with one store file per project under the Tau config directory's `compute` folder, the folder `tau serve` uses, so a model built by one Tau process is reused by the next. A fresh `tau mcp` on an already-built project answers `evaluate_model` from the store instead of rebuilding the model. A store that cannot open, such as one in an unwritable folder, leaves builds in memory with one line on stderr instead of failing the CAD tools. `--compute-mode off`, `memory` or `durable` (the default) selects the reuse mode, as on `tau serve`.
