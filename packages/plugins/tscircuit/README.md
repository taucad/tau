# @taucad/tscircuit

[![npm](https://img.shields.io/npm/v/@taucad/tscircuit)](https://www.npmjs.com/package/@taucad/tscircuit)
[![downloads](https://img.shields.io/npm/dm/@taucad/tscircuit)](https://www.npmjs.com/package/@taucad/tscircuit)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/tscircuit)](https://www.npmjs.com/package/@taucad/tscircuit)
[![license](https://img.shields.io/npm/l/@taucad/tscircuit)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

tscircuit EDA kernel for Tau: TSX circuits rendered to 3D boards, schematic and PCB SVG, with BOM, netlist and circuit JSON exports

## Why @taucad/tscircuit?

- **One call composes it** — `tscircuit()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `tscircuitKernel()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope work** — backends load in `initialize()` and stay in capability context, one payload per worker.

## Install

```bash
npm i @taucad/tscircuit @taucad/runtime zod
```

`@taucad/runtime` is a required peer — one install must hold one runtime. `zod` is a second required peer. The package vendors its upstream engine and needs no consumer pnpm hook or bundler alias.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { tscircuit } from '@taucad/tscircuit';

const runtime = defineRuntime({ plugins: [esbuild(), tscircuit()] });
```

A `.tsx` or `.jsx` file default-exports a board; the kernel evaluates it once with `@tscircuit/core` and keeps
the settled circuit JSON. Its declared views are `board` (GLB, default),
`schematic` (SVG, one selectable instance per sheet), and `pcb` (SVG, with a `pinNumbers` option):

```tsx
export default () => (
  <board width='20mm' height='20mm'>
    <resistor name='R1' resistance='1k' footprint='0402' pcbX={-4} pcbY={0} />
    <led name='LED1' color='red' footprint='0603' pcbX={4} pcbY={0} />
    <trace from='.R1 > .pin2' to='.LED1 > .anode' />
  </board>
);
```

```typescript
const document = client.open({ source: { path: '/main.tsx' } });
const pcb = document.view('pcb', { options: { pinNumbers: true } });
const outcome = await pcb.rendering();
```

Rendering is offline by default: local autorouter, no parts engine. `fetch` is disabled while the board
evaluates and while the GLB is built, and each attempted URL becomes a `warning` issue naming it. Tau's
bundled KiCad pack (about a hundred footprints: passives, LEDs, diodes, SOT/TO packages, SOIC, TSSOP, QFN,
QFP and DIP ICs, headers, connectors, crystals, switches and modules) gives common parts real 3D bodies
offline: plain footprint strings such as `0603`, `soic8`, `sot23`, `qfn32` or `pinrow4` use the matching
KiCad model, and `kicad:` footprints in the pack, such as `kicad:Package_SO/SOIC-8_3.9x4.9mm_P1.27mm`, load
their KiCad footprint and model. Other `kicad:` names and `jlcpcb:` references produce a `warning` and an
unplaced part. Set the kernel option `parts: 'online'` to let `kicad:` footprints and
their models load from tscircuit's part hosts (`*.tscircuit.com`, https only); every other URL stays blocked.

The `schematic` view takes a `theme` option (`light` by default, `dark`, or `engineering` for KiCad's
colours) and the `pcb` view a `palette` option (`fabrication` by default, drawing the top side in the
board's solder mask colour with gold pads, or `engineering`).
Exports are named `board` (`glb`), `bom` (`csv`), `netlist` (`txt`), and `circuit` (`json`).
An authored schematic sheet with a unique name keeps its selection across reorder; unnamed or
ambiguous sheets receive evaluation-local IDs and titles marked “current evaluation”; their choices expire on the next evaluation. Parts outside
all sheets produce a warning naming the parts. SVG output is fitted in pixels and carries no
physical units. The GLB builds the board from its copper, finish, solder mask and silkscreen layer geometry.
The kernel option `boardStyle` picks the default 3D look, `presentation` (the default) or `technical` (a plain
slab with feature edges), and the `board` view and export take a `style` option that overrides it. Neither
style rasterizes a board texture.

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle.

## API

| Export            | Kind            | Use                                                                           |
| ----------------- | --------------- | ----------------------------------------------------------------------------- |
| `tscircuit`       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`          | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `tscircuitKernel` | kernel factory  | direct `kernels` composition; declares the `parts` option                     |

One preset, `default`, selecting `kernels.default`.

## Environment

| Host           | Supported | Notes                            |
| -------------- | --------- | -------------------------------- |
| Browser worker | Yes       | no Node built-ins in the payload |
| Node.js        | Yes       | `>=24`                           |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/tscircuit)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/tscircuit/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
