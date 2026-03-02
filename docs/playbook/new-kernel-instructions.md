# New Kernel Integration Instructions (Agent-Optimized)

Canonical playbook for adding a **new first-party CAD kernel** to Tau.

This replaces older worker-specific guidance. The active architecture uses:

- `@taucad/kernels` plugin system (`defineKernel`, `createKernelPlugin`, presets)
- `KernelRuntimeWorker` (single worker, per-file kernel selection)
- Nx monorepo validation commands (`pnpm nx ...`)

---

## 0) Scope and Definition of Done

A kernel integration is complete only when **all** of the following are done:

1. Kernel implementation exists in `packages/kernels/src/kernels/<id>/<id>.kernel.ts`
2. Comprehensive tests exist and pass
3. Kernel is wired into plugin factories + presets + exports + build entries
4. UI default/debug kernel options include the kernel where applicable
5. Type/catalog metadata includes the kernel (`libs/types/src/constants/kernel.constants.ts`)
6. Docs and prompt configuration mention and support the kernel
7. Required Nx lint/typecheck/test commands pass

---

## 1) Implementation Blueprint

### 1.1 Create kernel module

**File:** `packages/kernels/src/kernels/<id>/<id>.kernel.ts`

Implement via `defineKernel({...})`:

- `initialize(options, runtime)`  
  Load heavy runtimes (WASM, SDK clients), register built-in modules with `runtime.bundler.registerModule(...)`.
- `canHandle({ filePath, extension }, runtime, context)`  
  Must be fast. For JS/TS kernels, detect imports/require patterns.
- `getDependencies({ filePath }, runtime, context)`  
  Usually `runtime.bundler.resolveDependencies(filePath)` for JS/TS kernels.
- `getParameters(...)`  
  Parse `defaultParams` / `defaultParameters` and return JSON schema (commonly via `jsonSchemaFromJson`).
- `createGeometry(...)`  
  Bundle + execute user code; return `{ geometry: GeometryResponse[], nativeHandle }`.
- `exportGeometry(...)`  
  Export from `nativeHandle`; return `createKernelSuccess([...])` / `createKernelError([...])`.
- `cleanup(context)` (optional but recommended)  
  Release WASM/manual resources.

**Error model:**

- Use `createKernelError` / `createKernelSuccess` in non-throw paths.
- For fatal geometry failures, throw `Error` with `.issues` array (custom `*BuildError`) so framework returns structured issues.
- Prefer stack enrichment utilities in `#framework/error-enrichment.js` for JS/TS kernels.

### 1.2 Add tests

**File:** `packages/kernels/src/kernels/<id>/<id>.kernel.test.ts`

Use helpers from `#testing/kernel-testing.utils.js` and `#testing/kernel-geometry-testing.utils.js`.

Minimum coverage:

- `canHandle`: positive and negative cases
- `getParameters`: defaults extraction + empty fallback
- `createGeometry`: happy path + parameterized path + runtime/compile errors
- `exportGeometry`: supported and unsupported formats + no-geometry failure

Reference quality bar:

- `jscad.kernel.test.ts`
- `replicad.kernel.test.ts`

---

## 2) Wiring Checklist (Required Files)

### 2.1 Kernel plugin factory

**File:** `packages/kernels/src/plugins/kernel-factories.ts`

- Add `<kernel>()` factory
- Add `<KernelOptions>` type (even if empty)
- Configure:
  - `id`
  - `moduleUrl`
  - `extensions`
  - `detectImport` (if JS/TS)
  - `builtinModuleNames` (if JS/TS library imports should trigger transitive detection)

### 2.2 Export factory to consumers

**File:** `packages/kernels/src/plugins/kernels-entry.ts`

- Export new factory + options type.

### 2.3 Include in defaults

**File:** `packages/kernels/src/plugins/presets.ts`

- Add `<kernel>()` to `presets.all().kernels` in intended priority order.

### 2.4 Package subpath exports

**File:** `packages/kernels/package.json`

- Add source export:
  - `"./kernels/<id>": "./src/kernels/<id>/<id>.kernel.ts"`
