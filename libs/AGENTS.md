# Shared libraries

This subtree owns dependency-light capabilities shared by applications and public packages. Keep library boundaries narrow, import documented subpaths directly, and do not add convenience root barrels. Nothing here may depend on `apps/libs/**`. Follow the root `AGENTS.md`, `docs/policy/library-api-policy.md`, and `docs/policy/typescript-policy.md`.

## Routes

- Chat wire contracts, prompts, and tool schemas: `libs/chat/AGENTS.md` and `docs/policy/chat-request-config-policy.md`.
- Filesystem authority, mounts, mutations, and watches: `libs/filesystem/AGENTS.md` and `docs/policy/filesystem-policy.md`.
- Production fan-out: compose `Topic<E>` from `libs/events` and follow `docs/policy/event-fanout-policy.md`; do not hand-roll handler collections.
- IDs: import `generatePrefixedId` from `@taucad/utils/id` and use typed prefixes from `@taucad/types/constants` where the domain requires one.
- Vite's Oxc SSR compatibility seam is `oxcRuntimeEsm` in `libs/vite/src/oxc-runtime-esm.vite-plugin.ts`. Keep workers on worker-safe package subpaths and keep runtime SSR asset discovery inside its package plugin.

Inspect `pnpm nx show project <project>` and run its lint, test, and typecheck targets; run build when the project declares it.
