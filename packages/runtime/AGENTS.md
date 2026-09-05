# CAD runtime

`@taucad/runtime` owns authoring contracts, runtime/client lifecycle, transport-neutral orchestration, rooted-filesystem adapters, artifact finalization, and plugin registration. Concrete kernels, transcoders, bundlers, and middleware live under `packages/plugins`. Follow `docs/policy/runtime-architecture-policy.md`, `docs/policy/runtime-api-policy.md`, `docs/policy/library-api-policy.md`, `docs/policy/filesystem-policy.md`, and `docs/policy/event-fanout-policy.md`.

## Runtime invariants

- Transports own wire capabilities, filesystem handles, shared-memory delivery, and worker URLs. Runtime core consumes behavioral transport contracts without branching on diagnostic capability descriptors.
- Expose framework worker/host helpers and package metadata through explicit package-export subpaths. The application owns its executable worker module URL and passes `createWorker` or `url`; do not hide a bundler-specific default URL in the library graph.
- A connected `RuntimeClient` owns timeout control through synchronous `setRenderTimeout`; render options remain operation data and timeout updates never enter the worker protocol.
- Runtime-client production event fan-out composes `Topic<E>`. Keep the unified typed event map exhaustive across geometry, progress, parameters, diagnostics, and kernel-selection events.
- Supply runtime code one opaque writable rooted filesystem with local paths. Trusted filesystem composition owns global routes and authorization.
- An intentional geometry-free result succeeds with the canonical zero-mesh GLB from `@taucad/geometry-core`. Reserve `NO_RENDER_GEOMETRY` for an adapter that emits no public artifact.
- Preserve schema inference from plugin authoring through render and export. Shared geometry naming and GLB writing live in `packages/core/geometry`; reusable black-box tests live in `packages/runtime-testing`. The former `src/utils/export-glb.ts` and `@taucad/runtime/testing` surfaces are gone.
- Derive manifest and result data from one canonical schema or source, and do not add compatibility shims for consumers that do not exist.
- Keep asyncness visible: value-less async methods return `Promise<void>`; avoid promise-consuming IIFEs, settled-value `Promise.resolve` wrappers, and unused `void` expressions. Give module-scope callbacks names when they carry domain meaning.
- Runtime SSR asset discovery is package-root scoped, bounded before literal stripping, and never scans or rewrites application TypeScript.
- Keep the runtime ESM-only. Put environment-selected module identifiers in named `taucad:` constants rather than scattering string literals.

Validate with `pnpm nx lint runtime`, `pnpm nx test runtime --watch=false`, `pnpm nx typecheck runtime`, `pnpm nx build runtime`, and `pnpm nx run runtime:audit-public-surface` when exports change.
