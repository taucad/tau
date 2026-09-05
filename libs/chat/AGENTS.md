# Chat contracts

`libs/chat` owns shared messages, RPC definitions, prompts, CAD-tool contracts, and schemas. The agent-config wire registry starts at `src/schemas/agent-config.schema.ts`. API request envelopes, provider SDKs, execution, and application state stay in their host layers. Follow `docs/policy/chat-request-config-policy.md`, `docs/policy/context-engineering-policy.md`, `docs/policy/library-api-policy.md`, and `docs/policy/typescript-policy.md`.

## Contract rules

- Treat exported schemas as wire contracts. Keep Zod schemas JSON-Schema-convertible, derive TypeScript types from their canonical schemas, preserve discriminators, and update every producer and consumer together.
- Required metadata remains required at every caller. Do not add silent defaults after validation.
- Tool descriptions point to canonical input schemas instead of repeating their validation rules. Use negative guidance only for a costly, non-obvious misuse.
- Kernel tool descriptions remain byte-identical across kernels; cached wrappers may differ only in kernel-specific error routing through `getKernelConfig`.
- Preserve filesystem metadata such as text `lineCount` and binary `contentKind` through RPC and tool schemas; normalize workspace-root tool paths at the input boundary.
- RPC filesystem keys are project-relative and use `''` for the selected root. Normalize tool-input aliases and interrupted payloads in the shared schema/host boundary; UI projections do not repair model inputs.

Validate with `pnpm nx lint chat`, `pnpm nx test chat --watch=false`, and `pnpm nx typecheck chat`.
