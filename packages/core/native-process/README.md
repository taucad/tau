# @taucad/native-process-core

[![npm](https://img.shields.io/npm/v/@taucad/native-process-core)](https://www.npmjs.com/package/@taucad/native-process-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/native-process-core)](https://www.npmjs.com/package/@taucad/native-process-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/native-process-core)](https://www.npmjs.com/package/@taucad/native-process-core)
[![license](https://img.shields.io/npm/l/@taucad/native-process-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Shared native child-process lifecycle and workspace isolation primitives

## Why @taucad/native-process-core?

- **Shared implementation, one owner** — helpers several Tau plugin packages need, published once
  instead of copied.
- **Not a plugin** — it declares no capabilities and initializes no backend at module scope; plugin
  packages call it from their own `initialize()`.
- **Explicit named barrel** — every export is listed in `src/index.ts`, so the public surface is
  reviewable and tree-shakes.

## Install

```bash
npm i @taucad/native-process-core @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime.

## Quick start

```typescript
import { createWorkspaceMirror } from '@taucad/native-process-core';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

export const inspectNativeWorkspace = async (filesystem: KernelFileSystem): Promise<readonly string[]> => {
  const mirror = await createWorkspaceMirror({
    temporaryPrefix: 'my-kernel-',
    displayName: 'My kernel',
    excludedPaths: ['thumbnail.webp'],
  });
  try {
    return await mirror.sync(filesystem);
  } finally {
    await mirror.cleanup();
  }
};
```

Pass the runtime-injected filesystem. A native kernel runs its child against `mirror.workspacePath`
between `sync()` and `cleanup()`. Exclusions are exact workspace-relative paths, applied before
metadata and content reads; excluding `thumbnail.webp` leaves `assets/thumbnail.webp` available.
The mirror also enforces path, size, depth, and case-collision limits. It is not an OS sandbox.

## API

| Export                      | Purpose                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NativeProcessSession`      | Validated framed child-process requests, ordered progress events, cancellation, trust revocation, and artifact consumption. |
| `NativeWorkerReportedError` | Preserves structured issues returned by the native worker.                                                                  |
| `createWorkspaceMirror`     | Bounded, disposable projection of the injected filesystem into a private native workspace.                                  |
| `processEnvironment`        | Constructs the child environment from the supported platform values.                                                        |
| `terminateProcessTree`      | Terminates the owned native process tree across supported host platforms.                                                   |

## Environment

| Host           | Supported | Notes                                                         |
| -------------- | --------- | ------------------------------------------------------------- |
| Browser worker | No        | Node built-ins and child processes; host this package in Node |
| Node.js        | Yes       | `>=24`                                                        |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/core/native-process)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/native-process/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
