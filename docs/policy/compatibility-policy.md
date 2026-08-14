---
title: 'Platform Compatibility Policy'
description: 'Canonical capability matrix for Tau browsers, runtime hosts, WebAssembly artifacts, filesystems, workers, and graphics.'
status: active
created: '2026-07-21'
updated: '2026-08-04'
related:
  - docs/policy/filesystem-policy.md
  - docs/policy/filesystem-authority-policy.md
  - docs/policy/graphics-backend-policy.md
  - docs/policy/npm-policy.md
  - docs/policy/runtime-architecture-policy.md
  - docs/policy/worker-policy.md
  - docs/research/platform-compatibility-policy-blueprint.md
  - docs/research/runtime-framework-version-matrix-blueprint.md
---

# Platform Compatibility Policy

Internal reference for the browser, runtime-host, WebAssembly, deployment, filesystem, worker, and graphics capabilities Tau supports.

## Rationale

Tau crosses browser engines, Node, Electron, workers, WebAssembly toolchains, storage providers, and graphics backends. A version allowlist hides the different failure modes at those boundaries: unsupported Wasm instructions reject a module before execution, deployment headers control shared memory, and permissioned or device-backed APIs can fail despite constructor presence. This policy therefore defines support by capability and Tau surface, with an explicit proof and fallback for every non-universal path.

## Scope

This policy covers a platform feature only when Tau emits or requires it, conditionally uses it, has a documented incident involving it, or is actively evaluating it. It is the canonical support matrix; specialized policies continue to own implementation details.

This policy does not:

- catalog unrelated JavaScript, CSS, HTML, device, or Wasm proposals;
- authorize user-agent dispatch where a capability or artifact probe is possible;
- add a runtime probe, fallback, build variant, or compatibility shim by itself;
- make experimental support universal because one current or beta engine implements it;
- require a generated MDN Browser Compatibility Data dependency or companion `.cursor/rules` file.

## Capability Tiers

| Tau tier                        | Contract                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Required**                    | Every named Tau surface must provide the capability. Absence is an unsupported host or a typed initialization failure.                                        |
| **Hosted requirement**          | The embedding application or deployment must supply the capability, headers, response metadata, or asset topology for the affected surface.                   |
| **Conditional**                 | Tau may use the capability only after the stated probe or proof succeeds and the row's fallback or typed failure remains available.                           |
| **Watch / prohibited baseline** | Track the capability, but do not emit it in universal artifacts or make it necessary for supported behavior until the promotion procedure is fully satisfied. |

## Matrix Conventions

Capability tables use these columns:

| Field              | Meaning                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Feature            | Canonical feature name linked to MDN.                                                                   |
| Tau tier           | One of the four tiers above.                                                                            |
| Surfaces           | The Tau products, packages, or hosts to which the row applies.                                          |
| Chromium           | Current Chromium evidence for the tier.                                                                 |
| Firefox            | Current Firefox evidence for the tier.                                                                  |
| Safari / WebKit    | Current Safari evidence; beta Safari and Playwright WebKit are identified explicitly.                   |
| Node / Electron    | Evidence at Tau's declared host floor, not only the newest release.                                     |
| Probe or proof     | Runtime operation, response inspection, static artifact validation, real-browser test, or package test. |
| Fallback / failure | Required fallback or typed failure.                                                                     |
| Verified           | ISO date on which the evidence was reviewed.                                                            |

Symbols are shorthand only: ✅ satisfies the Tau tier, ⚠ is partial or environment-dependent, ❌ is absent or prohibited for that surface, and N/A is not meaningful for that host. Symbols never replace the Tau tier or fallback prose.

## Qualification Surfaces

Support claims apply only to the surface named by the row. Passing one surface does not qualify another.

