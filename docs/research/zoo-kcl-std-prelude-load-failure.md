---
title: 'Zoo KCL std::prelude / std::types load failure'
description: 'Root cause investigation for the recurring "Error loading imported file (std::prelude / std::types)" semantic error in the Tau Zoo kernel after the 0.1.148 rebuild.'
status: active
created: '2026-05-04'
updated: '2026-05-04'
category: investigation
related:
  - docs/research/zoo-kcl-148-integration-audit.md
  - docs/research/zoo-kcl-148-integration-gaps.md
  - docs/research/kcl-feature-surface-gaps.md
  - docs/policy/kcl-engine-bridge-policy.md
---

# Zoo KCL std::prelude / std::types load failure

Investigation into why `Context.execute` and `Context.executeMock` (kcl-wasm-lib 0.1.148) surface a cascading semantic error claiming the embedded standard-library modules cannot be loaded, even though the modules are baked into the WASM binary at compile time.

## Executive Summary

The error string the user is seeing — `"Error loading imported file (std::prelude). Open it to view more details.\n  Error loading imported file (std::types). Open it to view more details.\n  "` — cannot be produced by a host-side filesystem failure: `read_std()` in `kcl-lib/src/modules.rs` resolves `std::prelude` and `std::types` from `include_str!` constants embedded in the WASM, never via `FileSystemManager.readFile`. The trailing whitespace after `(std::types)` confirms the deepest error message is **the empty string**, which means an inner failure inside `exec_module_body(std::types)` is bubbling up through two layers of `exec_module_from_ast` wrap calls.

**Finding 12 (2026-05-04):** UI `[kcl-debug]` / `[kcl-trace]` shows the leaf failure is the headless engine rejecting `set_order_independent_transparency` (`success:false`, `errors:[]`) after implicit SSAO-on from empty `"{}"` settings; kcl-lib queues OIT only when `enable_ssao` is true (`send_clear_scene`). **Mitigation (landed, UI verification pending):** [`kcl-headless-settings.ts`](../../packages/runtime/src/kernels/zoo/kcl-headless-settings.ts) forces `settings.modeling.enable_ssao: false` on every WASM execute/export/cache-bust path via `buildKclSettingsJson`.

The investigation found three architectural deltas between Tau and `taucad/zoo-modeling-app` that explain why this regression slipped through:

