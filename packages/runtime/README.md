# @taucad/runtime

Multi-kernel CAD runtime that powers [tau.new](https://tau.new). Build a
client, send a command, consume the result.

## Quick start

`createNodeClient()` provides the bundled runtime, transport, and in-memory
filesystem. Its first command connects the runtime and returns an ordered,
non-empty export artifact set.

```typescript
import { createNodeClient } from '@taucad/runtime/node';

const client = await createNodeClient();
const result = await client.export('glb', {
  source: {
    files: {
      'main.ts': 'import { makeBaseBox } from "replicad";\nexport default () => makeBaseBox(10, 20, 30);',
    },
  },
});

if (!result.success) throw new Error(`Export failed: ${result.issues[0]?.message}`);
console.log(`Exported ${result.data[0].name}: ${result.data[0].bytes.byteLength} bytes`);
client.terminate();
```

## The lifecycle

Every consumer — UI panes, the CLI, RPC handlers, benchmarks, AI agents —
follows the same shape:

1. **Construct** — `createRuntimeClient(options)` produces an inert client.
   No network, no WASM, and the client itself never allocates a
   `SharedArrayBuffer` — SAB lifecycle is owned by the active
   {@link RuntimeTransportClient} (in-process, dedicated worker, or remote).
   The client is in `lifecycleState: 'unconnected'`.
2. **Command** — `client.render`, `client.updateParameters`,
   `client.setOptions`, and `client.export` drive the worker. Each
   command-shaped method (apart from `export`) returns a `RenderOutcome`
   so consumers can branch on supersession without try/catch flow control.
   The first command call lazy-connects the transport and (for inline
   `source.files` input) auto-provisions an in-memory filesystem.
   `client.setRenderTimeout(renderTimeout)` is different: it is a synchronous,
   connected-client control-plane setter for subsequent renders and never
   sends render intent to the worker.
3. **Consume** — `client.on('geometry' | 'error' | 'progress' | …, handler)`
   subscribes to the single ordered event stream the worker produces.
   Subscriptions auto-dispose on `client.terminate()`.

```mermaid
flowchart LR
  c["createRuntimeClient"] --> command["render / updateParameters / setOptions / export"]
  c --> control["setRenderTimeout"]
  command --> consume["client.on('geometry')"]
  consume --> command
  consume --> term["client.terminate"]
```

`client.connect()` advances the lifecycle without arguments; every
host-wiring concern (SAB pools, FS bridges, worker URLs, deferred filesystem
attachment) is owned by the wired {@link TransportPlugin} callable passed at
construction (`{ transport: webWorkerTransport({ ... }) }`). Opaque
filesystems are produced by the public factories
(`fromMemoryFs`, `fromNodeFs`, `fromBrowserFs`, `fromFsLike`,
`fromFileSystemBridge`); raw `MessagePort`s are not part of the public surface.
See [Embedding in a Host](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/guides/embedding-in-a-host.mdx).

## Autonomous render loop (editors and live UIs)

`render` hands the worker a `(source, parameters)` pair and lets it own
re-rendering. A newer public preview command or an autonomous watched-filesystem
preview can supersede an in-flight call, whose `RenderOutcome` resolves with
`{ superseded: true }`. Subscribe to `geometry` for the authoritative selected
preview; an autonomous successor has no second public outcome. For inline
`source.files` input the runtime auto-provisions the filesystem on the first call.

```typescript
import { createRuntimeClient } from '@taucad/runtime';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { presets } from '@taucad/runtime/presets';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';

const runtime = presets.all();
const client = createRuntimeClient({
  transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
});

const unsubscribe = client.on('geometry', (result) => {
  if (!result.success) {
    console.error('render failed', result.issues);
    return;
  }
  console.log('fresh geometry', result.data.content.byteLength, 'bytes');
});

await client.render({
  source: {
    files: {
      'main.ts':
        'import { drawCircle } from "replicad";\nexport default () => drawCircle(10).sketchOnPlane().extrude(20);',
    },
  },
  parameters: {},
});

await client.updateParameters({ height: 40 });

unsubscribe();
client.terminate();
```

For viewers that watch a real filesystem (Node fs, OPFS, the browser FM
worker), pass it once at construction so every `render({ source: { path } })` call
runs against it through the transport:
`createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) })`.

## Lifecycle states

`client.lifecycleState` is the single source of truth for what the client can
do right now:

| State         | Reachable methods                             | Notes                                                                                                                           |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `unconnected` | all public methods except `setRenderTimeout`  | The default after construction. Command methods (`render`/`updateParameters`/`setOptions`/`export`) lazy-connect on first call. |
| `connecting`  | `lifecycleState`                              | Concurrent command calls await the in-flight handshake.                                                                         |
| `connected`   | every public method                           | Steady state.                                                                                                                   |
| `terminated`  | `lifecycleState`, `terminate()`, `shutdown()` | All other methods throw `RuntimeTerminatedError`. `shutdown()` is idempotent.                                                   |

Connect failures leave the client in `unconnected` so retry is safe.
`connect()` is one-shot per client lifetime: once `connected`, subsequent
`connect()` calls return the existing connection. To bind a single client to
a different filesystem, `terminate()` (or `await shutdown()`) it and create a
fresh one. Filesystem source commands (i.e. `render({ source: { path } })`)
on a client whose transport has no filesystem bridge throw
`RuntimeNotConnectedError`.

### Termination

Two complementary termination methods are exposed:

- `terminate()` — synchronous, abrupt. Stops the worker immediately,
  rejects every in-flight intent with `RuntimeTerminatedError`, and
  releases the kernel-host port. Use this for hard-stop / unmount paths.
- `shutdown({ drain? })` — asynchronous, cooperative. Awaits in-flight
  intents to settle when `drain: true`, awaits one acknowledged worker cleanup
  behind the serialized operation lane, then closes transport-owned resources.
  `drain: false` is a hard close and makes no remote-cleanup guarantee. Use a
  draining shutdown for orderly server/test teardown. Both methods are idempotent.

## Render timeouts and cancellation

Worker-backed clients can enforce a wall-clock deadline for each preview. The
matching Promise rejects locally with `RenderTimeoutError`; it does not wait for
the worker to acknowledge cancellation, so the same contract holds without
`SharedArrayBuffer`.

```typescript
import { createRuntimeClient, isRenderTimeoutError } from '@taucad/runtime/client';
import { createWebWorkerClientOptions } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime.worker';

const clientOptions = createWebWorkerClientOptions<typeof runtime>({
  createWorker: () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
  renderTimeout: 60_000,
});

const client = createRuntimeClient<typeof runtime>(clientOptions);

try {
  await client.render({ source: { files: { 'main.ts': 'export default () => model;' } } });
} catch (error) {
  if (!isRenderTimeoutError(error)) throw error;
  console.error(error.message);
}
```

After deadline settlement, the runtime targets only the timed-out render and
waits for bounded cooperative recovery. A responsive isolated host is retained.
An unresponsive host is terminated; work queued during recovery rejects with
`RuntimeTerminatedError` and `causeKind === 'render-timeout'`. Construct a new
client from the same module-scope options spec before retrying.

`setRenderTimeout(renderTimeout)` changes only later previews. Milliseconds.
Zero disables it. Same-isolate `inProcessTransport` rejects a non-zero timeout
because synchronous work can block the deadline timer itself, regardless of SAB
availability.

Plugin authors receive the same fresh operation signal through
`KernelRuntime.signal`, `KernelMiddlewareRuntime.signal`,
`MiddlewareDependencyRuntime.signal`, and `BundlerRuntime.signal`:

```typescript
import { defineMiddleware } from '@taucad/runtime/middleware';

export const remoteCalibration = defineMiddleware({
  id: 'remote-calibration',
  name: 'Remote calibration',
  async wrapCreateGeometry(input, handler, { signal }) {
    const response = await fetch('/api/calibration', { signal });
    const parameters = { ...input.parameters, ...(await response.json()) };
    return handler({ ...input, parameters });
  },
});
```

Pass the signal to cancellable platform APIs and never retain it after the
operation. Do not use `Promise.race()` to claim that mutating work stopped while
it continues in the background.

See [Configure Render Timeouts](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/guides/render-timeouts.mdx)
and [Cooperate with Cancellation](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/guides/cooperate-with-cancellation.mdx).

## Filesystem ownership

A runtime path identifies a file within the filesystem supplied to one client.
Normalized plugin paths begin with `/` (`/main.ts`, `/.tau/cache/**`,
`/node_modules/**`), but that slash names the supplied filesystem's root rather
than the host operating system's root. Consumer `source.path` accepts relative
or `/`-prefixed input; inline `source.entry` selects a key in `source.files`.
The filesystem authority chooses and confines a project root; kernels,
bundlers, middleware, and headless services receive no project id,
authority-global path, grant, or authorization callback. Rooted filesystems
remain writable so caches and generated files persist inside the project tree.

See [Path Namespaces](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/concepts/path-namespaces.mdx)
for consumer, plugin-author, and host-adapter examples.

Watch-capable rooted filesystems own precise-versus-reset event semantics. The
worker acknowledges entry observation before discovery, replaces its complete
multi-path subscription with overlap-and-swap, and keeps current-preview watch
ownership independent from successful artifact publication. `fromNodeFs` is
watch-capable through one non-recursive `fs.watch` per parent directory of the
dependency set. The remaining watcherless adapters (`fromMemoryFs`,
`fromBrowserFs`, arbitrary `fromFsLike`) reread volatile file state at each
explicit source-bearing operation while retaining kernel initialization and
persistent project-local caches. Exact-source exports use request-local
ownership and cannot replace the active preview.

## Transports

`@taucad/runtime/transport` ships pluggable {@link RuntimeTransportPlugin}
implementations. A transport plugin is the client-side declaration that owns
channel construction, SAB allocation, abort signalling, geometry pool
resolution, and FS bridging:

- `inProcessTransport` — same realm; lowest latency. The runtime worker
  runs on the calling thread over an internal `MessageChannel`.
- `webWorkerTransport` — dedicated browser `Worker`. The plugin spawns
  the worker, posts the host port across `postMessage`, and forwards
  lifecycle errors as channel-level `lb` (lifecycle-bye) frames so the
  client surfaces typed termination errors.
- `nodeWorkerTransport` — Node.js `worker_threads`. Uses
  `MessageChannelMain`-style port handoff so the host and worker share
  the same `Port<unknown>` shape as the browser. The application supplies
  the worker entry URL because only its build owns that executable module.
- `webSocketTransport` — a kernel host in another process or on another
  machine. The client is browser-safe (`@taucad/runtime/transport/websocket`);
  the Node server half is `webSocketHost`
  (`@taucad/runtime/transport/websocket-host`), which serves one kernel worker
  per connection. Geometry is delivered by `copy` and aborts travel as wire
  notifications — a socket carries neither transferables nor a
  `SharedArrayBuffer`.

### WebSocket transport

The host owns the project filesystem (`host-local`):

```typescript
import { createRuntimeWorker } from '@taucad/runtime/worker';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { webSocketHost } from '@taucad/runtime/transport/websocket-host';

const host = webSocketHost({
  worker: () => createRuntimeWorker({ runtime }),
  fileSystem: fromNodeFs('/srv/projects/demo'),
  allowedOrigins: ['https://app.example.com'],
  host: '0.0.0.0', // defaults to 127.0.0.1, which a remote browser cannot reach
  port: 8080,
});
await host.ready;
```

```typescript
import { createRuntimeClient } from '@taucad/runtime';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';

const client = createRuntimeClient({
  transport: webSocketTransport({ url: 'ws://127.0.0.1:8080' }),
});
```

Or the consumer keeps the filesystem and serves it to the remote kernel
(`bridged`). Start the host **without** a `fileSystem`, and pass one on the
client; the transport opens a second socket (`/fs`) on which the consumer is
the bridge server, so watch events and the kernel's cache writes cross the
wire. There is no multiplexer — the two sockets are correlated by a private
session id.

```typescript
const client = createRuntimeClient({
  transport: webSocketTransport({ url: 'ws://127.0.0.1:8080', fileSystem: fromNodeFs(projectRoot) }),
});
```

`allowedOrigins` is an exact-match allowlist checked at the HTTP upgrade. A
request carrying no `Origin` (any Node client) is admitted, so the default
`[]` denies every browser. Remote hosts are bound to the same build: the wire
hello carries `protocolVersion` and a mismatch is rejected at connect.

The host can also share someone else's server. `server` attaches to an
existing `http.Server` (or `https.Server`) and `pathPrefix` moves both routes
under a path — matched exactly as `${pathPrefix}/runtime` and
`${pathPrefix}/fs`. On a server it does not own, every other upgrade is
**ignored** rather than refused, so another `WebSocketServer` on the same
server keeps its own paths in either registration order; a host that owns its
server still answers an unknown path with a raw `404`. `authorize(request)`
runs after the origin check and refuses the upgrade with a raw `401` on
`false` or a throw — there is no client→server hello frame, so a credential
travels on the URL (the client preserves the base URL's search params on both
sockets) or in `Sec-WebSocket-Protocol`.

`maxPayload` bounds a single inbound frame, defaulting to `ws`'s 100 MiB.
There is no chunking or streaming sub-protocol: one frame carries one whole
message, so a `readFile` result above the ceiling is never delivered and the
socket closes with `1009`, which the client settles as `wire-failure`.

Custom client transports are authored with
`defineRuntimeTransport({ id, clientOptionsSchema?, client })`. Host factories
remain standalone, environment-specific exports such as `webWorkerHost`,
`nodeWorkerHost`, and `electronUtilityHost`; importing a renderer/client subpath
therefore cannot pull host workers or Node-only code into its graph.
Their materialized client reserves each preview synchronously, exposes
`renderTimeoutRecovery: { kind: 'terminable' | 'unsupported' }`, and resolves
`closed` once with a typed cause (`requested`, `render-timeout`, `host-exit`, or
`wire-failure`). Terminable transports must abort the exact supplied render and
terminate only the host owned by that client.

All transports produce the same `Port<unknown>` so the channel — and
therefore everything above it — is transport-agnostic. Cross-origin
isolated pages also receive zero-copy geometry transfers via a
`SharedArrayBuffer` pool that the transport allocates internally.

## Framework build integration

- Vite and React Router: add `tauRuntime()` from `@taucad/runtime/vite`.
- Next.js: export `withTauRuntime(appConfig?, headerOptions?)` from `next.config.ts`.
- electron-vite: wrap the ordinary three-process config with
  `electronRuntimeConfig(...)` from `@taucad/runtime/electron/vite` and import
  the utility entry with electron-vite's native `?modulePath` query.

The framework helpers are version-neutral: the same implementation is qualified
with React Router 7/Vite 7 and React Router 8/Vite 8, electron-vite 5/Vite 7 and
electron-vite 6 beta/Vite 8, and Next.js 15/Webpack and Next.js 16/Turbopack.
Consumers do not need package aliases, semver branches, or version-specific
configuration.

## Plugin entry points

| Subpath                                    | Purpose                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `@taucad/runtime`                          | Public client surface, connectors, types, error classes.                                  |
| `@taucad/runtime/presets`                  | Zero-config built-in kernel, middleware, bundler, and transcoder composition.             |
| `@taucad/runtime/kernels`                  | Bundled kernel factories (`replicad`, `opencascade`, `manifold`, `jscad`, `zoo`, `tau`).  |
| `@taucad/runtime/transcoder`               | Transcoder authoring API.                                                                 |
| `@taucad/runtime/transport`                | Author API only: `defineRuntimeTransport`, `runtimeProtocolSchemas`, shared types.        |
| `@taucad/runtime/transport/in-process`     | `inProcessTransport` — same-isolate transport (cross-env).                                |
| `@taucad/runtime/transport/web`            | `webWorkerTransport` — browser `Worker` host.                                             |
| `@taucad/runtime/transport/node`           | `nodeWorkerTransport` — `node:worker_threads` host (gated to keep browser bundles clean). |
| `@taucad/runtime/transport/websocket`      | `webSocketTransport` — client for a remote kernel host (browser-safe).                    |
| `@taucad/runtime/transport/websocket-host` | `webSocketHost` — Node `ws` server serving one kernel per connection.                     |
| `@taucad/runtime/middleware`               | Built-in middlewares (parameter cache, geometry cache, file resolver).                    |
| `@taucad/runtime/filesystem`               | `fromMemoryFs`, `fromBrowserFs`, bridge factories, and opaque filesystem types.           |
| `@taucad/runtime/filesystem/node`          | `fromNodeFs` for a host directory confined as the runtime root.                           |
| `@taucad/runtime/testing`                  | `createMockRuntimeClient`, kernel testing utilities.                                      |
| `@taucad/runtime/node`                     | `createNodeClient` for headless/CLI usage.                                                |

### Sandboxed preloads

`@taucad/runtime/electron/preload` is sandbox-compatible source: it uses only
`contextBridge`, `ipcRenderer`, `window.postMessage`, and `process.env` — all of
which Electron's sandboxed preload environment provides (the sandbox bootstrap
hands the preload a `process` object carrying a snapshot of the main process's
`env`).

What `sandbox: true` additionally requires is on the application's side: Electron's
sandboxed loader wraps preload source in a CommonJS function wrapper and exposes no
arbitrary `require`, so the app's **preload bundle must be emitted as CommonJS**. With
`electron-vite`, that is the preload config's `build.rollupOptions.output.format`.
`electronRuntimeConfig` already does the other half — it de-externalises
`@taucad/runtime` for the preload build, so the runtime's preload source is inlined
rather than left as a bare import the sandboxed loader cannot resolve. Main and the
utility process stay ESM either way.

## Further reading

- [Quick start](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/getting-started/quick-start.mdx)
- [Live rendering](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/guides/live-rendering.mdx) — autonomous loop, `RenderOutcome`, supersession
- [Embedding in a host](https://github.com/taucad/tau/blob/main/apps/ui/content/docs/runtime/guides/embedding-in-a-host.mdx) — rooted bridge factories and deferred filesystem binding
- [Architecture invariants](https://github.com/taucad/tau/blob/main/docs/architecture/runtime-topology.md)
- [Per-kernel guides](https://github.com/taucad/tau/tree/main/apps/ui/content/docs/runtime)