| Surface                     | Required qualification                                                                                           | Evidence that is insufficient                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Universal Wasm artifact     | Static feature inspection plus instantiation on Node 24 and current stable Chromium, Firefox, and branded Safari | A successful compile, one opcode probe, or a newest-Node-only test         |
| Browser runtime             | Production bundle, worker handshake, representative kernel initialization, and typed failure paths               | Dev-server success or constructor presence                                 |
| Hosted shared-memory path   | Production-like document and dependency responses plus `crossOriginIsolated === true`                            | COOP/COEP on HTML without checking workers, Wasm, fonts, and API responses |
| Browser filesystem provider | Provider creation and the required read/write/watch operation under real permission and storage behavior         | A picker property, stored handle, or OPFS method existing                  |
| Graphics backend            | Context/device creation and a representative rendered scene on the named backend                                 | `navigator.gpu`, `OffscreenCanvas`, or a context constructor existing      |
| Node package                | Published-package tests at `engines.node` minimum                                                                | Tests only on Node Current                                                 |
| Electron package            | Published subpath and process-boundary smoke tests on the supported Electron line                                | Chromium version comparison                                                |
| Third-party bundler         | Published-package consumer fixture with app-owned worker and asset paths                                         | A first-party source import or Vite-only build                             |

## Failure Classes

Use the failure class matching the compatibility boundary:

| Boundary                                      | Required outcome                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Unsupported Wasm feature                      | Preserve the compilation/instantiation error and fail kernel initialization |
| Missing hosted header or response metadata    | Report the failed isolation, worker, or asset response requirement          |
| Permissioned filesystem unavailable or denied | Return the provider's typed unsupported, permission, or aborted outcome     |
| Browser-managed storage operation fails       | Preserve the DOMException in a typed provider result                        |
| Graphics adapter/context unavailable          | Select the documented backend fallback or return a typed renderer failure   |
| Unsupported Node/Electron host                | Reject the host/package combination before relying on the missing feature   |

An empty model, empty directory, endless loading state, or silent provider substitution is never a compatibility fallback.

## Compatibility Matrices

### WebAssembly Compilation and Memory