- Add publishConfig export entries for CJS + ESM outputs.

### 2.5 Build entrypoints

**File:** `packages/kernels/tsdown.config.ts`

- Add `src/kernels/<id>/<id>.kernel.ts` to `entry`.

### 2.6 Smoke imports

**File:** `packages/kernels/src/testing/smoke-esm.test.ts`

- Add import assertion for `#kernels/<id>/<id>.kernel.js`.

### 2.7 UI kernel defaults

**File:** `apps/ui/app/constants/kernel-worker.constants.ts`

- Add kernel factory import and include in `defaultKernelOptions`.
- Ensure `debugKernelOptions` logic still works.

### 2.8 Kernel catalog/type metadata

**File:** `libs/types/src/constants/kernel.constants.ts`

- Add `kernelConfigurations` entry with:
  - `id`, `name`, `language`, `mainFile`, `backendProvider`
  - `description`, `longDescription`
  - `emptyCode`, `recommended`, `tags`, `features`

---

## 3) Prompt System Integration (AI CAD Agent)

Add kernel prompt config files under:

`apps/api/app/api/chat/prompts/kernel-prompt-configs/`

Required:

- `<id>.prompt.config.ts`
- `<id>.prompt.example.<ext>`
- Register in `kernel.prompt.config.ts` map

Use existing configs (replicad/jscad/zoo/openscad) as templates.

---

## 4) Documentation Updates (Required)

At minimum update:

- `docs/policy/kernel-architecture-policy.md`
- `docs/new-kernel-instructions.md` (this file, when improving process)
- Kernel docs site pages under `apps/ui/content/docs/(kernels)/...`:
  - index
  - choosing-a-kernel
  - installation
  - api/kernels
  - concepts/plugin-system
  - guides/bundler-configuration

Update all kernel lists/comparison tables, examples, and selection priority references.

---

## 5) Verification Commands (Nx)

Run scoped checks first, then broaden if needed:

```bash
pnpm nx typecheck kernels
pnpm nx test kernels --watch=false
pnpm nx lint kernels
```

If files in `apps/ui` or `apps/api` changed:

```bash
pnpm nx typecheck ui
pnpm nx lint ui
pnpm nx test ui --watch=false

pnpm nx typecheck api
pnpm nx lint api
pnpm nx test api --watch=false
```

When touching multiple projects, run affected checks or a targeted matrix.

---

## 6) Agent Execution Protocol (Recommended)

1. Implement kernel + tests first
2. Wire factories/exports/build/smoke
3. Wire UI + type catalog + prompts
4. Update docs
5. Run Nx checks and fix all regressions
6. Commit with descriptive message

Keep commits logically grouped (implementation, docs, etc.) if practical.

---

## 7) Common Failure Modes

- Added kernel file but forgot `tsdown` entry (build output missing)
- Added factory but forgot `kernels-entry.ts` export (consumer import fails)
- Added kernel to code but not to docs comparisons (docs drift)
- `canHandle` too broad/slow (kernel mis-selection)
- Missing `builtinModuleNames` for JS/TS kernels (transitive import detection fails)
- Export path missing in `package.json` publishConfig (package consumers break)

---

## 8) Quick File Checklist

- [ ] `packages/kernels/src/kernels/<id>/<id>.kernel.ts`
- [ ] `packages/kernels/src/kernels/<id>/<id>.kernel.test.ts`
- [ ] `packages/kernels/src/plugins/kernel-factories.ts`
- [ ] `packages/kernels/src/plugins/kernels-entry.ts`
- [ ] `packages/kernels/src/plugins/presets.ts`
- [ ] `packages/kernels/package.json`
- [ ] `packages/kernels/tsdown.config.ts`
- [ ] `packages/kernels/src/testing/smoke-esm.test.ts`
- [ ] `apps/ui/app/constants/kernel-worker.constants.ts`
- [ ] `libs/types/src/constants/kernel.constants.ts`
- [ ] `apps/api/app/api/chat/prompts/kernel-prompt-configs/*`
- [ ] Kernel docs pages + architecture policy updates
