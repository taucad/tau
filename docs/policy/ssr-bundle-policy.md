---
title: 'SSR bundle policy (`apps/ui`)'
description: Avoid pulling client-only CAD/kernel/Three.js graphs into the Netlify SSR function bundle.
status: active
created: '2026-05-06'
updated: '2026-05-21'
related:
  - docs/research/ssr-bundle-audit.md
  - docs/research/netlify-production-performance-audit.md
---

# SSR bundle policy (`apps/ui`)

The UI SSR bundle size directly drives Netlify Function cold-start latency. Keep the server graph free of WASM kernels, worker assets, and decorative WebGL unless a route **must** render them on the server.

## Rules

1. **No static value imports from `@taucad/runtime` in modules reachable from generic SSR entry paths** (e.g. shared machines, `root` loaders). Use `import type` for types only. Resolve `createRuntimeClient`, `fromChannelFs`, and similar entry points via **dynamic `import()` inside browser-only actors** (XState `fromPromise` / `fromSafeAsync` callbacks) or inject factories from route-local client shells.
2. **`'use client'` is not SSR-safe tree-shaking.** It does not remove the module from the SSR graph. For MDX and route components that touch kernels or Three.js, use `lazy()` + `ClientOnly` at the **MDX component map** or route shell — not only `<ClientOnly>` wrappers.
3. **Heavy kernel option factories** (`createRuntimeClientOptions`, default kernel arrays) live in modules that are imported **only** from client-scoped route shells or lazy chunks — never from hooks imported by marketing/docs SSR paths.
4. **Vite `ssr.external`** includes **only** `@taucad/runtime` and `@taucad/openscad` — the workspace packages whose kernel/worker plugins use static `new URL('./<file>.js', import.meta.url)` patterns that would cascade dozens of dead SSR chunks if bundled. All other `@taucad/*` dependencies used from SSR **bundle** into `build/server` (Node Function hosts only; edge runtimes remain out of scope). When adding a new first-party package, run the audit in `vite.config.ts` before widening `external`.
5. **Server source maps** must not ship in the function artifact. Use `react-router build --sourcemapClient hidden` without forcing `--sourcemapServer` (Rolldown rejects boolean `false` for `build.sourcemap` on the SSR environment).
6. **`rollup-plugin-visualizer`** runs only when `STATS=1` is set at build time.
7. **`monaco-editor` runtime is quarantined to `*.client.{ts,tsx}` modules.** `monaco-editor/esm/*` transitively imports `codicon/codicon.css`, which Node's ESM loader cannot resolve during `react-router build`. Any static value import of `monaco-editor` (or `monaco-editor/esm/*`) MUST live in a `*.client.ts` / `*.client.tsx` file — React Router v7 replaces those modules with empty exports during the SSR build, terminating the static graph at the boundary. Type-only imports (`import type * as Monaco from 'monaco-editor'`) are erased at compile time and remain unrestricted. The hook/route/component that consumes the `.client` module must perform the call inside `useEffect` (or similar browser-only callback) since the binding is `undefined` on the server.

## Enforcement

- Nx target **`pnpm nx run ui:size`** (after `ui:build`) — see `apps/ui/scripts/check-ssr-bundle-budget.mts`. Ratchets `build/server` + `index.js` as the bundle shrinks.
- Code review: any new `from '@taucad/runtime'` value import in `apps/ui/app/machines/` or `apps/ui/app/hooks/` requires an explicit SSR justification or refactor.
- **`no-restricted-imports`** (configured in [eslint.config.mjs](../../eslint.config.mjs)) forbids static value imports of `monaco-editor` / `monaco-editor/*` from any `apps/ui/app/**` source file that is not `*.client.{ts,tsx}`, `*.worker.ts`, or a test. `allowTypeImports: true` keeps `import type` legal everywhere.

## See also

- Evidence and measurements: `docs/research/ssr-bundle-audit.md`
- CDN / TTFB context: `docs/research/netlify-production-performance-audit.md`