| Feature                                                                                                                                              | Tau tier                                               | Surfaces                                                       | Chromium                | Firefox                          | Safari / WebKit                           | Node / Electron                     | Probe or proof                                                                   | Fallback / failure                                                                                        | Verified   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | ----------------------- | -------------------------------- | ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| [Core WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface)                                              | Required                                               | All CAD kernels; browser runtime; Node/Electron; CLI/converter | ✅                      | ✅                               | ✅ branded Safari                         | ✅ at Node 24 / supported Electron  | Compile and instantiate the shipped module                                       | Reject kernel initialization with the original Wasm error                                                 | 2026-07-21 |
| [SIMD128 / `v128`](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/SIMD)                                                              | Required for universal SIMD artifacts                  | OCJS, Replicad, AssimpJS                                       | ✅                      | ✅                               | ✅                                        | ✅                                  | Statically inspect emitted features and instantiate the shipped artifact         | No scalar substitution inside one artifact; ship a separately qualified artifact if ever needed           | 2026-07-21 |
| [Relaxed SIMD](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/SIMD)                                                                  | Watch / prohibited baseline                            | Universal Wasm artifacts                                       | ✅ in current engines   | ✅ in current engines            | ⚠ only a proposal subset in Safari stable | ⚠ V8-version-dependent              | Inspect every emitted opcode, not one representative instruction                 | Universal artifact remains SIMD128-only; an optimized variant would require a universal fallback artifact | 2026-07-21 |
| [Wasm exception handling](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/Exception_handling)                                         | Required where `-fwasm-exceptions` is emitted          | OCJS and compatible kernels                                    | ✅                      | ✅                               | ✅                                        | ✅                                  | Validate exception feature usage and exercise a thrown Wasm exception            | Fail kernel initialization; never turn the error into empty geometry                                      | 2026-07-21 |
| [Wasm `i64` values](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/Value_types) and JavaScript BigInt                                | Required where `-sWASM_BIGINT` is emitted              | OCJS and compatible glue                                       | ✅                      | ✅                               | ✅                                        | ✅                                  | Instantiate the exact glue/artifact pair and round-trip an `i64`                 | Reject mismatched glue or host                                                                            | 2026-07-21 |
| [`WebAssembly.Memory.grow()`](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow)                       | Required                                               | Artifacts built with `ALLOW_MEMORY_GROWTH`                     | ✅                      | ✅                               | ✅                                        | ✅                                  | Exercise growth and reread `wasmMemory.buffer`                                   | Never cache a view across a call that may grow memory                                                     | 2026-07-21 |
| [Resizable ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/resizable)                      | Conditional utility                                    | JavaScript buffers                                             | ✅                      | ✅                               | ✅                                        | ✅ Node 24                          | Check `buffer.resizable` and perform the required resize                         | Use fixed-length buffers                                                                                  | 2026-07-21 |
| [Growable SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer/growable)            | Conditional                                            | Shared-memory utilities                                        | ⚠ isolation required    | ⚠ isolation required             | ⚠ isolation required                      | ✅ without browser headers          | Check `buffer.growable` and perform the required grow                            | Use a fixed-size SAB or the non-shared path                                                               | 2026-07-21 |
| [Wasm RAB/GSAB integration](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory) (`Memory.toResizableBuffer`) | Watch / prohibited baseline while Node 24 is supported | Emscripten artifacts                                           | ⚠ engine-specific       | ⚠ engine-specific                | ⚠ engine-specific                         | ❌ unavailable at the Node 24 floor | Check the exact `WebAssembly.Memory` method and instantiate the emitted artifact | Keep `GROWABLE_ARRAYBUFFERS` disabled; no semantic polyfill exists                                        | 2026-07-21 |
| [Shared Wasm memory](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory) and threads                  | Conditional optimized artifact                         | OCJS/Replicad multi builds                                     | ⚠ isolation required    | ⚠ isolation required             | ⚠ isolation required                      | ✅                                  | Require a maximum, SAB, isolation, and a successful pthread artifact load        | Select the qualified non-threaded artifact                                                                | 2026-07-21 |
| [Streaming compilation](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiateStreaming_static)             | Conditional optimization                               | Browser Wasm delivery                                          | ⚠ correct MIME required | ⚠ correct MIME required          | ⚠ correct MIME required                   | N/A                                 | Inspect `Content-Type` and instantiate the response                              | Compile fetched bytes when MIME/streaming is unavailable; this cannot recover unsupported opcodes         | 2026-07-21 |
| [JSPI (`WebAssembly.Suspending`)](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Suspending)                    | Conditional optimization                               | Async Wasm integrations                                        | ⚠ capability-dependent  | ⚠ Firefox 153 beta evidence only | ⚠ Safari 27 beta evidence only            | ⚠ host-version-dependent            | Check `WebAssembly.Suspending` and run the async boundary                        | Retain Asyncify or the existing async implementation                                                      | 2026-07-21 |
| [Memory64](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory)                                        | Watch / prohibited baseline                            | Universal artifacts                                            | ⚠ engine-dependent      | ⚠ engine-dependent               | ⚠ engine-dependent                        | ⚠ host-version-dependent            | Static artifact feature inspection                                               | Do not emit 64-bit memories                                                                               | 2026-07-21 |
| [Multiple memories](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory)                                      | Watch / prohibited baseline                            | Universal artifacts                                            | ⚠ engine-dependent      | ⚠ engine-dependent               | ⚠ engine-dependent                        | ⚠ host-version-dependent            | Static artifact feature inspection                                               | Emit one memory                                                                                           | 2026-07-21 |

Partial proposal support is not proposal-wide support. Safari's `relaxed_laneselect` implementation does not make arbitrary `-mrelaxed-simd` output safe.

### Isolation, Workers, and Response Delivery

