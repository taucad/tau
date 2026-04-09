---
title: 'Buerli ClassCAD Kernel Integration'
description: 'Investigation of @buerli.io/classcad WASM integration, direct API bypass strategy, and test blueprint for real geometry validation.'
status: active
created: '2026-04-09'
updated: '2026-04-09'
category: reference
related:
  - docs/policy/runtime-architecture-policy.md
---

# Buerli ClassCAD Kernel Integration

Investigation of how `@buerli.io/classcad` integrates as a Tau kernel plugin, the strategy for bypassing the Comlink/Worker layer, and the blueprint for testing with real ClassCAD geometry creation.

## Executive Summary

ClassCAD via `@buerli.io/classcad` provides a BRep parametric CAD engine running in-browser via WASM. While the library's `WASMClient` wraps a Comlink Worker, the underlying `classCadWorkerApi` class (fetched from CDN as `ClassCADWasmWorker.js`) is a plain JavaScript class that loads the Emscripten module and calls `module.init()` / `module.execute()` directly. This class has no inherent Worker dependency and can be instantiated on any thread. The recommended path for Node.js/Vitest integration tests is to implement a custom `AwvNodeClient` subclass that uses `classCadWorkerApi` directly without the Comlink proxy, enabling real part and assembly creation in tests.

## Problem Statement

The `WASMClient.connect()` method fails in Node.js with `ReferenceError: Worker is not defined` because it uses `new Worker(url)` + Comlink `wrap()`. This prevents real ClassCAD geometry tests in Vitest. However, the ClassCAD WASM engine itself is not Worker-dependent — the Comlink layer is only a transport convenience.

## Methodology

1. Read the full `WASMClient.js` source in `@buerli.io/classcad/build/esm/io/`
2. Fetched and deminified `ClassCADWasmWorker.js` from the ClassCAD CDN at `https://awvstatic.com/classcad/download/release/21.0.0/wasm/`
3. Traced the `facade.js` → `__callAPI` → `comClient.executeRequest` → `request` → `this.service.execute(command)` call chain
4. Analyzed `@classcad/api-js` v1 API command builders (`part.js`, `solid.js`, `sketch.js`)
5. Studied the `AwvNodeClient` base class contract (`executeRequest`, `request`, `requestTree`)

## Findings

### Finding 1: ClassCADWasmWorker.js Contains a Standalone WASM Loader

The CDN worker script (`ClassCADWasmWorker.js`) contains a class `classCadWorkerApi` (minified as `Oa`) with two methods:

```text
classCadWorkerApi.init(url, config)
  → import(ClassCADWasm.js)     // Dynamic ESM import of Emscripten module
  → factory({ locateFile })     // Emscripten module instantiation
  → FS setup (mkdir, writeFile) // Virtual filesystem for ClassCAD config
  → module.init(jsonConfig)     // ClassCAD kernel initialization

classCadWorkerApi.execute(command)
  → module.execute(JSON.stringify(command), module, onSend, onSendBinary)
  → Returns { messages: ServerResponse[], binaryMessages: ScgGraphicPackage[] }
```

**This class has zero Worker dependency.** It uses `import()` for module loading, `fetch()` for config files, and `this.module.*` for WASM calls. The `Comlink.expose()` call at the end is the _only_ Worker-specific line.

### Finding 2: Full Command Protocol from Facade to WASM

The `@buerli.io/classcad` facade builds commands as JSON arrays and passes them through the client:

```text
api.v1.part.box({ id, length, width, height })
  → facade.callSafeApiV('v1', 'part', 'box', [{ id, length, width, height }])
  → facade.callSafeApi('v1.part', 'box', [{ id, length, width, height }])
  → __callAPI(drawingId, [{ "v1.part.box": [{ id, length, width, height }] }])
  → comClient.executeRequest(task)
  → comClient.request({ command: 'Execute', task })
  → this.service.execute({ command: 'Execute', task })
  → WASM module.execute(JSON.stringify(command), ...)
```

