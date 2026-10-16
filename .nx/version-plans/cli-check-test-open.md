---
cli: minor
host: minor
---

`tau check <file>` evaluates a model and exits 0 ok, 1 error or 3 refused; `tau test [project]` runs the project's GeoSpec suites headlessly and exits 0 passed, 1 failed or 3 refused; both print one versioned record with `--json`. `tau serve [dir]` is local-first: without `--relay` it serves loopback only on port 7180 (the next free port unless `--strict-port`), pairs with no server, and accepts `--print`, `--json`, `--open/--no-open` and `--smoke-test`, with every report on stderr; `--trust-projects` is required only with a relay. `tau open [path|url]` serves a folder and opens it in the browser, and the Tau Cloud clone verb formerly called `tau open` is now `tau clone`. `startHostDaemon` accepts `relay: false` to serve its agent channel without pairing or dialling the relay.
