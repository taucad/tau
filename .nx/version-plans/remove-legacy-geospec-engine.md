---
geospec: minor
geospec-engine: minor
---

Remove the TypeScript/WASM GeoSpec engine. The compiled engine (`@taucad/geospec-engine-native`) is now the only executor; hosts run specs through `createNativeGeoSpecRunner` from `geospec/runner/native`, the `geospec` CLI, or `createGeoSpecNativeNodePoolRunner` from `@taucad/geospec-engine/native-pool/node`.

Breaking:

- `geospec` drops the `./brep`, `./inspection`, `./proofs`, `./runner/node`, `./runner/web`, `./selector` and `./step` subpaths, and with them `analyzeBrep`, `inspectGeometry`, `loadStep`, `createStepLoader`, `createGeoSpecNodeRunner`, `createGeoSpecNodePoolRunner`, `createNodeVmFileSystem` (use `@taucad/geospec-engine/node-filesystem`), `createGeoSpecWebRunner` and `createGeoSpecWebPoolRunner`. Authored specs that import those subpaths now fail when the spec is bundled; inside the VM only `geospec` and `geospec/model` remain.
- `geospec` drops root `createGeoSpec` and the `GeoSpec`, `AnalyzeMeshOptions`, `AnalyzeMeshResult`, `LoadMeshOptions` and `LoadMeshResult` types; `geospec/mesh` drops `loadMesh`, `analyzeMesh` and `analyzeMeshOverlap` (use `evaluateGeoSpecNativeQuery` from `geospec/assertion-client`); `geospec/runner` drops `chargeBudget` and `checkBudget`.
- `geospec/engine` keeps only the matcher registry (`geoSpecMatcherDescriptors`, `normalizeGeoSpecExpected`) and the canonical-JSON helpers. The engine registry (`registerGeoSpecEngine`, `getGeoSpecEngine*`, `describeGeoSpecEngine`, `GeoSpecEngineImplementation`, `GeoSpecEngineHostBindings`, `GeoSpecEngineUnavailableError` and the `GEOSPEC_ENGINE_UNAVAILABLE` code), `geoSpecEngineProtocolVersion`, `geoSpecMatcherRegistryVersion` and every protocol-2 request, result and event type are removed.
- `geospec/runner/worker` drops `startGeoSpecPoolWorkerHost` and `GeoSpecPoolWorkerHostOptions`, and the pool `initialize` message no longer carries `compiledWasmModule`. `GeoSpecRunnerOptions` and `RunGeoSpecModuleOptions` lose `modelLoader`, `stepLoader` and `internalProfile` and require `nativeAssertions`; `createCollector` requires `nativeAssertions` and `GeoSpecNativeCollector` merges into `GeoSpecCollector`; `createModelLoader` requires `engine`; `loadModel` called outside a runner throws `GEOSPEC_MODEL_LOADER_UNAVAILABLE`.
- `@taucad/geospec-engine` drops its root export and the `./register`, `./register/node`, `./native/opencascade/single`, `./native/opencascade/single/wasm` and `./native/opencascade/single/wasm-url` subpaths, the bundled OCCT WebAssembly build and its LGPL notices. It now publishes the `geospec` bin, `./node-filesystem`, `./native-pool/node` and `./package.json`.
- The `geospec` CLI no longer accepts `--cache-directory` or `--no-cache`; the compiled engine keeps no persistent evidence cache. `GeoSpecCliHost` loses `flush`, and `createRunner` no longer receives `cache` or `cacheDirectory`.