The response flows back as `{ messages: [...], binaryMessages: [...] }` where messages contain `{ command: 'Result', from: 'Execute', result: { result, messages } }` and `{ command: 'Patch', ops: [...] }`.

### Finding 3: AwvNodeClient Is the Abstraction Boundary

`AwvNodeClient` is the base class that both `WASMClient` and `SocketIOClient` extend. It defines:

- `request(command: ServerRequest): Promise<ServerResponse>` — abstract, implemented by subclasses
- `executeRequest(task, streamMap?, options?)` — wraps `request` with stream handling
- `requestTree()` — calls `request({ command: 'GetTree' })`

Any object implementing these methods can be used as a `comClient` in `Globals.clientCache`. The high-level APIs (`createApi`, `BuerliCadFacade`) operate through this abstraction.

### Finding 4: Custom Node-Compatible Client Architecture

To bypass the Worker layer, we need a custom client that:

1. Fetches `ClassCADWasmWorker.js` from the CDN
2. Extracts the `classCadWorkerApi` class
3. Instantiates it directly (no Worker, no Comlink)
4. Calls `init(wasmUrl, config)` with the WASM URL and API key
5. Implements `request(command)` by calling `service.execute(command)` and processing the response (same logic as `WASMClient.requestByName`)

```text
┌─────────────────────────────────────────────────┐
│  BuerliCadFacade / createApi / api.v1.*          │
│  (unchanged — uses Globals.clientCache)          │
├─────────────────────────────────────────────────┤
│  NodeWASMClient extends AwvNodeClient            │  ← New
│  - Loads classCadWorkerApi directly              │
│  - No Worker/Comlink                             │
│  - Calls service.init() + service.execute()      │
├─────────────────────────────────────────────────┤
│  classCadWorkerApi (from ClassCADWasmWorker.js)   │
│  - import(ClassCADWasm.js)                       │
│  - module.init(config) / module.execute(cmd)     │
├─────────────────────────────────────────────────┤
│  ClassCAD WASM (Emscripten module)               │
│  - BRep kernel, constraint solver, meshing       │
└─────────────────────────────────────────────────┘
```

### Finding 5: Node.js Compatibility Blockers

The `classCadWorkerApi.init()` method uses:

1. **`import(ClassCADWasm.js)`** — dynamic import from CDN URL. Node.js supports `import()` of local modules but not HTTP URLs natively. Requires either: (a) fetching the script, writing to a temp file, and importing that, or (b) using a data URL with `--experimental-vm-modules`.

2. **`fetch()`** — used to load `classcad.cfe` (config file) and `filterconfig.json`. Node.js 18+ has global `fetch()`.

3. **Emscripten module** — `ClassCADWasm.js` is an Emscripten-generated loader that calls `WebAssembly.instantiate`. This works in Node.js.

4. **`window.location`** — referenced in WASMClient config but may not be needed for standalone init.

## Recommendations

| #   | Action                                                                               | Priority | Effort | Impact                         |
| --- | ------------------------------------------------------------------------------------ | -------- | ------ | ------------------------------ |
| R1  | Create `NodeWASMClient` that loads `classCadWorkerApi` directly                      | P0       | Medium | Enables real geometry tests    |
| R2  | Fetch and cache `ClassCADWasmWorker.js` + `ClassCADWasm.js` + `classcad.cfe` locally | P0       | Low    | Avoids CDN dependency in tests |
| R3  | Write integration tests with real `api.v1.part.*` calls                              | P0       | Medium | Validates the full pipeline    |
| R4  | Add `api.v1.solid.*` tests for direct modeling                                       | P1       | Low    | Coverage for both paradigms    |
| R5  | Test export via `api.v1.common.save` (OFB, STP, STL)                                 | P2       | Low    | Validates export pipeline      |

## Blueprint: Real Geometry Tests

