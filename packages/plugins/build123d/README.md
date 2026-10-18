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

The package's `tau-plugin.json` declares a digest-pinned native engine closure for macOS arm64/x64 and Linux glibc arm64/x64. Every `build123dKernel` registration carries `build123dNative` (the `/native` deployment), so a host that lists `build123d()` in a runtime definition can prepare the closure (`tau prepare build123d --verify` in the CLI) and the kernel resolves the prepared closure itself when it initializes. To pin a closure instead, pass `{ closure: build123dOptionsFromClosure(receipt) }` under `kernels.default`.

Hosts may also supply an equivalent packaged interpreter and wheel tree with a verified resource manifest. The worker ships `native_materials.py`, `mechanisms.py` and the `tau_kernel` modules of `@taucad/python-kernel-core`, which `tau-python-kernel generate` pins as a copy in `python/tau_kernel/`. Tau Desktop stages and seals bundled closures in `apps/desktop/scripts/runtime-stage.mts`, seeds its payload store and reads launch indexes in `apps/desktop/src/tau/native-store.ts`, and hands each closure to the kernel through the resolver `apps/desktop/src/tau/native-kernels.ts` installs. Windows packages ship no registry-native kernel closure and the native sandbox does not support Windows. The separate Windows desktop Python preparation/test route remains in CI; it does not qualify registry closure or sandbox support.

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

## Native targets

`tau-plugin.json` pins one closure per target: python-build-standalone's `install_only_stripped`
CPython plus the wheels the target's `pylock.<target>.toml` chose. The generator computes each floor
as the highest of the interpreter's and the wheels' floors; on Linux that is OCP's `manylinux_2_28`.

| Target              | Floor      | Registry host qualification | Build123D qualification |
| ------------------- | ---------- | --------------------------- | ----------------------- |
| `darwin-arm64`      | macOS 12   | `macos-26`                  | `macos-15`              |
| `darwin-x64`        | macOS 11   | `macos-26-intel`            | `macos-15-intel`        |
| `linux-x64-glibc`   | glibc 2.28 | `ubuntu-24.04`              | `ubuntu-24.04`          |
| `linux-arm64-glibc` | glibc 2.28 | `ubuntu-24.04-arm`          | `ubuntu-24.04-arm`      |

The registry host column follows `.github/workflows/native-darwin.yml` and
`native-hosts.yml`; the Build123D column follows `build123d-native.yml`. That separate
Build123D workflow also runs `test-python-desktop` on `windows-latest`, without sealing
or testing a registry closure or sandbox on Windows.

`tau prepare build123d` refuses every other host before it downloads anything, with
`blocked: unsupported-target` and the failing axis: `minimumLibcVersion` below glibc 2.28, `libc` on
musl Linux, and `os` on Windows. On a Linux host without the system `libGL.so.1` or `libX11.so.6`
that OCP links, it refuses with `missing-system-library` naming the library.

## Model contract

A `.py` entry defines a top-level `@dataclass(frozen=True) class Params` and synchronous `main(params)`. Supported parameter types are `bool`, `int`, `float`, `str`, and scalar `Literal`. Return a native Shape/Compound, a list or tuple of shapes, or `None`/an empty sequence for an empty scene. Labels are presentation; repeated instances need distinct native shape objects. Native trees use structural occurrence paths; optional explicit occurrence IDs refer to actual returned shapes.

Author reusable articulated models with native `Compound`, joints, factories and ordinary Python domain classes. Native `connect_to` performs placement; safe descendant properties return actual joints without inserting them into another `.joints` dictionary. Mount a reusable compound with an explicit native `relative_to` transform and finish placements before final parent aggregation. Group passive geometry beneath a connected native rigid compound. Fresh instances keep geometry and local metadata independent.

The optional `motion(model)` hook composes module-local plain coupling data, root `ground` and existing timeline `animations`. It accepts explicit native `connections` when retained state is insufficient and optional `occurrence_ids` for stable naming. An explicit connections list is complete, including internal edges. Select coordinates by native joint or explicit native pair; values use absolute native degrees/millimetres and lower once to canonical deltas. The GLB retains joint interfaces and physical intent; unsupported graphs remain inspectable with diagnostics.
Use native `Shape.material` for finished materials and `Shape.color` for simple color. Custom file-backed PBR maps require `maps_dir` and project-root-relative `__tau__ = {"dependencies": [...]}` declarations; imported modules may declare their own resources. GLB embeds images with native face-local UVs. STEP export carries geometry, hierarchy and supported native appearance; it does not carry playback mechanisms or editable source.

See the package's [`cad-build123d` agent skill](./agent/cad-build123d/SKILL.md) and the [Build123d runtime reference](https://docs.tau.new/runtime/reference/build123d) for the complete authoring and trust contract.

Models require no Tau Python authoring module. The native Build123D model remains usable outside Tau; the hook is ordinary metadata read by Tau.

## Project files

`@taucad/build123d/project/*` holds the files a new Build123d project carries, so it runs outside Tau with uv (`uv sync --locked`, then `uv run main.py`): a `pyproject.toml` that pins `build123d` and `cadquery-ocp-novtk` at the versions this kernel runs, a PEP 751 `pylock.toml` of the kernel's own wheels for every supported target, and a `uv.lock` of the same versions. `pnpm nx run build123d:generate-project-template` regenerates them from `python/pylock.<target>.toml`. When a project's `pyproject.toml` pins one of those libraries at another version, evaluation succeeds with a `LIBRARY_VERSION_MISMATCH` warning located at the pin.

Native materials additionally use their native material dependencies. No Tau framework file needs to accompany the project.

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
