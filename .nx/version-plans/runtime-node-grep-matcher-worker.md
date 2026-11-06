---
runtime: minor
host: minor
---

`@taucad/runtime/filesystem/node` exports `nodeGrepMatcherWorker`, which runs a filesystem bridge's `grep` matcher on a `worker_threads` thread. Node hosts pass it as `grepMatcherWorker` so a regular-expression `grep` answers instead of `ENOTSUP`, and a pattern that overruns its per-file deadline is stopped with `ETIMEDOUT`. `serveElectronFileSystemBridgePort` uses it by default and takes an optional third `options` argument to override it. The Tau Host daemon's executor bridge passes it too.