### Phase 1 — NodeWASMClient (bypasses Comlink/Worker)

Create a test-only client at `packages/runtime/src/kernels/buerli/node-wasm-client.ts`:

```typescript
import { AwvNodeClient } from '@buerli.io/classcad';

export class NodeWASMClient extends AwvNodeClient {
  private service: InstanceType<typeof classCadWorkerApi>;

  async connect(wasmUrl: string, classcadKey: string): Promise<void> {
    // 1. Fetch ClassCADWasmWorker.js from CDN or local cache
    // 2. Extract classCadWorkerApi class
    // 3. this.service = new classCadWorkerApi()
    // 4. await this.service.init(wasmUrl, { cclasses: { type: 'classcadkey', key } })
  }

  async request(command: ServerRequest): Promise<ServerResponse> {
    // Mirror WASMClient.requestByName logic:
    // 1. await this.service.execute(command)
    // 2. Process messages (Result, Patch, ErrorMessage)
    // 3. Return structured ServerResponse
  }
}
```

### Phase 2 — Wire into BuerliCadFacade

```typescript
import { init, BuerliCadFacade } from '@buerli.io/classcad';

// Register NodeWASMClient as the client factory
init((drawingId) => new NodeWASMClient(drawingId, { classcadKey }));

// Use standard BuerliCadFacade
const bcf = new BuerliCadFacade();
await bcf.connect();
const api = bcf.api.v1;
```

### Phase 3 — Real Geometry Tests

Test categories following `buerli-examples` patterns:

**Part API (history-based):**

```typescript
// CreatePart pattern
const part = await api.part.create({ name: 'Part' });
await api.part.cylinder({ id: part, diameter: 50, height: 100 });
await api.part.fillet({ id: part, references: topEdges, radius: 10 });
const geom = await bcf.createBufferGeometry(part);
```

**Solid API (direct modeling):**

```typescript
// Lego pattern
const part = await api.part.create();
const ei = await api.part.entityInjection({ id: part });
const box = await api.solid.box({ id: ei, width: 90, height: 80, length: 90 });
const sub = await api.solid.box({ id: ei, width: 80, height: 70, length: 80 });
await api.solid.subtraction({ id: ei, target: box, tools: [sub] });
```

**Sketch + Extrusion:**

```typescript
const wp = await api.part.workPlane({ id: part, normal: { x: 0, y: 0, z: 1 } });
const sketch = await api.sketch.create({ id: part, planeId: wp });
const geom = await api.sketch.geometry({ id: sketch, lines: [...] });
await api.part.extrusion({ id: part, references: geom.lines, limit2: 20 });
```

### Phase 4 — Geometry Validation

Use existing test helpers:

```typescript
const result = await buerliKernel.createGeometry(...);
await geometryHelpers.expectValidGltf(result);
await geometryHelpers.expectMeshCount(result, 1);
await geometryHelpers.expectBoundingBoxSize(result, [w, h, d], tolerance);
```

## Trade-offs

| Approach                       | Pros                               | Cons                                                         |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------ |
| NodeWASMClient (direct WASM)   | Real geometry, full API validation | Medium effort, CDN fetch of WASM (~50MB), Node.js ESM compat |
| SocketIOClient (remote server) | Uses existing client code          | Requires running ClassCAD server, external dependency        |
| Synthetic geometry (current)   | Fast, no WASM dependency           | No real CAD validation, conversion-only                      |

## References

- CDN worker: `https://awvstatic.com/classcad/download/release/21.0.0/wasm/ClassCADWasmWorker.js`
- Source: `repos/buerli-examples/` (56 example files)
- Source: `repos/buerligons/` (production app)
- Docs: [buerli.io/docs](https://buerli.io/docs)
- npm: `@buerli.io/classcad@1.0.1`, `@classcad/api-js@21.0.0`
- Related: `packages/runtime/src/kernels/replicad/replicad.kernel.test.ts` (gold standard)
