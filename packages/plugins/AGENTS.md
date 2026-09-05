# Runtime plugins

Each package here is a standalone runtime capability authored with `@taucad/runtime`. Keep concrete kernels, transcoders, bundlers, middleware, native assets, and option schemas in their owning plugin. Follow `docs/policy/runtime-architecture-policy.md`, `docs/policy/runtime-api-policy.md`, and `docs/policy/library-api-policy.md`.

## Plugin boundaries

- Keep kernel plugins independently extractable. Use dependency-light helpers from `packages/core` only when they are truly backend-neutral; do not create cross-kernel schema barrels.
- Keep format export schemas self-contained and preserve generic type inference through render and export. Image projection is per export; batch image views carry only view identity and angles.
- Bump a kernel's version when its serialized native-handle semantics change because kernel id and version participate in cache identity.
- Use `packages/core/geometry` for canonical empty GLBs and generated fallback shape names. Preserve authored names.
- When repairing a user-selected JSCAD model, keep the implementation in JSCAD and use valid JSCAD topology patterns.
- Put reusable black-box plugin-author tests in `@taucad/runtime-testing`; keep owner-specific white-box fixtures local.
- Keep generated C++ binding logic generic at the type-system level. Infer from templates, typedefs, inheritance, and signatures rather than enumerating domain classes.
- Emit provider-neutral runtime issue codes at the kernel source and put kernel identity in `details.producer`.
- For plugin-owned generated WASM assets, keep `src/**/wasm/` payloads ignored and populate them through the package's Nx `copy-assets` target and `copy-files-from-to.cjson`; update the target and manifest together.
- Optional upstream checkouts under `repos/` are maintenance evidence, never install or runtime dependencies. Follow the Tau-side references under `docs/architecture/dependency-maintenance/` and use the `repos` skill.

Inspect the plugin's actual Nx project name and run its declared lint, test, typecheck, build, browser, native, and package checks relevant to the change.

Keep each `*.plugin.ts` entrypoint thin: register role-specific `*.kernel.ts`, `*.transcoder.ts`, bundler, or middleware definitions through `definePlugin`. Detection, builtin modules, extensions, worker/native URLs, and conversion edges belong in the role-specific definition that owns them rather than being duplicated in the plugin entrypoint.
