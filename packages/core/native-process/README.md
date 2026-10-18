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
The mirror validates rooted paths and rejects case collisions and files that change during a read.
It copies one file at a time without fixed file-size, workspace-size, file-count or directory-depth
ceilings. Available memory, disk space and filesystem path limits still apply. The OS sandbox is
applied by `NativeProcessSession` when it spawns the worker against that mirror.

Inside a kernel call, pass `runtime.fileContentCache` and `runtime.operationId` as `sync()`'s second
and third arguments. The mirror then reuses bytes the runtime already read and walks the workspace
once per runtime operation, however many of a render's calls ask for it.

## API

| Export                          | Purpose                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NativeProcessSession`          | Sandboxed, validated framed child-process requests, ordered progress events, cancellation, and artifact consumption. |
| `NativeWorkerReportedError`     | Preserves structured issues returned by the native worker.                                                           |
| `NativeRuntimeUnavailableError` | Thrown (code `NATIVE_RUNTIME_UNAVAILABLE`) when the operating-system sandbox cannot start; the worker never runs.    |
| `launchInNativeSandbox`         | Wraps one host-owned executable and argument vector in the fixed Tau sandbox profile.                                |
| `spawnInNativeSandbox`          | Spawns a `launchInNativeSandbox` vector, handing `bwrap` its link-refusing seccomp program on Linux.                 |
| `nativeSandboxPolicy`           | The fixed capability profile: bundled runtime and source snapshot readable, one private writable root, no network.   |
| `createWorkspaceMirror`         | Disposable projection of the injected filesystem into a private native workspace.                                    |
| `processEnvironment`            | Constructs the child environment from the supported platform values.                                                 |
| `terminateProcessTree`          | Terminates the owned native process tree across supported host platforms.                                            |

Native sessions accept `requestTimeout: 0` to wait for completion or cancellation. Startup still
has a two-minute handshake deadline; a positive request timeout remains an explicit host policy.
Artifact size limits supplied by the host remain enforced alongside length and digest validation.

## Native kernel deployments (`./adopter`, `./store`)

A native kernel package is fully integrated by listing its plugin in a runtime definition. The
package defines its deployment once in a light module (its `/native` subpath, no kernel code) and
binds it to its kernel registrations; a host discovers every native kernel from the runtime it
resolved and names none.

```typescript
// src/native.ts (exported as "./native")
import { defineNativeKernelDeployment } from '@taucad/native-process-core/adopter';

import manifest from '../tau-plugin.json' with { type: 'json' };

export const rustcadNative = defineNativeKernelDeployment({
  package: '@acme/rustcad',
  ecosystem: 'none',
  manifest,
  moduleUrl: import.meta.url,
  optionsSchema: rustcadClosureSchema,
  optionsFromClosure: (closure) => ({ executable: `${closure.root}/bin/rustcad`, runtimePath: closure.root }),
  launchSet: () => ['bin/rustcad'],
});

// src/rustcad.kernel.ts: options take an optional explicit `closure`, and `initialize` binds late.
export const rustcadKernel = withNativeDeployment(
  defineKernel({
    id: 'rustcad',
    extensions: ['rcad'],
    async initialize(options, runtime) {
      const { options: bound } = await bindNativeKernel({ deployment: rustcadNative, kernel: 'rustcad', options });
      // start a NativeProcessSession from `bound`
    },
    // ...
  }),
  rustcadNative,
);
```

`bindNativeKernel` (`./store`) uses an explicit `options.closure` when given; otherwise it asks the
closure resolver a host installed with `installNativeClosureResolver`, or reads the default payload
store's launch index itself. An unprepared kernel throws `UnpreparedKernelError`, whose
`KERNEL_NOT_PREPARED` (or `KERNEL_CAPABILITY_MISSING`) issue the runtime forwards and retries on the
next operation.

| Export (`./store`)                                     | Purpose                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `nativeDeploymentsOf`                                  | The native packages a resolved runtime lists, with the kernels it routes, in list order.  |
| `preparationPluginsOf`, `openNativePreparation`        | The preparation plugins of deployments, and a long-lived preparation host over them.      |
| `preparableKernels`, `nativeKernelIdsSupportedOn`      | Kernels that can be prepared, and those with a variant for a host.                        |
| `bindNativeKernel`, `UnpreparedKernelError`            | Late binding in `initialize`, and its typed refusal.                                      |
| `storeClosureResolver`, `installNativeClosureResolver` | The default store reader, and the slot a host installs its own resolver in.               |
| `inspectNativeKernels`, `inspectionResolver`           | Closure states read by a process that can read the store, answered to one that cannot.    |
| `reportNativeDeployments`, `loadReportedDeployments`   | The package-neutral report a runtime thread or child sends its parent, and its re-import. |
| `verifyStoreClosure`, `defaultPayloadStore`            | The closure re-verifier for store launches, and the shared store root.                    |

## Sandbox

Every session spawns its worker through [`@anthropic-ai/sandbox-runtime`](https://github.com/anthropics/sandbox-runtime)
with one fixed profile: the worker reads only its bundled `runtimePath` and the mirrored workspace,
writes only to its private artifact directory (which also serves as its `HOME` and `TMPDIR`), and has
no network. The operating system enforces the boundary; there is no trust prompt and no unsandboxed
fallback. When the platform sandbox or one of its prerequisites is missing, `start()` rejects with
`NativeRuntimeUnavailableError` and the next request retries.

A worker may not create a symbolic or hard link, not even inside its writable root. The process that
asked for the worker often reads and writes that root too, and Node's permission model follows a
link it finds there. On Linux `bwrap` loads a seccomp program that refuses `link`, `symlink`,
`linkat`, `symlinkat` and `io_uring_setup`. The program arrives on file descriptor 3, so spawn a
`launchInNativeSandbox` vector with `spawnInNativeSandbox`. On macOS the Seatbelt profile ends with
`(deny file-write-create (vnode-type SYMLINK))` and `(deny file-link)`.

| Host  | Mechanism                              | Prerequisites                                                             |
| ----- | -------------------------------------- | ------------------------------------------------------------------------- |
| macOS | Seatbelt via `/usr/bin/sandbox-exec`   | `/usr/bin` and `/bin` on the host `PATH`                                  |
| Linux | Bubblewrap, network namespace, seccomp | `bwrap`, `socat`, `rg`; unprivileged user namespaces (AppArmor on Ubuntu) |

Windows is refused explicitly until the runtime's Windows backend accepts per-launch paths. On Linux
the worker runs in its own PID namespace and cannot see the host process: parent-liveness watchdogs
must not treat an unaddressable supervisor as dead (the sandbox already dies with its parent).

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