1. **Our integration tests stub `Context.execute`/`Context.executeMock`** (`vi.fn(async () => ({...}))`) — no test ever exercises the real WASM call path, so the 0.1.148 rebuild ([cd0034a7e](https://github.com/taucad/modeling-app/commit/cd0034a7e)) shipped without any TDD coverage of `eval_prelude`.
2. **Tau's parameter cache hit (`Parameter cache hit for 1c04934c`) is _not_ evidence that `executeMock` works on 0.1.148** — the cache predates the WASM rebuild, so both `executeMock` and `execute` may currently be broken even though parameter extraction "succeeds" by reading the stale cache entry.
3. **Tau previously passed `JSON.stringify(settings ?? {})` as `"{}"`, letting WASM defaults imply SSAO on** — unlike modeling-app, which sets modeling settings from TOML/UI. That queued OIT against a WebSocket-only session without the streamed viewport priming that interactive hosts use; the engine returned an empty-error failure that the semantic-wrap layer surfaced as the `std::prelude` / `std::types` string.

A fourth delta — Tau bypasses `Context.open_project` / `add_file` / `update_file` / `switch_file` — is **not** a candidate cause. Source-level inspection (Finding 10) confirms `ProjectManager` is a standalone `lazy_static` state container consumed only by sketch-block editing APIs (`new_sketch`, `add_segment`, `restore_sketch_checkpoint`, etc.). `Context.execute` and module loading do **not** read from `ProjectManager`. Multi-file Zoo geometries already work via the host `FileSystemManager.readFile` path that kcl-lib uses for `ImportPath::Kcl`.

Recommended next steps: **(a)** confirm the failing project renders in the Tau UI with headless settings merged; **(b)** keep extending real WASM / bridge integration coverage (R1) so future kcl-wasm-lib bumps cannot regress the execute path silently.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [Diagrams](#diagrams)
- [References](#references)
- [Appendix](#appendix)

## Problem Statement

A bottle / ball-bearing sample loaded into a Tau project produces a recurring semantic error every time the kernel worker runs `createGeometry` (and likely also `getParameters`):

```json
{
  "error": {
    "kind": "semantic",
    "details": {
      "sourceRanges": [[0, 0, 0]],
      "backtrace": [{ "sourceRange": [0, 0, 0], "fnName": null }],
      "msg": "Error loading imported file (std::prelude). Open it to view more details.\n  Error loading imported file (std::types). Open it to view more details.\n  "
    }
  },
  "nonFatal": [],
  "variables": {},
  "operations": [],
  "artifactCommands": [],
  "artifactGraph": { "map": {}, "itemCount": 0 },
  "sceneGraph": null,
  "filenames": {},
  "sourceFiles": {},
  "defaultPlanes": null
}
```

The surrounding worker logs:

```text
[Kernel:worker] Parameter cache hit for 078f890b
[Kernel:worker] getParameters completed {ms: 305.2849999964237}
[Kernel:worker] Cache miss for 4719503e: ENOENT '/projects/proj_X0YqCCPV9KCrEaYLi56uS/.tau/cache/geometry/4719503e.bin'
[Kernel:worker] {"error":{"kind":"semantic", ...}}
[Kernel:worker] createGeometry completed {ms: 1351.235}
```

Two important observations from the logs:

- The **parameter cache HITS** (no actual `executeMock` happened in this turn).
- The **geometry cache MISSES** → `createGeometry` runs → fails with the std-load semantic error.

So in the captured trace only `executeProgram` (the engine path) demonstrably runs — but the same wrap pattern appears in `getParameters` traces in earlier sessions too. We cannot conclude from this trace alone that `executeMock` currently works on 0.1.148.

## Methodology

| Step | Source examined                                                          | Purpose                                                                     |
| ---- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | `repos/zoo-modeling-app/rust/kcl-lib/src/modules.rs`                     | Confirm `std::prelude`/`std::types` resolution path                         |
| 2    | `repos/zoo-modeling-app/rust/kcl-lib/src/execution/exec_ast.rs`          | Locate the wrap site and the call chain                                     |
| 3    | `repos/zoo-modeling-app/rust/kcl-lib/src/execution/mod.rs`               | Trace `run_with_caching` → `eval_prelude`                                   |
| 4    | `repos/zoo-modeling-app/rust/kcl-wasm-lib/src/context.rs`                | Inspect `Context::execute` / `execute_mock` entry points                    |
| 5    | `repos/zoo-modeling-app/rust/kcl-lib/src/engine/conn_wasm.rs`            | Inspect the wasm-bindgen externs that JS must satisfy                       |
| 6    | `repos/zoo-modeling-app/rust/kcl-lib/src/fs/wasm.rs`                     | Inspect the FS extern surface (`readFile`, `exists`, `getAllFiles`)         |
| 7    | `repos/zoo-modeling-app/src/lib/rustContext.ts`                          | Compare the JS-side caller pattern (lifecycle, settings, init)              |
| 8    | `repos/zoo-modeling-app/src/unitTestUtils.ts`                            | Verify how upstream unit tests bootstrap a working `Context`                |
| 9    | `node_modules/@taucad/kcl-wasm-lib/kcl_wasm_lib.js` (built artifact)     | Confirm 0.1.148 wasm-bindgen JS imports the expected externs                |
| 10   | `node_modules/@taucad/kcl-wasm-lib/kcl_wasm_lib_bg.wasm`                 | `strings                                                                    | rg 'export import \* from \"std::types\"'` confirms the std .kcl bytes are embedded |
| 11   | `packages/runtime/src/kernels/zoo/*.ts`                                  | Inventory Tau's integration choices vs upstream                             |
| 12   | `packages/runtime/src/kernels/zoo/kcl-bottle-sample.integration.test.ts` | Audit whether the integration test actually exercises the failing call path |

All commands used `Read`, `Grep`, and `Glob` — no `rg`/`find` — per workspace conventions.

## Findings

### Finding 1: `std::prelude` / `std::types` are baked into the WASM via `include_str!`

`kcl-lib/src/modules.rs` (lines 85–106) defines `read_std()` as a static dispatch over a hard-coded list of `include_str!("../std/<name>.kcl")` constants. `prelude` and `types` are both in the list:

```17:39:repos/zoo-modeling-app/rust/kcl-lib/src/modules.rs
pub(crate) fn read_std(mod_name: &str) -> Option<&'static str> {
    match mod_name {
        "prelude" => Some(include_str!("../std/prelude.kcl")),
        "gdt" => Some(include_str!("../std/gdt.kcl")),
        "math" => Some(include_str!("../std/math.kcl")),
        "runtime" => Some(include_str!("../std/runtime.kcl")),
        "sketch" => Some(include_str!("../std/sketch.kcl")),
        "solver" => Some(include_str!("../std/solver.kcl")),
        "turns" => Some(include_str!("../std/turns.kcl")),
        "types" => Some(include_str!("../std/types.kcl")),
        ...
```

`ModulePath::source()` uses `read_std()` for any `Std` variant and only consults `fs.read_to_string` for `Local` variants:

```182:201:repos/zoo-modeling-app/rust/kcl-lib/src/modules.rs
pub(crate) async fn source(&self, fs: &FileManager, source_range: SourceRange) -> Result<ModuleSource, KclError> {
    match self {
        ModulePath::Local { value: p, .. } => Ok(ModuleSource {
            source: fs.read_to_string(p, source_range).await?,
            path: self.clone(),
        }),
        ModulePath::Std { value: name } => Ok(ModuleSource {
            source: read_std(name)
                .ok_or_else(|| {
                    KclError::new_semantic(KclErrorDetails::new(
                        format!("Cannot find standard library module to import: std::{name}."),
                        vec![source_range],
                    ))
                })
                .map(str::to_owned)?,
            path: self.clone(),
        }),
        ModulePath::Main => unreachable!(),
    }
}
```

We verified the bytes are present in our installed 0.1.148:

```bash
strings node_modules/@taucad/kcl-wasm-lib/kcl_wasm_lib_bg.wasm \
  | rg 'export import \* from "std::types"'
# → match
```

**Conclusion**: the failure cannot be `FileSystemManager.readFile('std::prelude')` returning ENOENT. Our `FileSystemManager` is structurally irrelevant to `std::*` loading — the host filesystem is only consulted for `ImportPath::Kcl` / `ImportPath::Foreign`.

### Finding 2: The error string is the unique signature of the wrap site at `exec_ast.rs:1000`

`exec_module_from_ast` rewraps any non-cycle, non-engine error as a semantic error with a fixed prefix:

```998:1009:repos/zoo-modeling-app/rust/kcl-lib/src/execution/exec_ast.rs
                _ => {
                    // TODO would be great to have line/column for the underlying error here
                    KclError::new_semantic(KclErrorDetails::new(
                        format!(
                            "Error loading imported file ({path}). Open it to view more details.\n  {}",
                            err.message()
                        ),
                        vec![source_range],
                    ))
                }
```

Combined with the inner-most empty `err.message()`, the observed string `… (std::prelude). Open it…\n  … (std::types). Open it…\n  ` decomposes uniquely as:

| Layer           | `path`         | `err.message()`           |
| --------------- | -------------- | ------------------------- |
| Outer (prelude) | `std::prelude` | the wrapped types message |
| Middle (types)  | `std::types`   | `""` (empty)              |

The middle layer fires inside `exec_module_for_items(std::types)` invoked from inside `eval_prelude` (via `open_module` then `exec_module_from_ast`). The deepest error happens **during execution of `types.kcl`'s body** — not during parse, not during `read_std`, and not during host FS access.

### Finding 3: `eval_prelude` is auto-injected on every `run_concurrent`, including the cold path of `run_with_caching`

`run_with_caching` (the `execute` entry) takes a None-cache branch on first call:

```1373:1385:repos/zoo-modeling-app/rust/kcl-lib/src/execution/mod.rs
            None => {
                let mut exec_state = ExecState::new(self);
                self.send_clear_scene(&mut exec_state, Default::default())
                    .await
                    .map_err(KclErrorWithOutputs::no_outputs)?;

                let result = self
                    .run_concurrent(&program, &mut exec_state, None, PreserveMem::Normal)
                    .await;

                (program, exec_state, result)
            }
```

`run_concurrent` always calls `eval_prelude` first:

```1442:1445:repos/zoo-modeling-app/rust/kcl-lib/src/execution/mod.rs
        // Run the prelude to set up the engine.
        self.eval_prelude(exec_state, SourceRange::synthetic())
            .await
            .map_err(KclErrorWithOutputs::no_outputs)?;
```

`eval_prelude` is the entry to the `open_module(std::prelude) → exec_module_for_items(std::prelude)` chain that produces the doubled wrap:

```1881:1905:repos/zoo-modeling-app/rust/kcl-lib/src/execution/mod.rs
async fn eval_prelude(&self, exec_state: &mut ExecState, source_range: SourceRange) -> Result<(), KclError> {
    if exec_state.stack().memory.requires_std() {
        ...
        let path = vec!["std".to_owned(), "prelude".to_owned()];
        let resolved_path = ModulePath::from_std_import_path(&path)?;
        let id = self
            .open_module(&ImportPath::Std { path }, &[], &resolved_path, exec_state, source_range)
            .await?;
        let (module_memory, _) = self.exec_module_for_items(id, exec_state, source_range).await?;
        exec_state.mut_stack().memory.set_std(module_memory);
        ...
    }
    Ok(())
}
```

So the error path is the same for `executeMock` (internal Rust mock engine) and `execute` (Zoo bridge). `send_clear_scene` is the only step on the `execute` path that would not run for `executeMock` — and a `send_clear_scene` failure is rendered as `EngineHangup`/`EngineInternal`, both of which the wrap site bypasses (lines 993–997 of `exec_ast.rs`). That rules out "WebSocket not connected" as the leaf cause: an `EngineHangup` would produce a non-wrapped engine error, not the `Error loading imported file …` text.

### Finding 4: the wasm-bindgen JS extern shape we satisfy is identical to upstream

The kcl-wasm-lib JS glue (built with `wasm-bindgen`) imports three engine externs: `fireModelingCommandFromWasm`, `sendModelingCommandFromWasm`, `startNewSession` — and three FS externs: `readFile`, `exists`, `getAllFiles`:

```text
node_modules/@taucad/kcl-wasm-lib/kcl_wasm_lib.js
  1494: __wbg_exists_…           → arg0.exists(...)
  1506: __wbg_fireModelingCommandFromWasm_…
  1532: __wbg_getAllFiles_…
  1697: __wbg_readFile_…
  1741: __wbg_sendModelingCommandFromWasm_…
  1769: __wbg_startNewSession_…
```

Both `MockEngineConnection` (`engine-connection.ts`) and `ZooEngineBridge` (`bridge/zoo-engine-bridge.ts`) implement all three engine methods; `FileSystemManager` (`filesystem-manager.ts`) implements all three FS methods.

`getClientState`, `getOsInfo`, `getWebrtcStats`, `getWriter` belong to other externs (`CoreDumpManager`, `Performance`, `WebRTC`, `WritableStream`) and are **not** required for `Context.execute` to succeed.

**Conclusion**: there is no missing JS surface. The bug is _not_ "WASM tried to call a method that doesn't exist on our adapter".

### Finding 5: Tau's integration test stubs `Context.execute` — the failing path is uncovered

`packages/runtime/src/kernels/zoo/kcl-bottle-sample.integration.test.ts` does **not** call the real WASM `Context.execute`. It assigns a `vi.fn` stub via `Reflect.set`:

```33:50:packages/runtime/src/kernels/zoo/kcl-bottle-sample.integration.test.ts
    Reflect.set(utils, 'isEngineInitialized', true);
    Reflect.set(utils, 'engineManager', {
      bridge: { flushPending: vi.fn().mockResolvedValue(undefined) },
      context: {
        execute: vi.fn(async () => ({
          variables: {
            width: { type: 'Number', value: 12, ty: { type: 'Unknown' } },
            height: { type: 'Number', value: 20, ty: { type: 'Unknown' } },
          },
          ...
        })),
      },
    });
```

Because `context.execute` is a stub, the test never reaches `eval_prelude`. The 0.1.148 rebuild therefore has **zero TDD coverage** for the very code path that fails in production. This is the strongest reason the regression went undetected.

### Finding 6: Tau ignores the `Context` project-lifecycle API; modeling-app uses it on every render

`Context` (kcl-wasm-lib 0.1.148) exposes file-lifecycle methods that mirror an opened editor session:

```kcl_wasm_lib.d.ts
add_file(project: number, file: string): Promise<void>;
open_project(project: number, files: string, open_file: number): Promise<void>;
remove_file(project: number, file: number): Promise<void>;
switch_file(project: number, file: number): Promise<void>;
update_file(project: number, file: number, text: string): Promise<void>;
refresh(project: number): Promise<void>;
```

Modeling-app calls `open_project()` (and gates `update_file`/etc on `hasOpenedProject`) before any modeling work:

```96:107:repos/zoo-modeling-app/src/lib/rustContext.ts
  /** Project lifecycle method for WASM, setting up initial snapshot of project */
  async sendOpenProject(currentFilePath: string | null, kclFiles: ApiFile[]) {
    // TODO: The rust side should really honor having no current file ID
    const currentFileId =
      kclFiles.find((f) => f.path === currentFilePath)?.id || -1
    await this.ctxInstance?.open_project(
      this.projectId,
      JSON.stringify(kclFiles),
      currentFileId
    )
    this.hasOpenedProject = true
  }
```

Tau's `KclUtilities.executeProgram` jumps straight from `parseKcl` → `Context.execute(JSON.stringify(program), path, '{}')` with no project handle, no file id, no `hasOpenedProject` gate.

**This delta is real but is not a candidate cause for the std::prelude failure** — see Finding 10 for the source-level evidence. Modeling-app primes `open_project` because its UI exposes sketch-block editing (drag-segment, undo, constraint edits), which read from `ProjectManager`. `Context.execute` itself does not consume `ProjectManager` state at all.

### Finding 7: Tau does not run an `engineCommandManager.start({...})` analog before `Context.execute`

Modeling-app — even in node unit tests — performs `engineCommandManager.start({ token, width, height, setStreamIsReady, callbackOnUnitTestingConnection, rustContext })` before issuing any execute, both for production (`src/components/ConnectionStream.tsx`, `src/hooks/network/useTryConnect.tsx`) and tests (`src/unitTestUtils.ts:97-121`). This `start` performs WebSocket auth handshake **and** the WebRTC peer connection setup, plus the initial scene-dimension request.

Tau's transport layer only performs the WebSocket auth handshake (`ZooWebSocketTransport.initialize()`), then immediately constructs the `Context`. There is no equivalent of `engineCommandManager.start`'s WebRTC + dimensions priming. Whether kcl-wasm-lib 0.1.148 strictly _requires_ WebRTC for `Context.execute` is unclear from the source — `send_clear_scene` issues a `SceneClear` modeling command via `EngineConnection.send_modeling_cmd`, which our bridge can in principle handle without WebRTC. But the modeling-app pattern strongly suggests this path was never tested without the WebRTC priming.

### Finding 8: `executeMock` "appears" to work because of the parameter cache, not because it actually ran

The user's logs show `Parameter cache hit for 078f890b` and `Parameter cache hit for 1c04934c` — meaning `getParameters` returned a previously cached result. Parameter caching uses a content hash that is independent of the kcl-wasm-lib version. So a cache populated by 0.1.143 (the previous build) will continue to satisfy `getParameters` requests against the same file content **even if 0.1.148's `executeMock` is broken**.

There is no log evidence that `executeMock` has actually executed against 0.1.148 since the rebuild. To confirm whether the bug affects only `execute` or also `executeMock`, the parameter cache must be cleared and `getParameters` re-run.

### Finding 9: The deepest error has an empty message — strong signal of a panic-converted-to-error or `Default::default()`'d `KclErrorDetails`

`KclError::message()` returns `&details.message` for every variant (`errors.rs:703-718`). An empty string surfaces only when:

- `KclErrorDetails::new("", vec![source_range])` is constructed somewhere on the std::types execution path, or
- a `console_error_panic_hook` panic is converted to `KclError::Internal { details: Default::default() }` (where `KclErrorDetails::default()` yields an empty message), or
- a `String::new()` is passed as message in some ts_rs/serde error round-trip.

We could not localise the exact construction site by reading source alone — this requires either a `WASM_LOG=trace` build of kcl-wasm-lib **or** instrumenting the Rust side with `eprintln!`/`tracing::error!` at every `KclError::new_*` call inside `exec_module_body` and `handle_annotations`.

### Finding 10: `ProjectManager` is exclusively a sketch-editing state container — multi-file imports already work via `FileSystemManager`

This finding **eliminates** the previously-suspected R3 (wire `Context.open_project` into `executeProgram`) by tracing the actual data dependencies of every code path that reads from `ProjectManager`.

**`ProjectManager` is a standalone `lazy_static` state container.** `repos/zoo-modeling-app/rust/kcl-lib/src/project/mod.rs:37-52`:

```rust
lazy_static::lazy_static! {
    static ref PROJECT: Arc<RwLock<Option<Project>>> = Default::default();
}

#[derive(Debug, Clone)]
pub struct ProjectManager;

impl ProjectManager {
    async fn with_project<T>(f: impl FnOnce(&Option<Project>) -> T) -> T {
        f(&*PROJECT.read().await)
    }
    // ...
}
```

It is held by `Context` (`self.project_manager`) but is **not connected to module loading, `read_std()`, the `FileManager`, or `ExecutorContext.fs`**.

**Consumers of `ProjectManager` state.** Every wasm-bindgen entry point that delegates to `self.project_manager` is bounded to project introspection or sketch-block editing:

| Entry point                                                                         | Reads ProjectManager? | Used during `Context.execute`? |
| ----------------------------------------------------------------------------------- | --------------------- | ------------------------------ |
| `open_project`, `add_file`, `update_file`, `remove_file`, `switch_file`, `refresh`  | mutates               | no                             |
| `get_project`, `get_file`                                                           | reads                 | no                             |
| `new_sketch`, `add_segment`, `edit_constraint`, `restore_sketch_checkpoint`, `trim` | reads                 | no                             |
| `execute`, `executeMock`, `hack_set_program`                                        | **no**                | yes                            |

**Source confirmation that `Context.execute` skips `ProjectManager`.** Looking at `kcl-wasm-lib/src/context.rs::execute`, the call chain is `create_executor_ctx(settings, Some(path), false)` → `frontend.write().await.engine_execute(&ctx, program)` → `ctx.run_with_caching(program)` → `eval_prelude` (`read_std("prelude")` baked into WASM) → `run_concurrent(program)`. `ProjectManager` is never indexed.

**Multi-file local imports resolve via the host `FileSystemManager`, independent of `ProjectManager`.** When `exec_block` encounters `import "./other.kcl"`, the resolver path is:

1. `open_module(ImportPath::Kcl, ...)` (`repos/zoo-modeling-app/rust/kcl-lib/src/execution/exec_ast.rs:833`).
2. `from_import_path` joins the import string against `settings.project_directory` (set via `with_current_file(path)` from the `path` argument we pass to `Context.execute`) and the importing module's `ModulePath`.
3. `resolved_path.source(&self.fs, source_range).await` → `ModulePath::Local::source` → `fs.read_to_string(p, source_range).await`.
4. `fs` is `Arc<dyn FileManager>` — the trait object backed by **our** JS `FileSystemManager`. There is no involvement of `ProjectManager`.

**Modeling-app sets `projectFsManager.dir` exactly the same way Tau sets `FileSystemManager.basePath`.** `repos/zoo-modeling-app/src/lib/routeLoaders.ts:177` does `projectFsManager.dir = projectPath` once on route load. From that point onward, `Context.execute` resolves local imports through the FS adapter — exactly mirroring our `new ZooFileSystemManager(filesystem, basePath)` construction in `zoo.kernel.ts`.

**Verdict on the deferred multi-file project APIs:**

| Question                                                                                                                              | Answer                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does adopting `Context.open_project` / `add_file` / `update_file` / `switch_file` fix the `std::prelude` / `std::types` load failure? | **No.** That code path does not touch `ProjectManager` or any state mutated by these methods.                                                                                                                                                                                                                   |
| Does our integration lack support for resolving multi-file Zoo geometries (e.g. `import "./bench-parts.kcl"` from `main.kcl`)?        | **No.** Local imports already resolve through `FileSystemManager.readFile` once `KclUtilities.executeProgram` passes the relative entry-file path to `Context.execute`. `getDependencies` in `zoo.kernel.ts` already walks transitive imports via `discoverKclDependencies` for cache-keying and watch-priming. |
| Is anything blocked by deferring `ProjectManager` adoption?                                                                           | Only the sketch-block editing UX (drag-segment, constraint edits, sketch undo/checkpoints, `hack_set_program`). Tau does not currently ship those features; deferral remains correct.                                                                                                                           |

**Where this changes our recommendations:** the original R3 ("wire `open_project` / `update_file` / `switch_file` into `executeProgram`") would have been a wild-goose chase. It is removed from the prioritised list and replaced with R3' (a TDD-style multi-file integration assertion that proves what already works).

### Finding 11: Runtime instrumentation (historical — removed 2026-05-04)

**Status**: removed after prelude investigation. Routine diagnostics: [`packages/runtime/src/kernels/zoo/zoo-logs.ts`](../../packages/runtime/src/kernels/zoo/zoo-logs.ts) (env-gated). The **production fix** for the prelude/OIT failure is [`kcl-headless-settings.ts`](../../packages/runtime/src/kernels/zoo/kcl-headless-settings.ts) (Finding 13).

| Layer                                              | What existed during capture                                                                            | Current state                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| JS (`[kcl-debug]`)                                 | Temporary `zoo-debug-logger` + call sites                                                              | Deleted                             |
| Bridge / transport / FS / session / `KclUtilities` | Verbose entry/exit tracing                                                                             | Deleted                             |
| Panic hook                                         | `console.error` monkey-patch in `KclUtilities`                                                         | Deleted                             |
| Fake engine tests                                  | [`zooTestWrapSocketWithEngineAutoReply`](../../packages/runtime/src/kernels/zoo/zoo-fake-websocket.ts) | Still in Vitest                     |
| Rust (`[kcl-trace]`)                               | `kcl_trace!` in fork `kcl-lib`                                                                         | Removed in fork; clean WASM rebuild |

**R1 revision:** CI now runs **real WASM `executeMockKcl`** for a trivial program (`kcl-bottle-sample.integration.test.ts`) so `eval_prelude` / std loading is exercised without `vi.fn`. Stubbed **`Context.execute`** remains for bridge serialization / `flushPending` tests until a reliable fake-engine harness matches all batch/fire ordering (partially implemented via `zooTestWrapSocketWithEngineAutoReply`).

**Smoke-gun workflow (historical):** Phase 0 cache bust → optional debug tarball + tracing → read `[kcl-trace]` for inner `path` + `inner_msg`. **Current:** use clean `tarballs/taucad-kcl-wasm-lib-0.1.148.tgz` only; no `-debug` sibling.

**WASM relink in Tau:** `pnpm.overrides['@taucad/kcl-wasm-lib']` → `file:tarballs/taucad-kcl-wasm-lib-0.1.148.tgz` (post-cleanup). Then `pnpm install` and `pnpm nx run runtime:copy-assets`.

**Operator capture (2026-05-04):** traced in the Tau UI after debug WASM relink. Kernel order: `eval_prelude` → `set_order_independent_transparency` (`success:false`, `errors:[]`) → `[kcl-trace] exec_module_from_ast semantic wrap: path=std::types inner_msg=""` → prelude wrap. See **Finding 12**.

**Production fix (`phase4-fix`):** **Landed** — Tau merges headless defaults before every `Context.execute` / `executeMock` / `bustCacheAndResetScene` / `export` settings JSON via [`packages/runtime/src/kernels/zoo/kcl-headless-settings.ts`](../../packages/runtime/src/kernels/zoo/kcl-headless-settings.ts): `enable_ssao`, `highlight_edges`, `show_scale_grid`, and `fixed_size_grid` (Finding 13). Empty `"{}"` previously deserialised to upstream defaults where `Option<DefaultTrue>::unwrap_or_default()` turned SSAO on, which queued OIT while the headless engine session never initialised the streamed-view post-processing stack.

### Finding 12: Smoking gun — empty `inner_msg` from engine OIT rejection (not missing std sources)

**Status**: active — fix landed in Tau (`buildKclSettingsJson`); UI re-test pending.

**Evidence** (DevTools, filter `[kcl-debug]` / `[kcl-trace]`):

- `[kcl-trace] eval_prelude: entering std::prelude`
- `[kcl-debug] → ZooEngineBridge.sendModelingCommandFromWasm` … `set_order_independent_transparency` … `enabled:false`
- `[kcl-debug] ws recv text json request_id=… success=false respType=n/a` with payload `{"success":false,"errors":[]}`
- `[kcl-trace] exec_module_from_ast semantic wrap: path=std::types inner_msg=""`
- `[kcl-trace] exec_module_from_ast semantic wrap: path=std::prelude inner_msg="Error loading imported file (std::types). Open it to view more details.\n  "`

**Mechanism**: kcl-lib gates `SetOrderIndependentTransparency` on `ExecutorSettings.enable_ssao` (`repos/zoo-modeling-app/rust/kcl-lib/src/execution/mod.rs` ~1055–1065). Tau passed `"{}"`; WASM `create_executor_ctx` parses that into `Configuration::default()` → modeling `enable_ssao` resolves true via `unwrap_or_default()`, so the OIT command runs and the engine returns failure with no populated `errors` array — producing an empty leaf `KclError` message that the `exec_module_from_ast` wrap surfaces as the familiar std-import cascade.

### Finding 13: Headless viewport toggles — engine wire paths (no GLB effect)

**Status**: active — rationale sourced from kcl-lib; Tau defaults extended in [`kcl-headless-settings.ts`](../../packages/runtime/src/kernels/zoo/kcl-headless-settings.ts).

These flags affect **server-side streamed viewport** state (modeling commands the interactive host uses before video lands in the user's browser). Tau consumes geometry/exports over WebSocket only and renders locally in three.js; none of these toggles change BREP or tessellation used for GLB.

| WASM JSON field (`modeling.*`) | `ExecutorSettings` / engine path           | Wire modeling command(s) (summary)                            | Tau observable effect                                              |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `enable_ssao`                  | `send_clear_scene` when true               | `SetOrderIndependentTransparency`                             | **Was failing** headless (Finding 12); must stay `false`.          |
| `highlight_edges`              | `reapply_settings` → `set_edge_visibility` | `EdgeLinesVisible(hidden=!highlight_edges)`                   | Overlay only; GLB edges from solid ops, not this toggle.           |
| `show_scale_grid`              | maps to `show_grid`; `modify_grid`         | `ObjectVisible` on grid + scale-text IDs; plus grid scale cmd | Overlay only; Tau has its own grid.                                |
| `fixed_size_grid`              | `GridScaleBehavior` in `modify_grid`       | `SetGridAutoScale` vs `SetGridScale`                          | Grid mesh only; `false` → auto-scale when grid commands still run. |

Sources: `repos/zoo-modeling-app/rust/kcl-lib/src/engine/mod.rs` (`reapply_settings`, `modify_grid`, `set_edge_visibility`, `GridScaleBehavior::into_modeling_cmd`); `execution/mod.rs` (`From<Settings> for ExecutorSettings`, `run_with_caching` grid_scale).

## Headless settings — open questions (deferred audit)

**Status: resolved** — the former “defer until evidence” table is closed by Finding 13 (engine-source review). Tau `tauHeadlessKclSettings` sets all four rows to headless-truthful values; extend the registry only with new evidence if a future kcl-lib version adds viewport-only flags that trip the headless bridge.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ------ |
| R0  | **`buildKclSettingsJson` + headless modeling defaults** at the Tau→WASM boundary ([`kcl-headless-settings.ts`](../../packages/runtime/src/kernels/zoo/kcl-headless-settings.ts)): `enable_ssao: false` fixes the OIT empty-error cascade (Finding 12). **Status:** landed — UI verification for follow-on projects pending.                                                                                                                                                                      | P0       | S      | High   |
| R0a | Extend `tauHeadlessKclSettings` with **`highlight_edges` / `show_scale_grid` / `fixed_size_grid` all `false`** (Finding 13) so implicit upstream defaults stop queueing viewport-only engine commands (edge overlay, grid visibility/scale). Not a known failure mode today; reduces wire noise and matches headless truthfulness. **Status:** landed — second-pass UI verification pending.                                                                                                     | P1       | S      | Medium |
| R1  | **Keep `executeMockKcl` integration coverage** (real WASM, no stub) in `kcl-bottle-sample.integration.test.ts` for `eval_prelude`. **Optionally** extend `zooTestWrapSocketWithEngineAutoReply` + polling until `Context.execute` fake-engine test is stable under all batch/fire orderings, or gate a token-backed real `wss://` test.                                                                                                                                                          | P0       | M      | High   |
| R2  | **Bust the parameter cache and rerun `getParameters` once** to confirm whether `executeMock` is also broken on 0.1.148, or only the engine path. This is a 1-line `pnpm` invocation against the cache directory. The result determines whether the smoking gun is engine-specific or affects both contexts.                                                                                                                                                                                      | P0       | XS     | High   |
| R3  | **Add a multi-file regression test** (`packages/runtime/src/kernels/zoo/kcl-multi-file.integration.test.ts`) that opens a project containing `main.kcl` + `bench-parts.kcl` linked via `import "./bench-parts.kcl"`, then asserts `KclUtilities.executeProgram` resolves both files purely via `FileSystemManager.readFile` (no `Context.open_project` call). Locks in the conclusion of Finding 10 so future kcl-wasm-lib bumps cannot silently move the resolution path onto `ProjectManager`. | P1       | S      | Medium |
| R3a | **Strike the now-disproven `open_project` hypothesis** from any internal docs/plans. Update `docs/research/kcl-feature-surface-gaps.md` to call out that "Multi-file project lifecycle in WASM" is a sketch-editing capability, not a multi-file _execution_ capability — multi-file execution already works through the host FS.                                                                                                                                                                | P2       | XS     | Medium |
| R4  | **`kcl_trace!` is in the fork** (`repos/zoo-modeling-app/rust/kcl-lib`); **rebuild and republish** `@taucad/kcl-wasm-lib` via [`rebuild-kcl-wasm-lib` skill](../../.agent/skills/rebuild-kcl-wasm-lib/SKILL.md) to get `[kcl-trace]` lines in the browser for the leaf `inner_msg` before semantic re-wrap.                                                                                                                                                                                      | P1       | M      | High   |
| R5  | **Document the failure mode and the `vi.fn` test gap** in `docs/policy/kcl-engine-bridge-policy.md`'s "Required test coverage" section so future kcl-wasm-lib rebuilds cannot regress this path silently.                                                                                                                                                                                                                                                                                        | P1       | XS     | Medium |
| R6  | **Superseded for Tau’s GLB-only use case** after Finding 12: the failure was `set_order_independent_transparency` rejected on a headless WebSocket session when SSAO-derived defaults were left implicit. **Not pursued:** full WebRTC/`engineCommandManager.start` parity — Tau never consumes the engine video stream; truthful `enable_ssao: false` aligns configuration with headless execution. Revisit only if Tau ships an interactive streamed viewport that needs SSAO/OIT.             | —        | —      | —      |
| R7  | **Audit our other integration tests** (`engine-connection.integration.test.ts`, `kcl-utils.test.ts`) for additional `vi.fn` stubs that mask real WASM regressions.                                                                                                                                                                                                                                                                                                                               | P2       | S      | Medium |

## Trade-offs

| Approach                                    | Pros                                                                         | Cons                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Real WASM integration test** (R1)         | Catches the regression once and forever; matches upstream's testing approach | Requires `VITE_ZOO_API_TOKEN` or a fake; longer runtimes; CI cost                                     |
| **Project-lifecycle wiring** (R3)           | Aligns with modeling-app; removes a known delta; small code change           | Requires designing a Tau-side `projectId`/`fileId` registry; risk of double-init issues               |
| **WebRTC priming** (R6, superseded for Tau) | Would initialise server render pipeline for streamed viewports               | Unnecessary for GLB export / local three.js; superseded by headless `enable_ssao: false` (Finding 12) |
| **Rust-side instrumentation** (R4)          | Direct visibility into the leaf error message and source range               | Requires a one-off WASM rebuild; not landed in CI                                                     |

## Code Examples

### The wrap pattern that produced the user's error string

```987:1009:repos/zoo-modeling-app/rust/kcl-lib/src/execution/exec_ast.rs
        result.map_err(|(err, _, _)| {
            match err {
                KclError::ImportCycle { .. } => {
                    // It was an import cycle.  Keep the original message.
                    err.override_source_ranges(vec![source_range])
                }
                KclError::EngineHangup { .. } | KclError::EngineInternal { .. } => {
                    // Propagate this type of error. It's likely a transient
                    // error that just needs to be retried.
                    err.override_source_ranges(vec![source_range])
                }
                _ => {
                    // TODO would be great to have line/column for the underlying error here
                    KclError::new_semantic(KclErrorDetails::new(
                        format!(
                            "Error loading imported file ({path}). Open it to view more details.\n  {}",
                            err.message()
                        ),
                        vec![source_range],
                    ))
                }
            }
        })
```

### Tau `executeProgram` settings JSON — headless defaults merged at the boundary

```514:522:packages/runtime/src/kernels/zoo/kcl-utils.ts
      try {
        const programJson = JSON.stringify(program);
        const settingsJson = buildKclSettingsJson(settings);
        const executeResult: unknown = await this.engineManager.context?.execute(
          programJson,
          path,
          settingsJson,
        );

        this.hasExecutedProgram = true;

        const delta = normalizeSceneGraphDelta(executeResult);
        const outcome = normalizeKclExecutionResult(delta.execOutcome);
        await this.engineManager.bridge?.flushPending();
        return outcome;
      } catch (error) {
        log.error('KCL execution error details:', error);

        const extracted = extractWasmKclErrorDetails(error);
        if (extracted) {
          throw new KclWasmError(extracted.wasmError, extracted.partialOutcome);
        }

        const errorMessage =
          error instanceof Error ? `KCL execution failed: ${error.message}` : `KCL execution failed: ${String(error)}`;
        throw KclError.simple({ kind: 'engine', message: errorMessage });
      }
    });
```

### Modeling-app's full bootstrap (single source of truth)

```96:160:repos/zoo-modeling-app/src/lib/rustContext.ts
  async sendOpenProject(currentFilePath: string | null, kclFiles: ApiFile[]) {
    const currentFileId =
      kclFiles.find((f) => f.path === currentFilePath)?.id || -1
    await this.ctxInstance?.open_project(
      this.projectId,
      JSON.stringify(kclFiles),
      currentFileId
    )
    this.hasOpenedProject = true
  }

  ...

  async sendUpdateFile(fileId: number, code: string) {
    if (!this.hasOpenedProject) {
      return
    }
    return this.ctxInstance?.update_file(this.projectId, fileId, code)
  }

  ...

  async execute(node, settings, path?) {
    const instance = await this._checkContextInstance()
    try {
      const result: SceneGraphDelta = await instance.execute(
        JSON.stringify(node),
        path,
        JSON.stringify(settings)
      )
      const outcome = execStateFromRust(result.exec_outcome)
      this.setDefaultPlanes(outcome.defaultPlanes)
      return outcome
    } catch (e: any) {
      const err = errFromErrWithOutputs(e)
      this.setDefaultPlanes(err.defaultPlanes)
      return Promise.reject(err)
    }
  }
```

## Diagrams

### The two-layer wrap that produces the observed error string

```text
Tau worker → KclUtilities.executeProgram(program, "main.kcl", {})
              │
              └─ Context.execute(programJson, "main.kcl", "{}")            (kcl-wasm-lib)
                  │
                  └─ FrontendState.engine_execute → ExecutorContext.run_with_caching
                      │
                      ├─ cache::read_old_ast() → None  (cold path)
                      ├─ send_clear_scene(...)         (succeeds: no Hangup observed)
                      └─ run_concurrent(program)
                          │
                          └─ eval_prelude
                              │
                              └─ open_module(std::prelude) → read_std("prelude")  ✓
                                  └─ exec_module_for_items(std::prelude)
                                      └─ exec_module_from_ast(prelude_program)
                                          │
                                          └─ exec_module_body(prelude)
                                              └─ exec_block(prelude_body)
                                                  ├─ open_module(std::types) → read_std("types") ✓
                                                  └─ exec_module_for_items(std::types)
                                                      └─ exec_module_from_ast(types_program)   ⓦ inner wrap
                                                          │
                                                          └─ exec_module_body(types)
                                                              └─ exec_block(types_body)
                                                                  └─ ✗ (leaf err with msg = "")

Outer wrap @ exec_ast.rs:1000   (prelude layer)
  → "Error loading imported file (std::prelude). Open it...\n  {inner}"

Inner wrap @ exec_ast.rs:1000   (types layer)
  → "Error loading imported file (std::types). Open it...\n  {leaf=""}"

Final string surfaced to JS:
  "Error loading imported file (std::prelude). Open it to view more details.\n
     Error loading imported file (std::types). Open it to view more details.\n
     "
```

## References

- Upstream wrap site: [`exec_module_from_ast`](https://github.com/KittyCAD/modeling-app/blob/main/rust/kcl-lib/src/execution/exec_ast.rs#L987)
- Upstream prelude resolver: [`read_std`](https://github.com/KittyCAD/modeling-app/blob/main/rust/kcl-lib/src/modules.rs#L85)
- Upstream `RustContext`: [`src/lib/rustContext.ts`](https://github.com/KittyCAD/modeling-app/blob/main/src/lib/rustContext.ts)
- Tau policy: `docs/policy/kcl-engine-bridge-policy.md`
- Prior Tau audits: `docs/research/zoo-kcl-148-integration-audit.md`, `docs/research/zoo-kcl-148-integration-gaps.md`

## Appendix

### A. Verified facts

| Fact                                                                                  | Verification                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `prelude.kcl` and `types.kcl` are present in 0.1.148 WASM                             | `strings kcl_wasm_lib_bg.wasm                                                               | rg 'export import \* from "std::types"'` → match |
| `read_std()` resolves `prelude` and `types` from `include_str!`                       | `repos/zoo-modeling-app/rust/kcl-lib/src/modules.rs:85-106`                                 |
| `FileSystemManager.readFile` is never called for `std::*` paths                       | `ModulePath::source` switches on the variant; only `Local` calls `fs.read_to_string`        |
| The wrap text is unique to `exec_ast.rs:1000`                                         | Single `rg 'Error loading imported file'` hit                                               |
| Tau's bottle-sample covers real `executeMockKcl` (std / prelude path)                 | `kcl-bottle-sample.integration.test.ts` describe `executeMockKcl (real WASM, no WebSocket)` |
| Tau stubs `Context.execute` only for bridge/`flushPending` concurrency test           | `kcl-bottle-sample.integration.test.ts` describe `bottle-shaped execute (stub engine)`      |
| Modeling-app's unit tests call `engineCommandManager.start({...})` before any execute | `src/unitTestUtils.ts:97-121`                                                               |
| Modeling-app calls `Context.open_project` before `update_file`/`execute`              | `src/lib/rustContext.ts:96-128`                                                             |

### B. Eliminated hypotheses

| Hypothesis                                                                                           | Eliminated by                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FileSystemManager returns ENOENT for `std::prelude`                                                  | Finding 1: WASM never asks the host FS for std modules                                                                                                                                                                                                                                 |
| `@kittycad/lib` version mismatch causes the wire decode to drop fields                               | The error string is constructed entirely by Rust before any WS round-trip                                                                                                                                                                                                              |
| `getAllFiles` JSON-vs-array mismatch corrupts std discovery                                          | std modules are never enumerated via FS                                                                                                                                                                                                                                                |
| Missing `getClientState` / `getOsInfo` / `getWebrtcStats`                                            | Those are `CoreDumpManager` externs, optional for execute                                                                                                                                                                                                                              |
| `MockEngineConnection` throwing on `fireModelingCommandFromWasm` triggers the wrap                   | The wrap layer bypasses `EngineHangup`/`EngineInternal`; engine errors would surface differently                                                                                                                                                                                       |
| Skipping `Context.open_project` / `add_file` / `update_file` / `switch_file` corrupts module loading | Finding 10: `ProjectManager` is a standalone `lazy_static` state container consumed only by sketch-block editing APIs; `Context.execute`'s call chain (`create_executor_ctx` → `engine_execute` → `run_with_caching` → `eval_prelude`) never reads from it                             |
| Multi-file Zoo geometries require `add_file`/`update_file` to register sources before execute        | Local KCL imports resolve via `ImportPath::Kcl → ModulePath::Local::source → fs.read_to_string` against the host `FileSystemManager` (Finding 10); modeling-app's own multi-file route loader sets `projectFsManager.dir = projectPath` once and lets the FS adapter handle resolution |

### C. Open questions for follow-up

1. Does `executeMock` actually fail on 0.1.148 once the parameter cache is busted, or is the bug truly `execute`-only? (Answered by R2.)
2. What is the leaf `KclError::new_*` site inside `exec_module_body(std::types)`? **Answered by Finding 12:** engine rejection of `set_order_independent_transparency` with empty `errors:[]`, surfaced through semantic wrap with `inner_msg=""`.
3. ~~Does adding the `Context.open_project` / `update_file` lifecycle dance fix the bug without WebRTC priming?~~ **Answered by Finding 10: no — `Context.execute` does not consume `ProjectManager` state. R3 has been redirected to a multi-file FS-resolution regression test.**
4. Does the same project load successfully in upstream `taucad/zoo-modeling-app` running locally against `wss://api.zoo.dev`? (Quick A/B test that isolates Tau-side vs WASM-side.)
5. ~~Does the WebRTC priming (R6) actually matter for `send_clear_scene`, or does our existing WS-only bridge satisfy the SceneClear contract?~~ **Superseded after Finding 12 for Tau:** scene clear and plane batches succeed over WS-only; the regression was SSAO-default → OIT toggle, not missing WebRTC. R6 remains a modeling-app parity topic only if Tau ships a streamed engine viewport.

### D. Phase 0 — parameter / geometry cache bust (manual)

1. Open the project directory on disk (e.g. `.../projects/proj_xxx/`).
2. Delete **`${projectRoot}/.tau/cache/parameters/*.json`** (see [`parameter-cache.middleware.ts`](../../packages/runtime/src/middleware/parameter-cache.middleware.ts) — L2 cache path).
3. Optionally delete **`${projectRoot}/.tau/cache/geometry/*.bin`** to force geometry rebuilds.
4. Hard-reload the app and capture console + `[kcl-debug]` logs with `KCL_DEBUG=1` if enabled for the worker.

Interpretation: if `getParameters` **fails** after bust → `executeMock` path regressed on current WASM; if it **succeeds** but `createGeometry` **fails** → engine-only (`Context.execute`) path.
