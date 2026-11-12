---
host: minor
---

An entry-less project adopts its first model as main (automatic kernel selection D3). While `tau.json` declares no `assets.main`, or names a file that does not exist, the first `evaluate_model` that renders ready, or the first model a complete `test_model` load rendered, is written into `assets.main.entryPath`; every other manifest field is kept. A project whose main resolves, a folder without `tau.json` and a manifest that does not parse are left untouched. This holds on every surface `createHostToolRegistry` serves: the desktop app, `tau daemon`, ACP and `tau mcp`.
