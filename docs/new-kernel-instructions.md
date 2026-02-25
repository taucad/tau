Kernel Integration Playbook (Agent-Optimized)
==============================================

This is the canonical procedure for adding a **new kernel** to Tau's current architecture (`defineKernel` + `KernelRuntimeWorker` plugin model).

Use this as an execution checklist, not a conceptual overview.

---

## 0) Scope and Preconditions

Before coding, confirm:

- You are integrating into `packages/kernels/src/kernels/<kernel-id>/`.
- You are using `defineKernel(...)` (not the legacy per-kernel worker architecture).
- You know the target file extensions and detection signals (`detectImport`, `builtinModuleNames`).
- You have a fallback plan for non-critical features (for example, export-only supports `glb` at first).

---

## 1) Required Code Changes (Minimal Complete Integration)

### 1.1 Implement kernel module

Create:

- `packages/kernels/src/kernels/<kernel-id>/<kernel-id>.kernel.ts`

Required lifecycle methods:

- `initialize(options, runtime)`
- `getDependencies(input, runtime, context)`
- `getParameters(input, runtime, context)`
- `createGeometry(input, runtime, context)`
- `exportGeometry(input, runtime, context)`

Optional but strongly recommended:

- `canHandle(input, runtime, context)` for fast entrypoint filtering
- `cleanup(context)` for releasing runtime resources
- `optionsSchema` (Zod) for validated options and typed config

### 1.2 Register factory plugin

Update:

- `packages/kernels/src/plugins/kernel-factories.ts`

Add:

- `export type <KernelName>Options = { ... }`
- `export const <kernelName> = createKernelPlugin<...>({...})`

Set:

- `id`
- `moduleUrl`
- `extensions`
- `detectImport` (if JS-family kernel)
- `builtinModuleNames` (if bundler-assisted detection is needed)

### 1.3 Export in kernel entry barrel

Update:

- `packages/kernels/src/plugins/kernels-entry.ts`

Add function and options type exports.

### 1.4 Include in presets

Update:

- `packages/kernels/src/plugins/presets.ts`

Add the new kernel to `presets.all().kernels` in intentional priority order.

### 1.5 Add package subpath exports

Update:

- `packages/kernels/package.json`

Add source export:

- `./kernels/<kernel-id>`

Add publish exports (cjs/esm types + runtime files):

- `./kernels/<kernel-id>` under `publishConfig.exports`

### 1.6 Runtime defaults in UI client

Update:

- `apps/ui/app/constants/kernel-worker.constants.ts`

Add the kernel factory to `defaultKernelOptions.kernels` (and debug config if relevant).

---

## 2) Bundler + Detection Requirements (JS/TS/TSX Kernels)

If your kernel handles JS-family inputs:

1. Ensure `extensions` include needed variants (`ts`, `js`, `tsx`, `jsx`).
2. Ensure `detectImport` catches common entrypoint patterns.
3. Ensure `builtinModuleNames` supports transitive detection for imported modules.
4. If JSX is required, configure JSX transform **only when needed** (on-demand by extension) in bundler options.

Rule of thumb:

- extension + regex = fast path
- bundler `detectImports` + `builtinModuleNames` = transitive path

---

## 3) UI/Domain Catalog Integration

If kernel should be selectable in product UI, update:

- `libs/types/src/constants/kernel.constants.ts`

Add `KernelConfiguration` entry with:

- `id`
- `name`
- `language`
- `dimensions`
- `description`
- `mainFile`
- `backendProvider`
- `emptyCode`
- `recommended`
- `tags`
- `features`

This automatically flows to:

- Kernel selectors
- New build bootstrap (`getMainFile`, `getEmptyCode`)
- Chat/editor kernel lists using `kernelProviders`

---

## 4) API Prompt Integration (If KernelProvider union expands)

If adding to `kernelProviders`, update prompt configs:

- `apps/api/app/api/chat/prompts/kernel-prompt-configs/<kernel-id>.prompt.config.ts`
- `apps/api/app/api/chat/prompts/kernel-prompt-configs/<kernel-id>.prompt.example.<ext>`
- `apps/api/app/api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.ts`

`kernel.prompt.config.ts` must remain exhaustive for `Record<KernelProvider, KernelConfig>`.

---

## 5) Testing Requirements (Do Not Skip)

### 5.1 Kernel tests

Create:

- `packages/kernels/src/kernels/<kernel-id>/<kernel-id>.kernel.test.ts`

Required coverage:

1. `canHandle`
   - positive detection
   - false positives rejected
   - extension guard behavior
2. `getDependencies`
   - multi-file imports / transitive graph
3. `getParameters`
   - default/empty schema behavior
4. `createGeometry`
   - happy path
   - multi-file path
   - runtime error handling
   - syntax error handling
5. `exportGeometry`
   - supported format success
   - unsupported format failure

Use shared utilities:

- `createTestWorker`
- `createTestGeometry`
- `createGeometryTestHelpers`

### 5.2 Smoke exports

Update:

- `packages/kernels/src/testing/smoke-esm.test.ts`

Add import assertion for new module.

### 5.3 Validation commands

Run at minimum:

- `pnpm nx test kernels --watch=false`
- `pnpm nx lint kernels`
- `pnpm nx typecheck kernels`

Then run project-level commands for any touched app/lib:

- `pnpm nx test ui --watch=false` (if UI docs/config touched heavily)
- `pnpm nx lint ui`
- `pnpm nx typecheck ui`
- `pnpm nx test api --watch=false` (if API prompt configs changed)

---

## 6) Documentation Update Matrix

When adding a first-party kernel, update all kernel lists:

Primary docs:

- `apps/ui/content/docs/(kernels)/index.mdx`
- `apps/ui/content/docs/(kernels)/guides/choosing-a-kernel.mdx`
- `apps/ui/content/docs/(kernels)/api/kernels.mdx`
- `apps/ui/content/docs/(kernels)/concepts/kernel-selection.mdx`
- `apps/ui/content/docs/(kernels)/concepts/plugin-system.mdx`
- `apps/ui/content/docs/(kernels)/guides/bundler-configuration.mdx` (if JS-family kernel)

Type-table props:

- `apps/ui/content/docs/(kernels)/api/props/kernels.ts` (export options type)

Architecture/internal docs:

- `docs/kernel-architecture-policy.md` (priority, package exports, kernel tables)

---

## 7) Definition of Done

A kernel integration is complete only if:

- [ ] Kernel module implemented with all lifecycle methods.
- [ ] Factory + entry + presets + package exports are wired.
- [ ] UI default kernel options include the kernel (if product-facing).
- [ ] Kernel catalog includes new selectable option (if product-facing).
- [ ] API prompt config is exhaustive for new `KernelProvider`.
- [ ] Comprehensive kernel tests pass.
- [ ] Smoke import test includes kernel module.
- [ ] Kernel documentation lists are updated everywhere relevant.
- [ ] Lint, typecheck, and tests pass for all touched projects.

---

## 8) Common Failure Patterns

- Missing `publishConfig.exports` entry causes package subpath breakage.
- Adding `KernelProvider` without updating exhaustive `Record<KernelProvider, ...>` maps.
- Catch-all kernel placed before specific kernels (selection regressions).
- JS/TSX kernels lacking bundler configuration or JSX options.
- `getDependencies` returning incomplete graphs, causing stale cache/rerender bugs.
- Tests only covering happy path and missing runtime/syntax failure branches.
