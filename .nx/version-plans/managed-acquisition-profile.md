---
bundler-core: minor
esbuild: minor
rolldown: minor
runtime: minor
cli: minor
---

`TAU_ACQUISITION=locked` now governs JavaScript acquisition as well as native payloads. `BundlerSourceHostOptions` gains `acquisition: 'open' | 'locked'`; under `locked` the source host makes no request and refuses a bare import of a project without `package-lock.json`, and a URL import, with `package-not-locked`. `esbuildBundler` and `rolldownBundler` take the same `acquisition` option (`rolldownOptionsSchema` and `RolldownOptions` are new exports). The CLI composes its bundler under the profile in `tau export`, `tau mcp` and `tau serve` runtime children, and `tau install` refuses with `registry-unavailable` without contacting the registry. `EffectiveProfile` gains `variables`: the managed, proxy and CA variable names set in the environment, never their values, which `tau prepare --inspect` prints.
