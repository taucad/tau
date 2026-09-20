# Runtime Topology Recipes

Composition recipes for the three shipped runtime topologies. Relocated from the
`Worker Model` product page (`apps/docs/content/docs/runtime/concepts/worker-model.mdx`),
which explains the worker design itself and links here for the wiring.

Two orthogonal planes compose every shipped topology, with no environment detection or
application-owned wiring: **transport** (the wire plus execution location) and
**filesystem** (the source of truth for files). The transport knows the wire and the
execution location; the filesystem knows reachability and storage. Separating them avoids
a transport type per storage provider.

## T1 -- Browser UI (Tau today)

The host page owns a kernel `Worker` and a file-manager `Worker`: the transport runs the
wire in the kernel worker, the filesystem lives in the FM worker behind a bridge.

`createWebWorkerClientOptions` takes `createWorker` plus
`fileSystem: fromFileSystemBridge(() => openFileSystemBridge(fmWorker, { root: '/projects/widget', consumer: 'agent' }))`;
the wiring in full is in the published
[Embedding in a Host](https://docs.tau.new/runtime/guides/embedding-in-a-host) guide.

The worker entry composes `defineRuntime(...)` and `serveWebWorkerRuntime({ runtime })`;
Vite, React Router, and Next.js keep the app-owned `new Worker(new URL(...))` expression in
their own graph. A config-backed runtime passes `typeof runtime` to
`createWebWorkerClientOptions` to infer the client `config` input from the worker's Zod
schema.

## T2 -- In-process Node CLI / tests

One Node process owns everything: the in-process transport bridges to a same-isolate
dispatcher, and the local-directory filesystem goes to the kernel inline, skipping the
`MessagePort` round-trip. `createNodeClient({ runtime, projectPath })` is the whole recipe.

## T3 -- Electron renderer + utility-process runtime

Electron runs one utility process per materialized client. Main owns each utility lease and
relays a `MessagePort`; preload exposes a narrow request/release bridge; the utility calls
`serveElectronRuntime`; the renderer awaits
`createElectronClientOptions({ renderTimeout: 60_000 })` and hands the result to
`createRuntimeClient`. No kernel, filesystem, or bundler code enters the renderer graph.

For Build123d, that utility supervises one additional warm Python child owned by the kernel
context. The child is not a security sandbox: desktop main first requires a native-code
trust grant bound to the physical project directory. The child receives only a private
mirrored workspace and writes bounded private artifacts; cancellation, timeout, trust
revocation, utility exit, or protocol failure terminates its complete descendant process
tree.

Process helpers and electron-vite configuration are in the published
[Framework Integrations API](https://docs.tau.new/runtime/api/frameworks) reference. Each
renderer client holds an independent host lease, so timeout recovery terminates a blocked
utility without touching sibling clients.
