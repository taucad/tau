---
runtime: minor
---

Add the Tau project config: `defineConfig` and `TauConfig` in `@taucad/runtime/config`, and `loadTauConfig` in `@taucad/runtime/config/node`, which reads exactly one `tau.config.{ts,mts,js,mjs}` (or an explicit `configPath`), refuses unknown fields, uninvoked factories and other plugin ABIs, and resolves `@taucad/runtime/config` to its own copy when the project has no install.