| Feature                                                                                                                          | Tau tier                                      | Surfaces                                           | Chromium              | Firefox               | Safari / WebKit                                                  | Node / Electron                         | Probe or proof                                              | Fallback / failure                                                         | Verified   |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- | --------------------- | --------------------- | ---------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| [Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)                                         | Hosted requirement                            | Browser APIs marked secure-context-only            | ✅ HTTPS/localhost    | ✅ HTTPS/localhost    | ✅ HTTPS/localhost                                               | N/A                                     | Check `isSecureContext` and exercise the API                | Hide or reject the capability with an actionable error                     | 2026-07-21 |
| [Dedicated module workers](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)                                       | Required                                      | Browser runtime and file manager                   | ✅                    | ✅                    | ✅                                                               | Electron renderer uses browser contract | Spawn the production worker URL and complete its handshake  | Typed worker initialization failure                                        | 2026-07-21 |
| [SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)                                                    | Conditional                                   | Future shared browser services                     | ⚠ newly Baseline 2026 | ⚠ newly Baseline 2026 | ⚠ newly Baseline 2026                                            | N/A                                     | Construct and exchange a message on a `MessagePort`         | Dedicated worker or per-context service                                    | 2026-07-21 |
| [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)          | Conditional                                   | Shared pools, abort channel, pthread Wasm          | ⚠ isolation required  | ⚠ isolation required  | ⚠ isolation required                                             | ✅                                      | Check constructor plus `crossOriginIsolated`, then allocate | SAB-less transport or non-threaded artifact where the surface provides one | 2026-07-21 |
| [`crossOriginIsolated`](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)                             | Hosted requirement for shared-memory paths    | Browser documents and workers                      | ⚠ response contract   | ⚠ response contract   | ⚠ response contract                                              | N/A                                     | Inspect the property in the production document and worker  | Disable the shared-memory path or fail with the isolation reason           | 2026-07-21 |
| [COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)                           | Hosted requirement for shared-memory paths    | Top-level document                                 | ✅ `same-origin`      | ✅ `same-origin`      | ✅ `same-origin`                                                 | N/A                                     | Inspect the final document response                         | Shared-memory path remains unavailable                                     | 2026-07-21 |
| [COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)                         | Hosted requirement for shared-memory paths    | Top-level document                                 | ✅ `require-corp`     | ✅ `require-corp`     | ✅ `require-corp`; `credentialless` is not the universal profile | N/A                                     | Inspect the final document response and isolation state     | Use `require-corp`; otherwise shared-memory paths remain unavailable       | 2026-07-21 |
| [CORP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy)                         | Hosted requirement under COEP                 | Workers, Wasm, fonts, static assets, API responses | ⚠ response graph      | ⚠ response graph      | ⚠ explicit labels required in Tau's tested path                  | N/A                                     | Inspect every dependent production response                 | Correct the response metadata; do not retry forever                        | 2026-07-21 |
| [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)                                                            | Hosted requirement for cross-origin resources | CDN/API/worker/Wasm responses                      | ⚠ origin-dependent    | ⚠ origin-dependent    | ⚠ origin-dependent                                               | N/A                                     | Make the production request from the embedding origin       | Serve same-origin or configure explicit CORS                               | 2026-07-21 |
| [CSP `wasm-unsafe-eval`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src) | Hosted requirement when CSP is enabled        | Browser Wasm compilation                           | ⚠ CSP-dependent       | ⚠ CSP-dependent       | ⚠ CSP-dependent                                                  | N/A                                     | Compile Wasm under the production CSP                       | Add the narrow token; do not require broader `unsafe-eval` solely for Wasm | 2026-07-21 |
| [CSP `worker-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src)       | Hosted requirement when CSP is enabled        | Worker entry and blob worker URLs                  | ⚠ CSP-dependent       | ⚠ CSP-dependent       | ⚠ CSP-dependent                                                  | N/A                                     | Spawn each production worker under the production CSP       | Allow the exact worker sources or fail initialization                      | 2026-07-21 |
| [Wasm MIME and loading](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Loading_and_running)                         | Hosted requirement for streaming              | Wasm assets                                        | ⚠ `application/wasm`  | ⚠ `application/wasm`  | ⚠ `application/wasm`                                             | Host filesystem/package loading         | Inspect the response and instantiate it                     | Byte-buffer compilation only for MIME/streaming failure                    | 2026-07-21 |
| [Structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)                  | Required for declared wire values             | Browser workers                                    | ✅                    | ✅                    | ✅                                                               | ✅ relevant host channels               | Round-trip each declared value through the real channel     | Return a typed serialization error                                         | 2026-07-21 |
| [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)                    | Conditional optimization                      | Worker binary and canvas paths                     | ⚠ type-dependent      | ⚠ type-dependent      | ⚠ type-dependent                                                 | ⚠ channel-dependent                     | Transfer the exact value and assert ownership semantics     | Structured clone or copy where allowed                                     | 2026-07-21 |

### Filesystems, Storage, and Coordination

| Feature                                                                                                                                                                                 | Tau tier                            | Surfaces                                  | Chromium                         | Firefox                       | Safari / WebKit               | Node / Electron                            | Probe or proof                                                        | Fallback / failure                                                                                       | Verified   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------- | -------------------------------- | ----------------------------- | ----------------------------- | ------------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)                                                                                                             | Required                            | DirectIDB workspaces and browser metadata | ✅                               | ✅                            | ✅                            | Electron renderer ✅                       | Open, transact, commit, and reread                                    | Typed provider failure; never report empty success                                                       | 2026-07-21 |
| [OPFS / `StorageManager.getDirectory()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory)                                                                  | Required only for the OPFS provider | Browser-managed OPFS workspaces           | ✅                               | ✅                            | ✅ with operational caveats   | Electron renderer follows embedded engine  | Obtain the root and perform the required operation                    | Typed OPFS unavailability or DOMException; never substitute another provider                             | 2026-07-21 |
| [OPFS synchronous access handles](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemSyncAccessHandle)                                                                          | Conditional worker optimization     | OPFS worker I/O                           | ⚠ worker-only                    | ⚠ worker-only                 | ⚠ worker-only                 | N/A                                        | Create the handle inside the owning dedicated worker                  | Async OPFS operations or typed `NotSupportedError`                                                       | 2026-07-21 |
| [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)                                                                                              | Conditional user-visible provider   | WebAccess workspaces                      | ✅                               | ❌ normal release             | ❌                            | Electron may use a native provider instead | Probe the required picker/handle operation                            | Hide or reject WebAccess with `WorkspaceDirectoryRequiredError`; never substitute storage                | 2026-07-21 |
| [`showDirectoryPicker()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)                                                                                  | Conditional                         | WebAccess selection/import                | ✅ secure context and activation | ❌ normal release             | ❌                            | Electron uses its host picker              | Check the method and invoke it from transient user activation         | Typed unsupported, aborted, or permission outcome                                                        | 2026-07-21 |
| [`FileSystemHandle.queryPermission()`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/queryPermission)                                                               | Conditional                         | Persisted WebAccess handles               | ✅                               | ❌ normal release             | ❌                            | N/A                                        | Query and, when appropriate, request the required mode                | Surface `prompt`/`denied`; never assume a persisted handle is authorized                                 | 2026-07-21 |
| [Handle structured cloning](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)                                                                | Conditional per provider            | Handle persistence and worker transport   | ⚠ supported handle types         | ❌ without File System Access | ❌ without File System Access | N/A                                        | Round-trip through IndexedDB and the actual worker channel separately | Keep the handle on the owning side or reject that provider route                                         | 2026-07-21 |
| [FileSystemObserver](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver)                                                                                               | Conditional optimization            | Filesystem watch plane                    | ⚠ experimental                   | ❌                            | ❌                            | Native watchers are separate               | Check the constructor and successfully observe the selected backend   | Existing visibility-aware polling and mutation invalidation                                              | 2026-07-21 |
| [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)                                                                                                             | Conditional coordination            | Cross-tab browser writes                  | ✅                               | ✅                            | ✅                            | N/A                                        | Acquire the named lock around the real operation                      | Execute through the existing authority without the optional lock; never treat locks as storage authority | 2026-07-21 |
| [BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)                                                                                                   | Conditional notification            | Cross-tab invalidation                    | ✅                               | ✅                            | ✅                            | ✅ where exposed                           | Exchange an invalidation between contexts                             | Single-context operation; never treat notifications as a transaction log                                 | 2026-07-21 |
| [Storage estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) and [persistence](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) | Conditional advisory capability     | Browser storage UX                        | ⚠ policy-dependent               | ⚠ policy-dependent            | ⚠ policy-dependent            | N/A                                        | Invoke and inspect the returned decision                              | Continue with explicit quota/error handling; estimates are not durability guarantees                     | 2026-07-21 |

API presence is weaker than operational availability. Private browsing, quota pressure, permissions, user dismissal, and missing transient activation must remain distinct typed outcomes.

### Graphics and Rendering

| Feature                                                                                                                                                                                       | Tau tier                              | Surfaces                           | Chromium                   | Firefox                    | Safari / WebKit              | Node / Electron                                | Probe or proof                                                | Fallback / failure                                                                                 | Verified   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- | -------------------------- | -------------------------- | ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| [WebGL2](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)                                                                                                             | Required public baseline              | Interactive viewers                | ✅                         | ✅                         | ✅                           | Electron renderer ✅                           | Create the production context and render a known scene        | Typed renderer initialization failure                                                              | 2026-07-21 |
| [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)                                                                                                                         | Conditional internal path             | Internal/e2e viewer qualification  | ⚠ adapter/device-dependent | ⚠ adapter/device-dependent | ⚠ adapter/device-dependent   | Electron depends on its embedded engine/device | Request an adapter and device, then render the parity fixture | WebGL2                                                                                             | 2026-07-21 |
| [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)                                                                                                           | Conditional                           | Shared docs and headless rendering | ⚠ subfeature-dependent     | ⚠ subfeature-dependent     | ⚠ subfeature-dependent       | Electron renderer follows embedded engine      | Construct and exercise the required context                   | Surface-specific main-thread or ordinary-canvas path                                               | 2026-07-21 |
| [OffscreenCanvas WebGL](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/getContext)                                                                                          | Conditional                           | Shared/headless WebGL rendering    | ⚠ context-dependent        | ⚠ context-dependent        | ⚠ context-dependent          | Electron renderer follows embedded engine      | Require a non-null WebGL context and render                   | Main-thread WebGL or typed renderer failure                                                        | 2026-07-21 |
| [OffscreenCanvas WebGPU context](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas/getContext)                                                                                 | Conditional sub-capability            | Shared/headless WebGPU rendering   | ⚠                          | ⚠                          | ⚠                            | Electron renderer follows embedded engine      | Probe `getContext('webgpu')` separately from `navigator.gpu`  | OffscreenCanvas WebGL                                                                              | 2026-07-21 |
| [ImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap) and [`ImageBitmapRenderingContext`](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmapRenderingContext) | Conditional presentation optimization | Shared renderer output             | ✅                         | ✅                         | ✅ with context differences  | Electron renderer ✅                           | Transfer a rendered bitmap into the destination canvas        | Ordinary canvas draw/presentation path or typed failure                                            | 2026-07-21 |
| [WebXR Device API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)                                                                                                         | Watch / prohibited baseline           | Future immersive AR/VR             | ⚠ device-dependent         | ⚠ limited                  | ❌ for Tau's Quick Look path | N/A                                            | Request the required session on a real device                 | Keep non-AR viewing/export; Quick Look remains a separate capability                               | 2026-07-21 |
| [SVG `<use>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/use) and [SMIL `<animate>`](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/animate)      | Required portable pattern             | UI icons and path morphing         | ✅ same-document/SMIL      | ✅ same-document/SMIL      | ✅ same-document/SMIL        | Electron renderer ✅                           | Render the production SVG in real engines                     | Use same-document symbols and SMIL; avoid the known external filtered-use and CSS path-morph paths | 2026-07-21 |

