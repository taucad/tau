# @taucad/build123d

[![npm](https://img.shields.io/npm/v/@taucad/build123d)](https://www.npmjs.com/package/@taucad/build123d)
[![downloads](https://img.shields.io/npm/dm/@taucad/build123d)](https://www.npmjs.com/package/@taucad/build123d)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/build123d)](https://www.npmjs.com/package/@taucad/build123d)
[![license](https://img.shields.io/npm/l/@taucad/build123d)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native Build123d kernel for trusted Tau desktop and Node hosts.

The pinned engine is Build123D 0.13.0 on CPython 3.13 and OCP 8.0.1.0.0.

## Why @taucad/build123d?

- **Native Build123d and OCP** — execute Python CAD without a WebAssembly translation layer.
- **Retained topology** — one build feeds GLB preview, `TAU_cad_topology`, and STEP export.
- **Native authoring** — reusable Shape/Compound occurrences, native joints and finished materials, including embedded GLB textures.
- **Supervised process** — exact packaged resources, validated protocol and artifacts, process-tree termination, and no system-Python fallback.

## Install

```bash
npm i @taucad/build123d @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an
options schema adds `zod` as a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { build123d } from '@taucad/build123d';

const runtime = defineRuntime({ plugins: [build123d()] });
```

Hand the definition to a trusted Node host that supplies the resources described below.

## Host integration

The package's `tau-plugin.json` declares a digest-pinned native engine closure for macOS arm64/x64 and Linux glibc arm64/x64. Prepare it through the host (`tau prepare build123d --verify` in the CLI), seal it with `sealBuild123dClosure`, and pass `build123dOptionsFromClosure(receipt)` under `kernels.default`. The host owns the separately revocable project trust grant.

Hosts may also supply an equivalent packaged interpreter and wheel tree with a verified resource manifest. The worker requires four support modules: `analyzer.py`, `glb.py`, `native_materials.py`, and `mechanisms.py`. Tau Desktop's resource integration is in `apps/desktop/src/tau/build123d-resources.ts` and `desktop-runtime.definition.ts`. Windows has a separate desktop resource preparation route; the registry closure and native sandbox do not claim Windows support.

Do not point production at `python`, a virtual environment, or a user-writable worker. The kernel never searches `PATH`, installs packages, or downloads dependencies.

## API

| Export                        | Kind             | Use                                                                           |
| ----------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `build123d`                   | toolkit factory  | package-named authoring factory; presets select capabilities                  |
| `plugin`                      | toolkit factory  | the same factory under its mechanical name, for loaders that read a fixed key |
| `build123dKernel`             | kernel factory   | direct `kernels` composition, with options                                    |
| `build123dOptionsFromClosure` | resource adapter | map a sealed engine receipt to checked kernel paths and digests               |
| `sealBuild123dClosure`        | preparation hook | compile bytecode and verify native imports inside the sandbox                 |

One preset, `default`, selecting `kernels.default`.

## Large models

Native requests run until completion or cancellation by default (`requestTimeout: 0`). Hosts may
set a positive deadline in milliseconds or a `maxArtifactBytes` policy under `kernels.default`.
The default artifact allowance is `Number.MAX_SAFE_INTEGER`; actual allocation and filesystem
limits still apply. Workspace mirroring has no fixed byte, file-count or directory-depth quota.

## Environment

| Host           | Supported  | Notes                                                              |
| -------------- | ---------- | ------------------------------------------------------------------ |
| Browser worker | No         | `taucad.hostTarget: node` — this package is not browser-safe       |
| Tau Desktop    | Yes        | Pinned CPython/Build123d/OCP resource tree and project trust       |
| Custom Node.js | Host-owned | `>=24`; the host must provide the same resource and trust contract |

## Model contract

A `.py` entry defines a top-level `@dataclass(frozen=True) class Params` and synchronous `main(params)`. Supported parameter types are `bool`, `int`, `float`, `str`, and scalar `Literal`. Return a native Shape/Compound, a list or tuple of shapes, or `None`/an empty sequence for an empty scene. Labels are presentation; repeated instances need distinct native shape objects. Occurrence identity defaults to structural paths and can be explicitly assigned in `motion(model)`.

Author reusable assemblies with native `Compound(children=...)`, joints and `connect_to`. Optional `motion(model)` supplies assembly ground, stable occurrence IDs, retained connections, couplings and clips. The GLB carries local joint interfaces and physical connection intent; supported graphs also carry validated playback. Unsupported graphs remain inspectable with diagnostics, while malformed motion declarations are rejected.

Use native `Shape.material` for finished materials and `Shape.color` for simple color. Custom file-backed PBR maps require `maps_dir` and project-root-relative `__tau__ = {"dependencies": [...]}` declarations; imported modules may declare their own resources. GLB embeds images with native face-local UVs. STEP export carries geometry, hierarchy and supported native appearance; it does not carry playback mechanisms or editable source.

See the package's [`cad-build123d` agent skill](./agent/cad-build123d/SKILL.md) and the [Build123d runtime reference](https://docs.tau.new/runtime/reference/build123d) for the complete authoring and trust contract.

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

Apache-2.0 — see [LICENSE](./LICENSE). Bundled third-party payloads keep their own licenses.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/build123d)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/build123d/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
