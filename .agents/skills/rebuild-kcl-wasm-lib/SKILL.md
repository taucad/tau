---
name: rebuild-kcl-wasm-lib
description: Rebuild and republish @taucad/kcl-wasm-lib from the taucad/modeling-app fork. Use when bumping KCL, syncing modeling-app upstream, fixing KCL parser/sketch errors, wasm-pack rebuilds, or republishing the kcl-wasm-lib npm package.
disable-model-invocation: true
---

# Rebuild `@taucad/kcl-wasm-lib`

End-to-end workflow from **KittyCAD/modeling-app** (via **`taucad/modeling-app`**) through the Tau monorepo.

## Prerequisites

- **Node** 22+ (upstream `.nvmrc`; newer Node often works).
- **rustup** toolchain pinned in fork `rust-toolchain.toml` (e.g. **1.93.1**) + target **`wasm32-unknown-unknown`** for that toolchain.
- **wasm-pack** (e.g. 0.13.x).
- **`pnpm repos`** access to `repos/zoo-modeling-app` (see `repos.yaml`).

Pre-warm Rust so the wasm build does not stall mid-compile:

```bash
rustup toolchain install 1.93.1
rustup target add wasm32-unknown-unknown --toolchain 1.93.1
```

## Source of truth

| What                           | Where                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| Crate / npm version            | `repos/zoo-modeling-app/rust/kcl-wasm-lib/Cargo.toml` `version = "…"`                      |
| Build script                   | `repos/zoo-modeling-app/scripts/build-wasm.sh`                                             |
| Published npm name + `exports` | **`rust/kcl-wasm-lib/pkg/package.json`** — Tau template (**not** vanilla wasm-pack output) |

## 1. Sync fork

```bash
pnpm repos sync zoo-modeling-app
cd repos/zoo-modeling-app
git fetch upstream main
git checkout main
git reset --hard upstream/main
```

Confirm version in `rust/kcl-wasm-lib/Cargo.toml`. Push only after pkg commit is ready (see §7).

## 2. JavaScript deps (modeling-app)

```bash
cd repos/zoo-modeling-app
npm install
```

Do not commit `package-lock.json` churn unless upstream expects it.

## 3. Build WASM

```bash
cd repos/zoo-modeling-app
npm run build:wasm
```

Expect roughly 10–25 minutes. Produces `rust/kcl-wasm-lib/pkg/` (wasm-pack output) and regenerates `rust/kcl-lib/bindings/`.

## 4. Stage `pkg/` for `@taucad`

1. **Bindings**: copy TS bindings into the package root:

   ```bash
   cp -r rust/kcl-lib/bindings rust/kcl-wasm-lib/pkg/
   ```

2. **Remove blocking gitignore**: wasm-pack may write `pkg/.gitignore` with `*`. Delete it so `pkg/` artifacts can be committed.

3. **`rust/.gitignore`**: track `pkg/` but ignore packed tarballs and nested src noise, e.g.:
   - ignore `pkg/src`
   - ignore `pkg/*.tgz`

4. **Overwrite `pkg/package.json`** with the canonical template (adjust **`version`** only to match `Cargo.toml`):

   ```json
   {
     "name": "@taucad/kcl-wasm-lib",
     "private": false,
     "publishConfig": { "access": "public" },
     "type": "module",
     "version": "0.1.148",
     "repository": {
       "type": "git",
       "url": "git+https://github.com/taucad/modeling-app.git",
       "directory": "rust/kcl-wasm-lib/pkg"
     },
     "files": ["kcl_wasm_lib_bg.wasm", "kcl_wasm_lib.js", "kcl_wasm_lib.d.ts", "bindings"],
     "exports": {
       ".": {
         "require": { "types": "./kcl_wasm_lib.d.ts", "default": "./kcl_wasm_lib.js" },
         "import": { "types": "./kcl_wasm_lib.d.ts", "default": "./kcl_wasm_lib.js" }
       },
       "./kcl.wasm": {
         "require": { "default": "./kcl_wasm_lib_bg.wasm" },
         "import": { "default": "./kcl_wasm_lib_bg.wasm" }
       },
       "./bindings/*": {
         "import": { "types": "./bindings/*.ts" },
         "require": { "types": "./bindings/*.ts" }
       }
     },
     "main": "kcl_wasm_lib.js",
     "types": "kcl_wasm_lib.d.ts",
     "sideEffects": ["./snippets/*"]
   }
   ```

5. Restore **`pkg/README.md`** (short note that Tau maintains pkg overrides).

## 5. Pack tarball (local publish artifact)

```bash
cd repos/zoo-modeling-app/rust/kcl-wasm-lib/pkg
npm pack
```

Verify listing: `package/kcl_wasm_lib.js`, `.d.ts`, `.wasm`, `package/bindings/*.ts`.

**Human hand-off:** publish from this directory when ready:

```bash
npm publish --access=public
```

## 6. Wire tarball into Tau (pre-registry)

Until `npm publish` completes, pnpm **catalog** cannot use `file:` tarballs. Typical pattern:

1. Copy `taucad-kcl-wasm-lib-<version>.tgz` to workspace **`tarballs/`**.
2. Set **`pnpm-workspace.yaml`** catalog pin: `'@taucad/kcl-wasm-lib': '<version>'`.
3. Add root **`package.json`** → **`pnpm.overrides`**: `'@taucad/kcl-wasm-lib': 'file:tarballs/taucad-kcl-wasm-lib-<version>.tgz'` so resolution wins before the registry.
4. After the package is on npm, remove the override and rely on catalog + lockfile only.

