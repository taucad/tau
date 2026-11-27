---
title: 'SSR bundle policy (`apps/ui`)'
description: Avoid pulling client-only CAD/kernel/Three.js graphs into the Netlify SSR function bundle.
status: active
created: '2026-05-06'
updated: '2026-11-16'
related:
  - docs/research/ssr-bundle-audit.md
  - docs/research/netlify-production-performance-audit.md
---

# SSR bundle policy (`apps/ui`)

The UI SSR bundle size directly drives Netlify Function cold-start latency. Keep the server graph free of WASM kernels, worker assets, and decorative WebGL unless a route **must** render them on the server.

## Rules

1. **No static value imports from `@taucad/runtime` in modules reachable from generic SSR entry paths** (e.g. shared machines, `root` loaders). Use `import type` for types only. Resolve `createRuntimeClient`, `fromFileSystemBridge`, `openFileSystemBridge`, and similar browser/runtime entry points via **dynamic `import()` inside browser-only actors** (XState `fromPromise` / `fromSafeAsync` callbacks) or inject factories from route-local client shells.
2. **`'use client'` is not SSR-safe tree-shaking.** It does not remove the module from the SSR graph. For MDX and route components that touch kernels or Three.js, use `lazy()` + `ClientOnly` at the **MDX component map** or route shell — not only `<ClientOnly>` wrappers.
3. **Heavy runtime definitions** (`defineRuntime(...)`, default kernel arrays, middleware arrays, bundler arrays) live in worker files or modules imported **only** from client-scoped worker entries — never from hooks imported by marketing/docs SSR paths.
4. **The server environment's `resolve.external`** (`environments.ssr.resolve.external`, from `uiSsrOptions` in `apps/ui/vite.config.ts`; the Environment API build does not read top-level `ssr.external`) includes **only** the packages whose kernel/worker plugins use static `new URL('./<file>.js', import.meta.url)` patterns that would cascade dozens of dead SSR chunks if bundled: `@taucad/runtime`, `@taucad/openrscad` and `@taulabs/openrscad-engine`. All other `@taucad/*` dependencies used from SSR **bundle** into `build/server` (Node Function hosts only; edge runtimes remain out of scope). When adding a new first-party package, run the audit in `vite.config.ts` before widening `external`. Known gap: `@taucad/runtime`'s package exports point at TypeScript source, which Vite never externalizes, so it is bundled despite the list (on React Router 7's legacy build as well); `check-server-output` therefore asserts only `@taucad/openrscad`.
5. **Server source maps** must not ship in the function artifact. `ui:build` builds them hidden (`react-router build --sourcemapClient hidden --sourcemapServer hidden`; Rolldown rejects boolean `false` for `build.sourcemap` on the SSR environment), then moves every `.map` out of `build/server` into `build/server-sourcemaps`, so the Netlify function never contains one. `ui:sourcemaps` restores them only to inject debug ids and upload them to Sentry, and deletes them again whether or not the upload succeeded.
6. **`rollup-plugin-visualizer`** runs only when `STATS=1` is set at build time.
7. **Editor runtime follows rendered source-pane admission.** `code-editor.client.tsx` is a runtime-free lazy boundary. Its rendered child loads CodeMirror, and language syntax/service modules remain behind that child's dynamic imports. Keep editor-only JavaScript, styles, parsers, workers and declarations out of server rendering, route/module preloads, viewer-only paths and service-worker precache. Type-only imports are erased and remain unrestricted. A `.client` suffix alone does not prove that browser route prefetch avoids an editor fetch.

## Enforcement

- Nx target **`pnpm nx run ui:size`** (after `ui:build`) — see `apps/ui/scripts/check-ssr-bundle-budget.mts`. Ratchets `build/server` + `index.js` as the bundle shrinks.
- Nx target **`pnpm nx run ui:check-server-output`** (and `docs:check-server-output`) — see `apps/ui/scripts/check-server-output.mts`. No server output of the web, desktop, `tau serve` or docs build holds a `.wasm` file, a worker bundle or a file also in its `client/assets`, or names an asset URL (`new URL('./<file>', import.meta.url)`) that resolves in neither output; the web server build imports `@taucad/openrscad` by name (rule 4). Construct workers in browser-only code (`new Worker(new URL(…, import.meta.url))`, which Vite bundles for the client only, or a `.client` module); a `?worker` import reachable from the server graph emits the worker bundle into `build/server`. Both targets run in CI's build lane.
- Code review: any new `from '@taucad/runtime'` value import in `apps/ui/app/machines/` or `apps/ui/app/hooks/` requires an explicit SSR justification or refactor.
- Production import/preload graph checks and browser request capture must prove zero editor-only requests before a code pane is admitted, including hover, idle, service workers and hidden mobile tabs. Follow [language contribution policy](language-contribution-policy.md).

## See also

- Evidence and measurements: `docs/research/ssr-bundle-audit.md`
- CDN / TTFB context: `docs/research/netlify-production-performance-audit.md`
