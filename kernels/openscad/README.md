# @taucad/openscad

OpenSCAD CAD kernel for [`@taucad/runtime`](../../packages/runtime).

Wraps [`openscad-wasm-prebuilt`](https://www.npmjs.com/package/openscad-wasm-prebuilt) and exposes it as a `defineKernel` plugin so it can be loaded by the Tau runtime alongside (or instead of) any other kernel.

## License

This package is **GPL-2.0-or-later** because it bundles `openscad-wasm-prebuilt`. See [LICENSE](./LICENSE) for the full text and [`docs/research/license-strategy-mit-vs-gpl.md`](../../docs/research/license-strategy-mit-vs-gpl.md) for the licensing rationale.

The rest of `@taucad/*` (including `@taucad/runtime`) remains MIT-licensed. Distributions that do not include this package carry no GPL obligation.

## Installation

```bash
pnpm add @taucad/openscad @taucad/runtime
```

## Usage

```typescript
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime';
import { replicad } from '@taucad/runtime/kernels';
import { openscad } from '@taucad/openscad';

const runtime = defineRuntime({
  kernels: [replicad(), openscad()],
});
const client = createRuntimeClient({
  transport: inProcessTransport({ runtime }),
});
```

The `openscad()` factory returns a standard worker-owned `KernelPlugin` registration for `defineRuntime`.
