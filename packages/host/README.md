# @taucad/host

Node-only orchestration for Tau's experimental outbound remote-compute daemon. Most users run it through `@taucad/cli`; the package has no executable and does not compose CAD plugins.

```bash
pnpm add -g @taucad/cli
tau serve --trust-projects
```

On first launch, the CLI prints a short pairing code and a Tau verification URL. Approving the code binds the machine to the signed-in account. The daemon then keeps an outbound authenticated WebSocket open to the Tau API; it does not expose a LAN listener or fixed port.

For every accepted browser session, the parent supervises its own CLI-composed runtime child on an authenticated ephemeral loopback socket and frame-splices the relay's `/runtime` and `/fs` routes into it. Project files remain browser-owned and are requested through the existing runtime filesystem bridge. The agent's geometry tools get one runtime child per root they work in, so sessions and roots never share a JavaScript realm, and a hung model or a child exit affects only its own.

## Library API

```typescript
import { startHostDaemon } from '@taucad/host';

const daemon = startHostDaemon({
  relayUrl: new URL('https://api.tau.new'),
  runtimeHost: { modulePath: '/opt/tau/host-runtime-child.mjs' },
  maxSessions: 1,
  onEvent: console.log,
});

await daemon.ready;
await daemon.close();
```

`@taucad/host/runtime-host` exports `serveHostRuntime()` for the supervised child. The host always binds `127.0.0.1:0` and requires the random parent-supplied bearer token on every upgrade.

## Project identity and native writes

`tau.json` is an id-free authored declaration using `https://tau.new/schemas/tau-v1.json`.
Native admission generates `.tau/project.json` once and retains its identity across later opens.
A validated prerelease manifest is converted in the current working tree while keeping its existing project ID;
historical Git objects and cloud repository IDs are preserved.

`openProjectRevisions()` is asynchronous. The synchronous `createProjectRevisions()`,
`createProjectRevisionPort()`, and `createProjectHost()` constructors require an already resolved `projectId`.
Explicitly serving an empty folder creates its identity without creating `tau.json`.

Native mutations use one exclusive filesystem writer. A CLI mutation against a workspace already owned
by a running daemon is refused with “This filesystem authority already has a writer.” Stop that daemon
before retrying the CLI mutation. After admission, read-only revision queries do not claim the writer;
opening a new root can still initialize its identity sidecar. Sharing an existing daemon's transport
with standalone CLI commands is a separate capability.

## Credentials and lifecycle

The durable device credential is written atomically with mode `0600` under the platform Tau config directory (`TAU_CONFIG_DIR` overrides it). Only its SHA-256 hash is stored by the API. Browser sessions and route grants are short-lived, route-bound, and one-use. Revocation closes the control connection and all live data routes.

Control reconnect uses bounded exponential backoff. An interrupted runtime session is never resumed in place: the browser creates a fresh session and runtime client. Capacity defaults to one and excess offers are rejected before data routes are issued.

## Security status

Remote project code executes as native Node ESM in the runtime child. The child receives no device credential or parent environment and uses Node's permission model to deny host filesystem access, process spawning, workers, addons, WASI, and the inspector. Node network access remains unrestricted, and Node's permission model is not a malicious-code sandbox.

Native kernel workers (build123d, PicoGK) are never spawned by the runtime child. It asks its daemon over the IPC channel, and the daemon starts the worker only from a closure sealed in the payload store, after verifying its digests, inside the OS sandbox with no network; any other launch is refused. The sandbox grants the worker only a directory the daemon creates for that child outside its temp directory (beside the payload store), which holds the child's temp directory and which neither the child nor a worker can replace. A daemon removes the directories a stopped daemon left there when it starts its first such child.

This package is therefore restricted to explicitly trusted projects. Public/general availability is blocked until an OS/container sandbox contains filesystem, environment, network, native-code, process, and resource-exhaustion attacks on every supported daemon OS.

## Compatibility

- Node `>=24`
- Exact Tau runtime build parity; version skew is a visible failure
- Browser traffic uses the public WSS relay rather than direct localhost
- Chromium, Firefox, and automated WebKit have focused remote-transport coverage
- Safari support requires a separate branded `safaridriver` release run; WebKit is not called Safari

## Live ACP acceptance

`pnpm nx run host:test:acp-live` spends the operator's Codex and Claude quota
and requires both pinned adapters by default. Select a subset with
`TAU_ACP_LIVE_AGENTS=codex` and override an adapter model with
`TAU_ACP_LIVE_CODEX_MODEL=<model>` or `TAU_ACP_LIVE_CLAUDE_MODEL=<model>`.
Every selected unavailable adapter fails explicitly.

See the [implementation charter](../../docs/research/tau-host-daemon-remote-kernel-implementation-charter.md) for architecture, acceptance evidence, and remaining promotion gates.
