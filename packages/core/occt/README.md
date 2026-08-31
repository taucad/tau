# @taucad/occt-core

[![npm](https://img.shields.io/npm/v/@taucad/occt-core)](https://www.npmjs.com/package/@taucad/occt-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/occt-core)](https://www.npmjs.com/package/@taucad/occt-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/occt-core)](https://www.npmjs.com/package/@taucad/occt-core)
[![license](https://img.shields.io/npm/l/@taucad/occt-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Shared OpenCascade lifecycle, threading, error, and tracing helpers

## Why @taucad/occt-core?

- **One OCCT lifecycle** — `@taucad/opencascade` and `@taucad/replicad` load, thread, scope, and trace
  the same way instead of each carrying a copy.
- **OCCT parallel activation** — `activateOccParallelism()` enables OCCT's global parallel defaults
  after the runtime-owned pthread capability probe selects a multi build.
- **Handles that get freed** — `createOcScope()` tracks OCCT handles and deletes them on exit.
- **Not a plugin** — no capabilities, no backend at module scope; kernels call it from their own
  `initialize()`.

## Install

```bash
npm i @taucad/occt-core @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime.

## Quick start

Call it from a kernel's `initialize()`, never at module scope:

```typescript
import { createOcScope, initOcct } from '@taucad/occt-core';
import { detectMultiThreadSupport } from '@taucad/runtime/cross-origin-isolation';
import type { OcctModuleFactory } from '@taucad/occt-core';

// The caller resolves both — this package never reaches for a WASM build itself.
declare const wasmUrl: string;
declare const singleThreaded: OcctModuleFactory<unknown>;
declare const multiThreaded: OcctModuleFactory<unknown>;

const threading = detectMultiThreadSupport();
const oc = await initOcct(wasmUrl, threading.supported ? multiThreaded : singleThreaded);
const scope = createOcScope();
try {
  // every embind handle goes through `scope.track(...)`
} finally {
  scope.dispose();
}
```

## API

| Export                                     | Kind      | Purpose                                                                                                                                      |
| ------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `initOcct`                                 | function  | `(wasmUrl, initializer, options?)` — pure: the caller resolves URL and bindings. `InitOcctOptions`, `OcctModuleFactory`, `OcctModuleOptions` |
| `activateOccParallelism`                   | function  | `(oc, logger)` — enable OCCT global parallelism; returns the thread count                                                                    |
| `createOcScope`                            | function  | handle scope with deterministic release; `OcScope`, `OcHandle`                                                                               |
| `runOcMain`                                | function  | run user code against the module and normalise its result; `OcRunMainResult`                                                                 |
| `formatOcRuntimeError`                     | function  | readable message from an OCCT exception; `OcErrorContext`                                                                                    |
| `OcKernelError`                            | class     | the error kernels surface; `OcExceptionInstance`                                                                                             |
| `wrapOcForExceptions`, `wrapOcWithTracing` | functions | exception translation and call tracing; `OcTracingConfig`, `OcTracingResult`, `OcTracingSummary`                                             |

## Environment

| Host           | Supported | Notes                                                                               |
| -------------- | --------- | ----------------------------------------------------------------------------------- |
| Browser worker | Yes       | pure JavaScript; no WASM of its own, no Node built-ins in the payload               |
| Node.js        | Yes       | `>=24`; SAB is unconditional, so the runtime capability probe needs no headers here |

The OCCT payload belongs to the calling kernel: this package never bundles one.

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with `@taucad/runtime`, so the peer range always matches a published runtime.
See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and
[provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/core/occt)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/occt/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
