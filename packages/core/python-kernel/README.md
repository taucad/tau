# @taucad/python-kernel-core

[![npm](https://img.shields.io/npm/v/@taucad/python-kernel-core)](https://www.npmjs.com/package/@taucad/python-kernel-core)
[![downloads](https://img.shields.io/npm/dm/@taucad/python-kernel-core)](https://www.npmjs.com/package/@taucad/python-kernel-core)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/python-kernel-core)](https://www.npmjs.com/package/@taucad/python-kernel-core)
[![license](https://img.shields.io/npm/l/@taucad/python-kernel-core)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Shared Python language-kernel worker, session, closure and payload-generator helpers for Tau's native Python kernels

## Why @taucad/python-kernel-core?

- **One Python kernel runtime, many libraries** — the sandboxed CPython session, the sealed-closure options mapping,
  the seal step and the JSON-lines worker protocol are written once; a kernel package supplies its library module.
- **Not a plugin** — it declares no capabilities and initializes no backend at module scope; a kernel package calls
  it from its own `initialize()` and its `/native` adopter.
- **Backend-neutral** — nothing here imports a CAD library; `tau_kernel` needs only CPython 3.13 and numpy.

## Install

```bash
npm i @taucad/python-kernel-core @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers — one install must hold one runtime.

## Quick start

A kernel package's `src/native.ts` describes its worker once; the launch set, the closure-to-options mapping and the
seal step follow from it:

```typescript
import { definePythonKernelAdopter } from '@taucad/python-kernel-core';

import manifest from '@acme/example/tau-plugin.json' with { type: 'json' };

export const exampleNative = definePythonKernelAdopter({
  package: '@acme/example',
  manifest,
  moduleUrl: import.meta.url,
  worker: { kernelId: 'example', kernelName: 'Example', workerModules: ['example_worker.py'] },
  selfTestImports: ['example'],
  projectLibraries: { example: '1.0.0' },
});
```

The kernel registration carries it (`withNativeDeployment(defineKernel(...), exampleNative)` from
`@taucad/native-process-core/adopter`), so a host discovers it from the runtime definition alone. The kernel's options
are `{ closure?, requestTimeout, maxArtifactBytes }`: its `initialize()` calls
`bindPythonKernel({ adopter: exampleNative, options })`, which takes an explicit `closure` as given and otherwise
resolves the prepared closure from the host's resolver or the local payload store, then opens a session over the same
worker with `createPythonWorkspaceMirror` and `createPythonSession`. Its `python/example_worker.py` serves requests
with `tau_kernel.protocol.run_worker`.

### The `tau-python-kernel` command

The generators a Python kernel's payloads come from ship as a bin, so a kernel outside the Tau repository keeps its
files current without a Tau checkout. Each command takes `--package <dir>`; relative paths resolve against the working
directory. A TypeScript `/native` entry needs a loader (`node --import @oxc-node/core/register`).

| Command                 | Effect                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `generate` / `check`    | Write, or fail on any difference in, `tau-plugin.json`, the pylocks, SBOM and `tau_kernel` |
| `seed [--target <key>]` | Fill the payload seed                                                                      |
| `golden`                | Record this host's golden receipt                                                          |
| `template [--check]`    | Write, or check, the project template                                                      |
| `test [--python <exe>]` | The Python unit tests under the 100% coverage gate (without `--package`: `tau_kernel`'s)   |

## API

| Entry                                  | Purpose                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `definePythonKernelAdopter`            | A kernel's `/native` deployment: `pypi` ecosystem, options schema, launch set and seal step.           |
| `bindPythonKernel`                     | Resolve a kernel's options in `initialize()`: an explicit closure, or the prepared one.                |
| `pythonClosureSchema`                  | The closure a Python kernel launches from: interpreter, worker and support files with digests.         |
| `createPythonSession`                  | One sandboxed, generation-scoped CPython worker session over `NativeProcessSession`.                   |
| `PythonWorkerError`                    | The issues a worker reported for one request.                                                          |
| `pythonKernelOptionsSchema`            | Options every Python kernel takes, over the kernel's own support modules and `tau_kernel`'s.           |
| `pythonLaunchSet`                      | The interpreter and every worker module, which each launch hashes.                                     |
| `pythonOptionsFromClosure`             | Map a sealed closure to the kernel's options.                                                          |
| `createPythonSeal`                     | Compile the closure's bytecode in the sandbox and prove the kernel's libraries import.                 |
| `createPythonWorkspaceMirror`          | The private workspace projection under the `tau-<kernel id>-` root the worker checks.                  |
| `python{Protocol,Issue,Ready,...}`     | The JSON-lines worker protocol's version and frame schemas.                                            |
| `pythonLibraryVersionMismatches`       | Warn about `pyproject.toml` pins of a kernel library at a version the kernel does not run.             |
| `@taucad/python-kernel-core/generator` | Pure lock compaction, wheel selection and pylock rendering for a kernel's `tau-plugin.json` generator. |
| `@taucad/python-kernel-core/template`  | Pure project template rendering: the multi-environment `pylock.toml` and `pyproject.toml`.             |

### Python modules

`python/tau_kernel/` holds the worker side, which each kernel package's generator copies into its own
`python/tau_kernel/` and pins in its `tau-plugin.json` as raw payloads under `tau-worker/tau_kernel/`:

| Module        | Purpose                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `protocol.py` | `run_worker(create_dispatch, *, temporary_prefix, import_check)`: framing, cancel frames, parent watchdog, stdout isolation, `Artifacts`, `Handles`. |
| `model.py`    | `load_entry`: analyze, validate parameters and run the project's `main(params)` with module eviction.                                                |
| `analyzer.py` | AST-level parameter and import discovery for the `main(params)` convention.                                                                          |
| `glb.py`      | `write_glb` over plain mesh arrays, with topology and PBR material extensions.                                                                       |

The `python/interpreter.json` CPython pin is every Python kernel's default, so their closures share one interpreter
payload by digest; a kernel may ship its own `python/interpreter.json` to override it.

## Environment

| Host           | Supported | Notes                                                         |
| -------------- | --------- | ------------------------------------------------------------- |
| Browser worker | No        | the session spawns a sandboxed native process                 |
| Node.js        | Yes       | `>=24`; the operating-system sandbox of `native-process-core` |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/core/python-kernel)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/core/python-kernel/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
