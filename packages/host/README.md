# @taucad/host

Node-only orchestration for Tau's experimental outbound remote-compute daemon. Most users run it through `@taucad/cli`; the package has no executable and does not compose CAD plugins.

```bash
pnpm add -g @taucad/cli
tau serve --trust-projects
```

On first launch, the CLI prints a short pairing code and a Tau verification URL. Approving the code binds the machine to the signed-in account. The daemon then keeps an outbound authenticated WebSocket open to the Tau API; it does not expose a LAN listener or fixed port.

For every accepted browser session, the parent supervises a CLI-composed runtime child on an authenticated ephemeral loopback socket and frame-splices the relay's `/runtime` and `/fs` routes into it. Project files remain browser-owned and are requested through the existing runtime filesystem bridge.

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

## Credentials and lifecycle

The durable device credential is written atomically with mode `0600` under the platform Tau config directory (`TAU_CONFIG_DIR` overrides it). Only its SHA-256 hash is stored by the API. Browser sessions and route grants are short-lived, route-bound, and one-use. Revocation closes the control connection and all live data routes.

Control reconnect uses bounded exponential backoff. An interrupted runtime session is never resumed in place: the browser creates a fresh session and runtime client. Capacity defaults to one and excess offers are rejected before data routes are issued.

## Security status

Remote project code executes as native Node ESM in the runtime child. The child receives no device credential or parent environment and uses Node's permission model to deny host filesystem access, process spawning, workers, addons, WASI, and the inspector. Node network access remains unrestricted, and Node's permission model is not a malicious-code sandbox.

This package is therefore restricted to explicitly trusted projects. Public/general availability is blocked until an OS/container sandbox contains filesystem, environment, network, native-code, process, and resource-exhaustion attacks on every supported daemon OS.

## Compatibility

- Node `>=24`
- Exact Tau runtime build parity; version skew is a visible failure
- Browser traffic uses the public WSS relay rather than direct localhost
- Chromium, Firefox, and automated WebKit have focused remote-transport coverage
- Safari support requires a separate branded `safaridriver` release run; WebKit is not called Safari

See the [implementation charter](../../docs/research/tau-host-daemon-remote-kernel-implementation-charter.md) for architecture, acceptance evidence, and remaining promotion gates.