### Runtime Hosts and Package Delivery

This Tau-owned table records product support rather than MDN browser support.

| Surface                    | Source of truth                                                        | Support contract                                                                         | Proof                                                                                   | Failure/fallback                                                     | Verified   |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| Node                       | Root and package `engines.node`                                        | `>=24.0.0`; universal output must not require hidden V8 flags                            | Package tests at the minimum Node line                                                  | Reject unsupported Node before relying on a newer engine feature     | 2026-07-21 |
| Electron                   | Runtime peer range and first-party example                             | `@taucad/runtime` peer `>=30.0.0`; current examples use `^36.9.5`                        | Package and example smoke tests on supported Electron                                   | Report the unsupported peer/host; do not assume Chrome-stable parity | 2026-07-21 |
| Browser ESM                | Package exports and npm policy                                         | Import is side-effect-safe before optional browser globals are probed                    | Import smoke tests with optional globals absent                                         | Typed capability failure after import                                | 2026-07-21 |
| Workers                    | Literal `new URL(..., import.meta.url)` or explicit consumer-owned URL | Bundlers must see the worker entry; no opaque runtime URL guessing                       | Production bundle plus worker handshake                                                 | Framework adapter or explicit consumer URL                           | 2026-07-21 |
| Wasm assets                | External emitted assets                                                | Correct URL, MIME, CORS/CORP, CSP, and caching; no large base64 JS literals              | Inspect the production bundle and response                                              | Correct asset delivery; do not hide a parse/load failure             | 2026-07-21 |
| Electron / electron-vite   | Runtime peers and independently resolved consumers                     | electron-vite 5/Vite 7 and electron-vite 6 beta/Vite 8                                   | Both production builds, resolved externals, artifacts, and live utility-process renders | Release-blocking failure                                             | 2026-08-04 |
| React Router / Vite        | Independently resolved first-party consumers                           | React Router 7/Vite 7 and React Router 8/Vite 8                                          | Both production builds, emitted assets, worker startup, and live geometry               | Release-blocking failure                                             | 2026-08-04 |
| Next.js                    | Published `withTauRuntime()` integration contract                      | Next.js 15 through Webpack and Next.js 16 through Turbopack                              | Both production builds, emitted assets, worker startup, and live geometry               | Release-blocking failure                                             | 2026-08-04 |
| Other third-party bundlers | Published integration contract                                         | Supported only through a documented/tested adapter with app-owned worker and asset paths | Published-package consumer smoke tests                                                  | Documented explicit configuration or unsupported integration         | 2026-08-04 |

