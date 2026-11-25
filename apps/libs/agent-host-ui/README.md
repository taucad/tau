# @taucad/agent-host-ui

The agent-host adapters of the Tau UI app: the agent protocol (`@taucad/chat`, `@taucad/agent-host`, `@taucad/agent-tools`, `@taucad/agent-observability`, `@taucad/skills`) implemented over the app's domains, for the agent-host and file-manager workers. Private and source-consumed (`scope:ui type:app-lib`, layer L3 of the UI app library layering): `apps/ui` imports it; it imports the foundation (`ui-core`), the feature libraries, the agent protocol and the domain packages it adapts, never `apps/ui` and never a composition library.

The worker entries that compose these adapters (`workers/agent-host.impl`, `machines/file-manager.worker`) stay in `apps/ui`.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: the agent-host and file-manager workers and the RPC handlers in `apps/ui`.

| Subpath                           | Contents                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `./lib/large-object-guard`        | The agent's filesystem and kernel clients while a project's large objects download: reads, writes and kernel runs wait |
| `./workers/agent-host-evidence`   | The browser project host's agent-observability evidence over its own rows and the project's IndexedDB queue            |
| `./workers/agent-host-placement`  | The resident turn placement: attempt identities and settlement listeners kept across placement-channel replacement     |
| `./workers/agent-host-revisions`  | The `history` tool's `RpcRevisionsClient` over one port into the file-manager worker's revision root                   |
| `./workers/system-skills-overlay` | The system skill bundles as a composed-view overlay, with their resource cache stats                                   |

The kernel closure the guards gate on (`kernelClosure`, `closureHasPending`) is `@taucad/ui-core/lib/kernel-closure`, which the project's availability reads too.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
