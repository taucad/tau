# @taucad/picogk

[![npm](https://img.shields.io/npm/v/@taucad/picogk)](https://www.npmjs.com/package/@taucad/picogk)
[![downloads](https://img.shields.io/npm/dm/@taucad/picogk)](https://www.npmjs.com/package/@taucad/picogk)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/picogk)](https://www.npmjs.com/package/@taucad/picogk)
[![license](https://img.shields.io/npm/l/@taucad/picogk)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

PicoGK native C# voxel modeling kernel for Tau Desktop

## Why @taucad/picogk?

- **One call composes it** — `picogk()` registers this package's capabilities with `defineRuntime`.
- **Upstream-compatible C#** — ordinary PicoGK and ShapeKernel programs use `Library.Go` and `Library.oViewer()` unchanged.
- **Progressive headless viewer** — the desktop worker mirrors PicoGK's queued viewer updates without opening GLFW, transfers stable components once and publishes dirty deltas, then emits one authoritative final GLB.
- **Role factories** — `picogkKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/picogk @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. A capability with an
options schema adds `zod` as a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { picogk } from '@taucad/picogk';

const runtime = defineRuntime({ plugins: [picogk()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

### Prepared browser host

Browser hosts import the explicit browser entry and provide a prepared asset receipt:

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { picogk } from '@taucad/picogk/browser';

// Obtained from the host build's verified assets-receipt.json.
declare const assets: { url: string; sha256: string };
const runtime = defineRuntime({
  plugins: [picogk({ kernels: { default: { assets, wasm: 'auto' } } })],
});
```

The browser compiles authored C# with Roslyn against a prebuilt .NET base and uses the same
headless capture, parameters and GLB conversion as desktop. Rendering remains in Tau's viewer.
Without a prepared manifest, initialization reports `KERNEL_NOT_PREPARED`. `auto` selects a
threaded variant only when the bundle contains one and the host is cross-origin isolated;
`single` selects serial execution, and unsupported `multi` requests fail explicitly.
`recycleHeapBytes` defaults to 1.5 GiB; Tau supplies 512 MiB on memory-constrained devices.
The worker samples the entire WebAssembly heap and recycles only after its artifacts have been delivered.

See [browser host preparation](dotnet/Tau.PicoGK.Browser/README.md) for the explicit input
configuration. The currently qualified preparation target produces a serial bundle; automatic
package provisioning and threaded-host qualification are separate implementation gates.
Tau UI builds consume that bundle through `PICOGK_BROWSER_ASSETS_ROOT`, verify its bytes and
preserve its resource directory layout. Default native imports and desktop preparation are unchanged.

Browser builds collect original `.stl` and `.vdb` files written under `Library.strLogFolder`
or created/changed relative to the project root. These files are copied into run-owned receipts,
verified during bounded transfers, and retained with the evaluated handle. `authoredStl` and
`authoredVdb` export IDs return those bytes without remeshing or coordinate conversion, and are
offered only when the build produced matching files. A format request for STL uses the authored
files when available; otherwise the existing GLB-to-STL route remains available. VDB requires
an authored file. Multiple original files use the existing export artifact-set handling.

Each browser build starts from the authorized project snapshot. Writes in its private mirror do
not modify the user's project; save exported files through the host's existing file services.
Files from a failed or superseded run are never offered by a later evaluation. Exports retain
whole file bytes in the handle; transfers are chunked, but the total memory policy still applies.

PicoGK source stays PicoGK source:

```csharp
using System.Numerics;
using PicoGK;

Library.Go(0.5f, () =>
{
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 20f), "Rotor / Hub");
});
```

The packaged desktop host compiles the selected entry as a standard C# console program and JIT-runs its entry point in the trusted native worker. Each render settles exactly once with the authoritative final GLB. Helper `.cs` files and project assets participate in the existing filesystem live-update loop. Relative asset paths resolve from the project root.

`Viewer.Add(geometry, string name, int nGroupID = 0)` names displayed voxels, meshes, and polylines. Full authored names must be unique in the final scene; `"Rotor / Blade 17"` is one label, and group IDs remain appearance controls. Existing unnamed `Add` calls receive `Shape N` labels. The optional `Viewer.SetMechanism(object source)` inside `Library.Go` accepts JSON-equivalent `@taucad/kinematics` source whose `links.*.shapes` reference those exact authored names. Use millimetres and the as-built Z-up frame in source; Tau resolves build-local component IDs, converts the mechanism with the vertices, and writes it into the GLB topology. Invalid mechanism metadata warns while the geometry renders.

### Several models in one project

A project may hold several independent programs. Every `.cs` file with top-level statements or a static `Main` method is a program. Every other `.cs` file is a helper. Rendering, evaluating, exporting or testing a program compiles that file with every helper, and never with another program. So each program may declare its own `Params`, enums and `Program` class, and an edit to one program never re-renders another. Helpers are shared: an edit to a helper re-renders every program that uses it.

Opening a helper runs the project's program when there is exactly one. When several programs could claim a helper, the worker reports `CS_TAU_ENTRY` and names them; open the program to run instead. A program file with several static `Main` methods and no top-level statements is reported the same way. Each program is its own model: no `tau.json` entry is needed, because `assets.main` only names the file that opens first.

### Interactive parameters

Add one global `public static class Params` to opt into Tau's Parameters pane without importing a Tau API. Public static read/write auto-properties become controls; their compile-time initializers remain the defaults when the same source runs outside Tau. The worker supports `bool`, `int`, `float`, `double`, `string`, and project-local enums. Standard `Range` and `Display` attributes provide limits and presentation metadata:

```csharp
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, Params.RadiusMm)));

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Order = 1)]
    public static float RadiusMm { get; set; } = 20f;
}
```

Parameter discovery uses Roslyn symbols only; it does not execute model code. Defaults must be finite, non-null compile-time constants, and the opt-in class cannot define an explicit static constructor. Supplied values are type/range checked before the collectible assembly is loaded, then applied before the ordinary console entry point runs. Programs without the exact opt-in class keep the empty schema and upstream behavior.

## Native runtime

The kernel runs a sandboxed .NET worker that the package does not carry. `tau-plugin.json` pins its
closure for macOS 14+ on Apple silicon: Microsoft's .NET runtime archive, byte-for-byte from
`builds.dotnet.microsoft.com`, and the Tau PicoGK layer (the ReadyToRun worker, patched `PicoGK.dll`,
Roslyn, SkiaSharp and the Tau-built engine) from `cdn.tau.new` with its GitHub Release as fallback.
`tau prepare picogk` downloads, verifies and seals both in the payload store. Every `picogkKernel`
registration carries `picogkNative` (the `/native` deployment), so a host that lists `picogk()` in a runtime
definition prepares it from the definition, and the kernel resolves the prepared closure itself when it
initializes. To pin a closure instead, pass it explicitly:

```typescript
import { picogkKernel, picogkOptionsFromClosure } from '@taucad/picogk';

const preparation = await host.inspect({ package: '@taucad/picogk' });
if (preparation.state.status === 'ready') {
  const kernel = picogkKernel({ closure: picogkOptionsFromClosure(preparation.state.receipts['runtime']!) });
}
```

The worker launches as Microsoft's `dotnet` muxer running the worker assembly, with the closure root as
its only readable runtime path. Each launch hashes the muxer and a named set of runtime and engine
files against the receipt; `tau prepare picogk --verify` re-checks the whole closure. The published
closure serves macOS 14 or later on Apple silicon and linux-x64 with glibc 2.28 or later. The desktop
release job builds both layers; the Linux engine is headless and builds in the pinned manylinux_2_28
image. On other hosts, including Windows, musl Linux and Linux on arm64, preparation reports the host as
unsupported.

## API

| Export                     | Kind            | Use                                                                           |
| -------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `picogk`                   | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`                   | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `picogkKernel`             | kernel factory  | direct `kernels` composition, with options                                    |
| `picogkOptionsFromClosure` | function        | kernel options from a prepared closure's receipt                              |

One preset, `default`, selecting `kernels.default`.

## Project files

`@taucad/picogk/project/*` holds the files a new PicoGK project carries, so it runs outside Tau with the .NET 10 SDK on macOS arm64 or Windows x64 (`dotnet restore --locked-mode`, then `dotnet run`, which opens PicoGK's viewer): `project.csproj`, which Tau writes as `<Name>.csproj` and which references upstream PicoGK 2.3.0 from NuGet, and its `packages.lock.json`. The project's `main.cs` is the program, so no separate entry file is needed. When a root `.csproj` references PicoGK at another version, evaluation succeeds with a `LIBRARY_VERSION_MISMATCH` warning located at the reference.

## Display meshing

`meshAdaptivity` (0 to below 1) and `meshRelax` (default `false`) are evaluate options, so the viewer's
settings menu shows them and a change re-evaluates the model. Unset, a view meshes at 0.25 (Balanced) where the
prepared runtime meshes adaptively, and uniformly where it does not; the tessellation report says which. Exports
take the same two options and mesh uniformly (0) unless they set one, so `export('glb', { meshAdaptivity: 0.25 })`
writes the adaptive mesh. An export whose meshing matches the view's reuses the view's build; any other rebuilds.

## Large models

Mechanism serialization retains large payloads without a fixed byte or value-count ceiling. Cancellation, cycle detection and JSON nesting validation still apply.

Native requests run until completion or cancellation by default (`requestTimeout: 0`). Hosts may
set a positive deadline in milliseconds or a `maxArtifactBytes` policy under `kernels.default`.
The default artifact allowance is `Number.MAX_SAFE_INTEGER`; actual allocation and filesystem
limits still apply. Workspace mirroring has no fixed byte, file-count or directory-depth quota.

## Environment

| Host           | Supported      | Notes                                                            |
| -------------- | -------------- | ---------------------------------------------------------------- |
| Browser worker | Explicit entry | `@taucad/picogk/browser`, with a verified prepared serial bundle |
| Node.js        | Yes            | `>=24`                                                           |

## Native performance gate

`pnpm nx benchmark-native picogk` runs 200 source edits through one warm worker plus a 0.25 mm
high-resolution build. It fails on worker recycling, invalid native-memory telemetry, monotonic resource
growth, leaked mesh artifacts, or source-save latency above 50 ms p50 / 100 ms p95.

The 2026-09-03 Apple M2 Pro baseline measured 16.59 ms p50 / 24.14 ms p95 save-to-settled,
819.62 ms cold handshake, and 105.48 ms for the high-resolution build. The worker stayed at one
generation with 149 file descriptors and three stable .NET diagnostic files. Native allocation
telemetry records the live scene before the library is disposed; RSS and repeated worker generations
are the lifecycle leak gates.

`pnpm nx test picogk --watch=false` also runs byte-pinned official PicoGK examples, ShapeKernel wireframes, the full LEAP 71 HelixHeatX model, and RoverWheel through the same runtime plugin used by the desktop app.

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/picogk)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/picogk/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
