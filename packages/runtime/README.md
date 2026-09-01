# @taucad/runtime

Composable CAD runtime for browser workers, Node.js, and custom hosts.

The runtime package owns the framework and authoring contracts. Concrete kernels, middleware, bundlers, and transcoders live in separate plugin packages and are composed by each application.

## Quick start

`zod` is a required peer — the runtime parses the schemas you author, so one install must hold one
zod: `npm i @taucad/runtime zod`.

The runtime ships no kernels. Compose plugins into `defineRuntime` and hand the definition to
`createNodeClient`, which supplies the in-process transport and filesystem; the caller always
supplies the runtime definition. The runtime publishes one wave ahead of the plugins it cites, so a
freshly released runtime names plugin versions that reach the registry minutes later.

```typescript
import { createNodeClient } from '@taucad/runtime/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { replicad } from '@taucad/replicad';

const runtime = defineRuntime({ plugins: [esbuild(), replicad()] });
const client = await createNodeClient({ runtime });
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

## Browser worker

Worker entry:

```typescript
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { webWorkerHost } from '@taucad/runtime/transport/web';
import { replicad } from '@taucad/replicad';

export const runtime = defineRuntime({ plugins: [replicad()] });
await webWorkerHost({ worker: createRuntimeWorker({ runtime }) }).open();
```

Client:

```typescript
import { createRuntimeClient } from '@taucad/runtime/client';
import { webWorkerTransport } from '@taucad/runtime/transport/web';
import type { runtime } from './runtime.worker.js';

const client = createRuntimeClient<typeof runtime>({
  transport: webWorkerTransport({
    createWorker: () => new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' }),
  }),
});
```

## Plugin toolkits

Every toolkit declares its package-named factory as the canonical authoring symbol and re-exports that same binding as `plugin` for mechanical loaders. There is no default export. Import the package name:

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { image } from '@taucad/image';

const runtime = defineRuntime({
  plugins: [assimp({ preset: 'all' }), image()],
});
```

Presets select capabilities; role-nested options configure the selected factories. Use direct capability buckets only for app-local capabilities, isolated capability tests, or whole-role ordering that must interleave outside plugin expansion:

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/replicad';
import { middleware } from '@taucad/middleware';

const runtime = defineRuntime({
  plugins: [replicad({ kernels: { default: { wasm: 'auto' } } }), middleware({ preset: 'cache' })],
});
```

Plugin capabilities retain their flat author-declared IDs. `meta.name` identifies the toolkit; diagnostics qualify a selected capability as `<name>/<preset-path>`.

The live `capabilities.registrations` manifest is discriminated by role. Kernel entries include their source `extensions`; unknown fields and future capability kinds survive validation, so clients should consume the manifest rather than maintain a parallel extension map.

## Authoring a toolkit

```typescript
import { definePlugin } from '@taucad/runtime/plugin';
import { myKernel } from './my-kernel.js';

export const myPlugin = definePlugin({
  meta: { name: '@scope/my-plugin' },
  kernels: { default: myKernel },
  presets: { default: ['kernels.default'] },
});

// Package root: the generic name is only the dynamic-loader contract.
export { myPlugin, myPlugin as plugin } from './my-plugin.js';
```

Capability backends load in `defineKernel` or `defineTranscoder` `initialize()` and remain in the returned context. Do not cache backend handles at module scope.

Capability `permissions` are declarative metadata for store and host review. The runtime reports them but does not enforce them; confinement remains the host's responsibility.

Published toolkits declare `@taucad/runtime` in `peerDependencies`. Dynamic loaders check that range and warn on mismatches; runtime composition never checks package manifests, and path-loaded modules without one skip the check. Plugin factories and instances also carry the exact `runtimePluginAbiVersion` through frozen `Symbol.for` slots for same-realm duplicate-runtime interop. Those brands do not cross workers; the validated capabilities manifest is the wire contract.

## Public subpaths

| Subpath                                | Purpose                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `@taucad/runtime`                      | Runtime client and shared public types               |
| `@taucad/runtime/client`               | Client API and source/export types                   |
| `@taucad/runtime/plugin`               | `definePlugin`, derivation helpers, and plugin types |
| `@taucad/runtime/kernel`               | Kernel authoring API                                 |
| `@taucad/runtime/middleware`           | Middleware authoring API                             |
| `@taucad/runtime/bundler`              | Bundler authoring API                                |
| `@taucad/runtime/transcoder`           | Transcoder authoring API                             |
| `@taucad/runtime/worker`               | Runtime definitions and worker construction          |
| `@taucad/runtime/transport/web`        | Browser worker transport and host                    |
| `@taucad/runtime/transport/node`       | Node worker transport and host                       |
| `@taucad/runtime/transport/in-process` | Same-isolate transport                               |
| `@taucad/runtime/filesystem`           | Runtime filesystem adapters                          |
| `@taucad/runtime/types`                | Runtime-owned public type utilities                  |

Concrete capability barrels and runtime presets are intentionally absent.