Published subpaths that target different runtimes must continue to satisfy the environment-matrix rule in `docs/policy/npm-policy.md`.

### Known Engine Deviations

| Deviation                                                                                    | Policy consequence                                                                     | Evidence                                                                                                                                         | Verified   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Safari stable implements only part of Relaxed SIMD                                           | Never emit relaxed opcodes in the universal Wasm artifact                              | `docs/research/safari-wasm-relaxed-simd-incompatibility.md`; [WebKit Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) | 2026-07-21 |
| Safari rejected `COEP: credentialless` in Tau's tested isolation path                        | Use `require-corp` for the portable hosted profile and label dependent responses       | `docs/research/safari-cross-origin-isolation.md`                                                                                                 | 2026-07-21 |
| Safari enforces COEP/CORP across workers and assets more visibly than Chromium's tested path | Test the exact production response graph in branded Safari                             | `docs/research/safari-localhost-build-coep-worker-loading.md`                                                                                    | 2026-07-21 |
| Safari blob workers can resolve relative sourcemaps through a malformed null origin          | Do not ship relative `sourceMappingURL` values in blob-worker payloads                 | `docs/research/safari-blob-worker-sourcemap-null-origin.md`                                                                                      | 2026-07-21 |
| Safari/Firefox differ on CSS path morphing and external filtered SVG `<use>`                 | Use SMIL path animation and same-document symbols                                      | `docs/research/safari-svg-rendering-compatibility.md`                                                                                            | 2026-07-21 |
| Chromium File System Access can create `.crswap` artifacts                                   | Filter them at the WebAccess provider boundary                                         | `docs/research/webaccess-crswap-leak-and-listing-race.md`                                                                                        | 2026-07-21 |
| Playwright WebKit is not branded Safari                                                      | A WebKit automation pass cannot satisfy a Safari release gate                          | `docs/research/revision-git-engine-phase0-supplement.md`; [Playwright browsers](https://playwright.dev/docs/browsers)                            | 2026-07-21 |
| OPFS can fail despite API presence                                                           | Perform the required operation and surface its DOMException as a typed provider result | [MDN `StorageManager.getDirectory()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory); Tau OPFS investigations     | 2026-07-21 |
| Apple Quick Look is not WebXR                                                                | Detect the `rel="ar"` capability and retain non-AR viewing/export                      | [Apple Quick Look](https://developer.apple.com/augmented-reality/quick-look/)                                                                    | 2026-07-21 |

## Rules

### 1. Define Support by Capability and Surface

Define support by the capability Tau needs on a named surface. Never dispatch solely from a user-agent allowlist.

### 2. Keep Universal Artifacts Inside the Supported Intersection

Emit only features supported by every required host for that artifact, including the Node floor and branded Safari stable.

### 3. Separate the Three Buffer-Growth Contracts

Treat JavaScript RAB/GSAB, `WebAssembly.Memory.grow()`, and Wasm RAB/GSAB integration as independent capabilities.

### 4. Validate the Complete Emitted Wasm Feature Set

Inspect the artifact's actual instructions and APIs. Never infer proposal support from one implemented instruction.

### 5. Give Every Conditional Capability a Fallback

Name and test the fallback or typed failure before classifying a feature as Conditional.

### 6. Treat Deployment as Part of Compatibility

Validate headers, MIME, CORS/CORP, CSP, worker URLs, and every dependent response alongside JavaScript APIs.

### 7. Guard Optional Globals at Import Boundaries

Use `typeof` or equivalent guarded access before evaluating optional browser constructors. Package import must remain safe.

### 8. Preserve Failure Semantics

Never convert capability failure into empty success or silently substitute a user-selected persistence provider.

### 9. Keep Filesystem Classes Distinct

Keep browser-managed storage, user-visible filesystem access, and native host filesystems as separate providers and authority contracts.

### 10. Probe the Required Operation

Create the adapter, device, context, handle, or storage root when constructor presence does not prove operational availability.

### 11. Qualify Real Browser Products

Test current stable Chromium, Firefox, and branded Safari where applicable. Never label Playwright WebKit as Safari evidence.

### 12. Test the Declared Host Floor

Run Node compatibility checks at the minimum declared `engines.node` and test the supported Electron floor when affected.

### 13. Link the Canonical Platform Reference

Link every feature row to MDN. When no dedicated MDN page exists, link the nearest MDN overview plus the primary specification or official vendor/host source.

### 14. Date Every Evidence Review

Update the row's ISO verification date whenever support evidence, a Tau tier, or a fallback changes.

### 15. Remove Workarounds Only After Equivalent Qualification

Remove a workaround or fallback only after its replacement passes the same artifact, host, browser, deployment, and failure-path gates.

## Promotion and Demotion

Promote a capability only when all applicable evidence exists:

1. Recheck MDN Browser Compatibility Data, the standard specification, or official host release notes.
2. Statically validate the exact features emitted by universal Wasm output.
3. Exercise the required operation rather than constructor presence alone.
4. Pass first-party browser tests in current Chromium and Firefox.
5. Pass a branded Safari release when the capability affects WebKit.
6. Pass Node at the declared minimum and the supported Electron floor when applicable.
7. Test the fallback before retaining a Conditional classification.
8. Validate production-like COOP/COEP/CORP, MIME, CORS, and CSP responses when relevant.
9. Update the policy row, verification date, specialized policy, regression evidence, and user-facing failure behavior atomically.

Demote with the same atomicity: change the matrix, restore or add the fallback, add regression evidence, and document the observed failure. Never leave the matrix optimistic while implementation silently routes around it.

## Maintenance

- Review a row when its implementation, fallback, build flags, package floor, or upstream support evidence changes.
- Recheck high-risk rows before a release that changes Wasm toolchains, Node/Electron floors, worker delivery, cross-origin headers, filesystem providers, or graphics backends.
- Keep historical incidents in research documents; keep only the durable contract and current evidence date here.
- Treat version numbers as evidence for humans, not runtime dispatch rules.
- Change specialized policies in the same patch when their local contract changes; do not duplicate this matrix in them.
- Require branded Safari evidence for Safari claims even when automated WebKit coverage passes.

## Summary Checklist

- [ ] The feature is in scope because Tau requires, emits, uses, or has incident evidence for it.
- [ ] The row names a Tau tier and every affected surface.
- [ ] Browser evidence distinguishes Safari stable, beta Safari, and Playwright WebKit.
- [ ] The probe proves the required operation or artifact, not only constructor presence.
- [ ] Every Conditional row names a fallback or typed failure.
- [ ] Universal Wasm works on Node 24 and branded Safari stable.
- [ ] Hosted paths verify the full response graph.
- [ ] The MDN link and ISO verification date are current.

## References

- [MDN WebAssembly reference](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference)
- [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [MDN Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [MDN cross-origin isolation](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated)
- [MDN WebGL2](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext)
- [MDN WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Safari release notes](https://developer.apple.com/documentation/safari-release-notes)
