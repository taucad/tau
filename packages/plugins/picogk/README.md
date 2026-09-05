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

PicoGK source stays PicoGK source:

```csharp
using System.Numerics;
using PicoGK;

Library.Go(0.5f, () =>
{
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0f, 0.7f);
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 20f), 0);
});
```

The packaged desktop host compiles the project as a standard C# console program and JIT-runs its entry point in the trusted native worker. When a runtime client subscribes to progressive scene updates, the host publishes one reset followed by component upserts and removals while the model is still running; unchanged component assets are retained rather than retransmitted. The normal render still settles exactly once with the authoritative final GLB. Helper `.cs` files and project assets participate in the existing filesystem live-update loop.

### Progressive capture

Capture defaults to native-style viewer-update batches with a 16 ms minimum interval and a bounded 256-command pump. Render options can select `explicit` (only `RequestScreenShot` bookmarks), `update` (one coalesced snapshot per viewer-pump batch), or `operation` (one rate-limited snapshot per effective scene operation):

```typescript
await client.render({
  source: { path: 'main.cs' },
  renderOptions: {
    capture: {
      mode: 'operation',
      minimumIntervalMilliseconds: 16,
      maximumPendingCommands: 256,
    },
  },
});
```

Each native viewer object receives a render-local stable component id. Its immutable GLB asset is transferred on first appearance and again only when that component changes; removals contain ids without geometry bytes. The runtime reconstructs every revision from the initial reset and ordered deltas. `RequestScreenShot` remains ordinary PicoGK source and becomes a retained timeline bookmark in the hosted runtime; an unchanged scene creates a bookmark without a redundant geometry update, and no framebuffer image is synthesized by the headless worker.

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

## API

| Export         | Kind            | Use                                                                           |
| -------------- | --------------- | ----------------------------------------------------------------------------- |
| `picogk`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`       | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `picogkKernel` | kernel factory  | direct `kernels` composition, with options                                    |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                                                        |
| -------------- | --------- | ------------------------------------------------------------ |
| Browser worker | No        | `taucad.hostTarget: node` — this package is not browser-safe |
| Node.js        | Yes       | `>=24`                                                       |

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
