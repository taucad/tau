# @taucad/dotnet-kernel-core

[![npm](https://img.shields.io/npm/v/@taucad/dotnet-kernel-core)](https://www.npmjs.com/package/@taucad/dotnet-kernel-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/dotnet-kernel-core)](https://www.npmjs.com/package/@taucad/dotnet-kernel-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/dotnet-kernel-core)](https://www.npmjs.com/package/@taucad/dotnet-kernel-core)
[![license](https://img.shields.io/npm/l/@taucad/dotnet-kernel-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Shared TypeScript side of Tau native .NET kernels: launch set, options, session, workspace mirror and layer manifest

## Why @taucad/dotnet-kernel-core?

- **A C# kernel supplies only what is its own**: its worker project, its protocol schemas, its closure layout
  (worker assembly and the library files it loads first) and its layer pins. Everything .NET-generic is here.
- **Built on `@taucad/native-process-core`**: the sandbox, integrity checks, JSON-lines lane and adopter contract
  are that package's; this one specialises them for a framework-dependent worker run by Microsoft's `dotnet` muxer.
- **Not a plugin**: it declares no capabilities and starts nothing at module scope. A kernel calls it from its own
  `initialize()` and its `/native` subpath.

## Install

```bash
npm i @taucad/dotnet-kernel-core @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers. Node.js 24 or later.

## Quick start

A second C# kernel takes `dotnetKernelOptionsSchema` as `optionsSchema` and starts a mirror and a session in
`initialize()`:

```typescript
// src/sample.kernel.ts (inside defineKernel)
import { createDotnetSession, createDotnetWorkspaceMirror } from '@taucad/dotnet-kernel-core';
import type { DotnetWorker } from '@taucad/dotnet-kernel-core';

const sampleWorker: DotnetWorker<SampleIssue> = {
  sessionName: 'Sample C#',
  executableName: 'Sample C# worker',
  protocolVersion: sampleProtocolVersion,
  readySchema: sampleReadySchema,
  responseSchema: sampleResponseSchema,
  issueSchema: sampleIssueSchema,
  shutdownSchema: sampleShutdownSchema,
  workerError: (issues) => new SampleWorkerError(issues),
};

async initialize(options, services) {
  const mirror = await createDotnetWorkspaceMirror({ temporaryPrefix: 'tau-sample-', displayName: 'Sample' });
  const session = createDotnetSession(sampleWorker, { ...options, ...mirror, logger: services.logger });
  return { mirror, session };
}
```

A kernel's sealed `runtime` closure holds Microsoft's runtime archive under `dotnet/` and the kernel's Tau layer
under `tau-worker/`. Its `/native` subpath states the layout; the launch set, the closure-to-options mapping and the
options schema follow.

```typescript
// src/native.ts
import { defineDotnetKernelAdopter } from '@taucad/dotnet-kernel-core/adopter';

export const sampleNative = defineDotnetKernelAdopter({
  package: '@acme/sample',
  kernel: 'sample',
  displayName: 'Sample',
  workerAssembly: 'tau-worker/Tau.Sample.Worker.dll',
  resources: [{ pattern: /^tau-worker\/Sample\.dll$/u, required: 'tau-worker/Sample.dll' }],
  manifest, // import manifest from '@acme/sample/tau-plugin.json' with { type: 'json' }
  moduleUrl: import.meta.url,
});
```

The kernel registration carries it (`withNativeDeployment(defineKernel(...), sampleNative)`), and the kernel's
`initialize()` resolves its options `{ closure?, requestTimeout, maxArtifactBytes }` with
`bindDotnetKernel({ adopter: sampleNative, options })`: an explicit `closure` as given, otherwise the prepared closure
from the host's resolver or the local payload store.

Its layer pin is rewritten by a three-line script over the layer rule, which the release job runs:

```typescript
// scripts/compose-tau-plugin.mts
import { resolve } from 'node:path';
import { runComposeTauPlugin } from '@taucad/dotnet-kernel-core/layer';

process.exitCode = await runComposeTauPlugin({
  layer: {
    name: 'sample',
    package: '@taucad/sample',
    displayName: 'Sample',
    description: '…',
    targets: ['darwin-arm64'],
  },
  manifestPath: resolve(import.meta.dirname, '../tau-plugin.json'),
  args: process.argv.slice(2),
});
```

A host discovers the deployment from the runtime definition that lists the kernel, so no Tau package changes.
The C# side stays in the kernel: `@taucad/picogk`'s `dotnet/Tau.PicoGK.Worker` (`Protocol.cs`, `Program.cs`) is the
reference shape of the framing, request loop, parent watchdog and artifact confinement. It is extracted into a shared
`dotnet/Tau.Kernel.Protocol` project when a second C# worker exists.

## API

| Entry                                | Holds                                                                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@taucad/dotnet-kernel-core`         | `createDotnetSession` (the worker session on `NativeProcessSession`), `createDotnetWorkspaceMirror` (the mirror without `bin`, `obj`, `.vs` and compiled binaries) and `bindDotnetKernel`                                                  |
| `@taucad/dotnet-kernel-core/adopter` | `defineDotnetKernelAdopter`, `dotnetLaunchSet`, `dotnetOptionsFromClosure`, `dotnetKernelOptionsSchema`, `dotnetClosureSchema`, `dotnetClosureOptionsSchema`. Imports no session code, so a host reads deployments without loading kernels |
| `@taucad/dotnet-kernel-core/layer`   | `createDotnetLayer` (layer record schema, CDN and release URLs, the `worker` pin, the CycloneDX SBOM), `runComposeTauPlugin`, `payloadCdnBase`, `payloadKey`, `manifestText`                                                               |

## Rust or other single-binary kernel

A kernel that ships one self-contained executable needs no language core: it uses `@taucad/native-process-core`
and the adopter contract directly. Its package holds:

1. `src/native.ts`, the adopter. The closure holds one binary, so the launch set and the options mapping are a few
   lines over the receipt:

   ```typescript
   import { join } from 'node:path';

   import { defineNativeKernelDeployment } from '@taucad/native-process-core/adopter';

   import manifest from '@acme/sample/tau-plugin.json' with { type: 'json' };

   const binary = 'bin/sample';

   export const sampleNative = defineNativeKernelDeployment({
     package: '@acme/sample',
     ecosystem: 'none',
     manifest,
     moduleUrl: import.meta.url,
     optionsSchema: sampleClosureSchema, // executable, sha256, runtimePath
     optionsFromClosure: (closure) => {
       const row = closure.files.find(({ path, symlinkTarget }) => path === binary && symlinkTarget === undefined);
       if (row === undefined) {
         throw new Error(
           `The Sample closure at ${closure.root} has no ${binary}. Run \`tau prepare sample --verify\`.`,
         );
       }
       return { executable: join(closure.root, binary), sha256: row.sha256, runtimePath: closure.root };
     },
     launchSet: () => [binary],
   });
   ```

2. `src/sample.kernel.ts`, which exports `withNativeDeployment(defineKernel(...), sampleNative)` with options
   `{ closure?: sampleClosureSchema, requestTimeout, maxArtifactBytes }`, and whose `initialize` resolves them with
   `bindNativeKernel({ deployment: sampleNative, kernel: 'sample', options })` from
   `@taucad/native-process-core/store`, then creates `createWorkspaceMirror(...)` and
   `new NativeProcessSession({ executablePath, executableSha256, arguments: ['--workspace', mirror.workspacePath,
'--artifacts', mirror.artifactPath, '--parent-pid', String(process.pid)], runtimePath, resources: [],
protocolVersion, parseReady, parseResponse, requestTimeout, maxArtifactBytes, logger, sessionName,
executableName, shutdown })`, both from `@taucad/native-process-core`.
3. `tau-plugin.json` with one `tar.gz` payload per target (destination `bin`), pinned by a small generator over
   `@taucad/archive-core`'s verified fetch and tar reader.
4. A worker that speaks the one JSON-lines protocol every Tau native worker speaks: a `ready` frame carrying
   `protocolVersion`; requests `{ protocolVersion, requestId, method, params }`; responses
   `{ protocolVersion, requestId, result }` or `{ protocolVersion, requestId, error: { issues } }`; an out-of-band
   cancel frame; and `shutdown`.

Listing the plugin in a runtime definition is then enough: hosts read the deployment from the registration.

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

Apache-2.0. See [LICENSE](./LICENSE).

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/core/dotnet-kernel)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/dotnet-kernel/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