## 7. ESM `.js` extensions on `bindings/*.ts`

ts-rs emits extensionless relative imports (`from "./Foo"`). Node ESM + tsgo expect **`from "./Foo.js"`** on those paths.

- **Before `npm pack` / `npm publish`**: run the `perl` rewrite in `rust/kcl-wasm-lib/pkg/bindings` (same one-liner as below) so the **published** tarball ships correct imports. Tau then consumes the registry build with **no** `patches/@taucad__kcl-wasm-lib.patch` and **no** `pnpm.overrides` for this package — only the catalog pin in `pnpm-workspace.yaml`.

- **Local `file:` tarball only** (pre-publish): you can temporarily add a pnpm patch if needed; remove both override and patch entry once the version is on npm.

```bash
find rust/kcl-wasm-lib/pkg/bindings -name '*.ts' -exec perl -i -pe 's{from "\./([^"\.]+)"}{from "./\1.js"}g' {} +
```

**Pitfall**: If TS2835 cascades from a stale patched package dir after changing patch/override state, remove trees under `node_modules/.pnpm/*kcl-wasm-lib*` and run `pnpm install` again.

## 8. Refresh copied runtime WASM

```bash
pnpm nx run runtime:copy-assets
```

Confirms `packages/runtime/src/kernels/zoo/wasm/kcl_wasm_lib_bg.wasm` matches the installed package.

## 9. Tau code updates (common upstream breaks)

| Change                                                | What to do                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CompilationError` → **`CompilationIssue`** in ts-rs  | Import from `@taucad/kcl-wasm-lib/bindings/CompilationIssue` (alias at call site if needed).                                                                                                                                                                                                                                                                                      |
| **`ExecOutcome`** JSON uses **`issues`** not `errors` | Normalize in `KclUtilities` (`normalizeKclExecutionResult`) so consumers keep using `errors`.                                                                                                                                                                                                                                                                                     |
| **`Context.execute` returns `SceneGraphDelta`**       | Unwrap via `normalizeSceneGraphDelta` in `kcl-utils.ts` before `normalizeKclExecutionResult` (snake_case `exec_outcome`).                                                                                                                                                                                                                                                         |
| Worker **`window.performance`** (KCL uses `web-time`) | **`packages/runtime/src/framework/worker-preload-polyfill.ts`**: minimal `window` stub must expose `performance` delegated from `globalThis`.                                                                                                                                                                                                                                     |
| **`@kittycad/lib`** types + tsgo `exports`            | Types resolve via root **`pnpm.patchedDependencies`**: **`patches/@kittycad__lib@2.0.48.patch`** — adds `types` / `import` / `require` / `default` conditions on the `"."` export (upstream ships a string there, which tsgo rejects). On catalog bumps, re-diff against the new tarball and rename the patch key + file. Do **not** scatter `compilerOptions.paths` workarounds. |

## Engine bridge ABI audit (verify on every `@taucad/kcl-wasm-lib` bump)

Confirm these surfaces against **`repos/zoo-modeling-app/rust/kcl-lib/src/engine/conn_wasm.rs`** and **`kcl_wasm_lib.d.ts`** before publishing a new tarball:

| Surface                            | Contract                                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EngineCommandManager`             | **`fireModelingCommandFromWasm(id, rangeStr, commandStr, idToRangeStr)`** — sync void; **`sendModelingCommandFromWasm(...)`** — returns `Promise<Uint8Array>` (msgpack `WebSocketResponse`); **`startNewSession()`** — `Promise<void>` (may be upstream no-op). |
| `Context`                          | **`sendResponse(Uint8Array)`** — every inbound engine frame (binary msgpack _or_ string JSON re-encoded to bytes for the wasm side) must be delivered so fire-and-forget commands can drain.                                                                    |
| `Context.execute` vs `executeMock` | Engine path returns **`SceneGraphDelta`**-shaped JSON; mock path still returns **`ExecOutcome`** — do not feed `normalizeKclExecutionResult` the wrong envelope.                                                                                                |
| `FileSystemManager.getAllFiles`    | Return value must be a **JSON array string** (`JSON.stringify(string[])`) for the Rust `as_string` + `serde_json::from_str` path.                                                                                                                               |

Cross-check Tau implementation: **`packages/runtime/src/kernels/zoo/`** (`transport/`, `bridge/`, `session/`, `engine-connection.ts`, `filesystem-manager.ts`, `kcl-utils.ts`). Historical drift notes: **`docs/research/zoo-kcl-148-integration-audit.md`**. Deferred upstream feature surface: **`docs/research/kcl-feature-surface-gaps.md`**.

## 10. Verification

```bash
pnpm nx typecheck runtime
pnpm nx typecheck ui
pnpm nx test runtime ./src/kernels/zoo --watch=false
```

Optional: `pnpm nx serve ui` and smoke **sketch-heavy** samples (e.g. `fan-housing.kcl`).

## 11. Commit fork

```bash
cd repos/zoo-modeling-app
git add rust/kcl-wasm-lib/pkg rust/.gitignore
git commit -m "feat(kcl-wasm-lib): rebuild for <version>"
git push origin main --force-with-lease
```

Only use **`--force-with-lease`** when replacing your own prior build tip.

## Pitfalls

- **Stale `node_modules/.pnpm/*patch_hash*`** → wipe and `pnpm install`.
- **Do not `npm publish` from Tau root** — always `cd` to `rust/kcl-wasm-lib/pkg`.
- **`worker-preload-polyfill` must stay first import** in the worker entry so Vite/HMR stubs exist before other imports.
