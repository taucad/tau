---
host: minor
cli: minor
---

`tau serve` serves the cadmpeg engines of its own installed `cadmpeg-ts` beside the UI, same-origin, at the path the UI build names in its `cadmpeg-engines.json`. The mount answers `<id>_bg.wasm` only, as `application/wasm` with the isolation headers, and refuses any other name. When the UI was built against another `cadmpeg-ts` version or other engine digests, the daemon mounts nothing and warns with both versions and the fix; native CAD import is then unavailable in the served UI and everything else works. `serveStaticUi` takes `wasmMounts`, and `startHostDaemon`'s agent options take `uiWasmMounts`. `--smoke-test` fetches one mounted engine and checks it against `cadmpeg-ts/digests`, and `--json` reports `engines`.
