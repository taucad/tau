# @taucad/build123d

[![npm](https://img.shields.io/npm/v/@taucad/build123d)](https://www.npmjs.com/package/@taucad/build123d)
[![downloads](https://img.shields.io/npm/dm/@taucad/build123d)](https://www.npmjs.com/package/@taucad/build123d)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/build123d)](https://www.npmjs.com/package/@taucad/build123d)
[![license](https://img.shields.io/npm/l/@taucad/build123d)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Native Build123d kernel for trusted Tau desktop and Node hosts.

## Why @taucad/build123d?

- **Native Build123d and OCP** — execute Python CAD without a WebAssembly translation layer.
- **Retained topology** — one build feeds GLB preview, `TAU_cad_topology`, and STEP export.
- **Supervised process** — exact packaged resources, bounded protocol and artifacts, process-tree termination, and no system-Python fallback.

## Install

```bash
npm i @taucad/build123d @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an
options schema adds `zod` as a second required peer.

## Host integration

This package deliberately has no ambient setup. The host must package a pinned CPython and wheel tree, validate its own resource manifest, create a separately revocable trusted-project marker, and pass the exact executable, worker, support-file paths, and SHA-256 digests under `kernels.default`. Tau Desktop is the reference integration in `apps/desktop/src/tau/build123d-resources.ts` and `desktop-runtime.definition.ts`.

Do not point production at `python`, a virtual environment, or a user-writable worker. The kernel never searches `PATH`, installs packages, or downloads dependencies.

## API

| Export            | Kind            | Use                                                                           |
| ----------------- | --------------- | ----------------------------------------------------------------------------- |
| `build123d`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`          | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `build123dKernel` | kernel factory  | direct `kernels` composition, with options                                    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported  | Notes                                                              |
| -------------- | ---------- | ------------------------------------------------------------------ |
| Browser worker | No         | `taucad.hostTarget: node` — this package is not browser-safe       |
| Tau Desktop    | Yes        | Pinned CPython/Build123d/OCP resource tree and project trust       |
| Custom Node.js | Host-owned | `>=24`; the host must provide the same resource and trust contract |

## Model contract

A `.py` entry defines a top-level `@dataclass(frozen=True) class Params` and synchronous `main(params)`. Supported parameter types are `bool`, `int`, `float`, `str`, and scalar `Literal`. Return one `build123d.Shape` or a non-empty list or tuple of uniquely labeled shapes. Declare non-Python inputs in `__tau__ = {"dependencies": [...]}`.

See the package's [`cad-build123d` agent skill](./agent/SKILL.md) and the [Build123d runtime reference](https://docs.tau.new/runtime/reference/build123d) for the complete authoring and trust contract.

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
