# @taucad/slicer

[![npm](https://img.shields.io/npm/v/@taucad/slicer)](https://www.npmjs.com/package/@taucad/slicer)
[![downloads](https://img.shields.io/npm/dm/@taucad/slicer)](https://www.npmjs.com/package/@taucad/slicer)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/slicer)](https://www.npmjs.com/package/@taucad/slicer)
[![license](https://img.shields.io/npm/l/@taucad/slicer)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

FFF slicing to Bambu `gcode.3mf` with a reference engine, a tau-slicer-service client and, in Node
hosts, the person's installed Bambu Studio, plus the G-code toolpath parser and container reader the
printer viewer builds on.

## Why @taucad/slicer?

- **One call composes it** — `slicer()` registers the `glb → gcode.3mf` transcoder with `defineRuntime`.
- **Two engines, one edge** — the built-in reference engine slices on `manifold-3d` with no network; the
  `service` engine hands the same mesh to a `tau-slicer-service/1` endpoint and verifies the returned bytes.
- **Bambu Studio when it is installed** — the `bambu-studio` engine runs the person's own Bambu Studio
  on its resolved presets and returns its archive byte for byte. Tau ships none of Bambu Studio; browser
  builds resolve a stub that refuses with `BAMBU_STUDIO_UNAVAILABLE`.
- **Round trip in the box** — `@taucad/slicer/container` reads the archive the transcoder wrote and
  `@taucad/slicer/toolpath` turns its plate into a timed, struct-of-arrays program.
- **No module-scope work** — the WebAssembly kernel loads on the first slice inside the capability.

## Install

```bash
npm i @taucad/slicer @taucad/runtime zod
```

`@taucad/runtime` and `zod` are required peers — one install must hold one runtime, and the edge's
options schema is a Zod schema.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/worker';
import { slicer } from '@taucad/slicer';

const runtime = defineRuntime({ plugins: [slicer()] });
```

Hand the definition to a client — `createNodeClient`, `createRuntimeWorker`, or your own host. See
[`@taucad/runtime`](https://www.npmjs.com/package/@taucad/runtime) for the client lifecycle. A transcode
from `glb` to `gcode.3mf` returns one `model.gcode.3mf` file whose media type is
`application/vnd.bambulab.gcode-3mf`.

```typescript
import { readBambuContainer } from '@taucad/slicer/container';
import { parseGcode } from '@taucad/slicer/toolpath';

const { gcode, md5Verified } = readBambuContainer(bytes);
const program = parseGcode(gcode);
console.log(program.layerTable.length, program.duration, md5Verified);
```

## API

| Export                                    | Subpath                       | Use                                                                                  |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `slicer`, `plugin`                        | `@taucad/slicer`              | toolkit factory; the `default` preset selects the transcoder                         |
| `slicerTranscoder`                        | `@taucad/slicer`              | direct `transcoders` composition, with options                                       |
| `slicerOptionsSchema`, `slicerPresets`    | `@taucad/slicer`              | the edge's Zod options schema and the `fast`/`standard`/`fine` layer-height presets  |
| `resolveSlicerOptions`                    | `@taucad/slicer`              | apply the preset and defaults the transcoder applies, for previews                   |
| `parseGcode`, `segmentAtTime`             | `@taucad/slicer/toolpath`     | timed struct-of-arrays program from linear FFF G-code; binary search by program time |
| `toolpathSegmentKinds`, `ToolpathProgram` | `@taucad/slicer/toolpath`     | the kind palette and the program shape every consumer reads                          |
| `ToolpathParseError`                      | `@taucad/slicer/toolpath`     | typed refusal with a `TOOLPATH_*` code and the offending record                      |
| `writeBambuContainer`                     | `@taucad/slicer/container`    | wrap plate G-code in a print-ready `gcode.3mf` archive                               |
| `readBambuContainer`                      | `@taucad/slicer/container`    | bounded reader returning the plate, its recorded MD5 and every member digest         |
| `readBambuContainerProducer`              | `@taucad/slicer/container`    | name the slicer that produced an archive (Bambu Studio or the reference engine)      |
| `findBambuStudio`                         | `@taucad/slicer/bambu-studio` | the installed Bambu Studio and its version, or `undefined` (always outside Node)     |
| `loadBambuStudioCatalog`                  | `@taucad/slicer/bambu-studio` | printer, process and filament presets Bambu Studio offers, optionally per printer    |
| `resolveBambuStudioSelection`             | `@taucad/slicer/bambu-studio` | complete a preset selection from printer hints (model, nozzle, trays, plate)         |
| `describeBambuStudioSettings`             | `@taucad/slicer/bambu-studio` | grouped JSON Schema and current values of a selection's settings                     |
| `sliceWithBambuStudio`                    | `@taucad/slicer/bambu-studio` | slice parts with Bambu Studio, one filament each; return its `.gcode.3mf` untouched  |
| `BambuStudioError`, `bambuPlates`         | `@taucad/slicer/bambu-studio` | typed refusal with a `BAMBU_STUDIO_*` code; plate ids and Bambu Studio's names       |

### Options

| Option              | Default     | Notes                                                                                          |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `engine`            | `reference` | `service` requires `service.url` and `service.token`; `bambu-studio` needs Node and an install |
| `bambuStudio`       | —           | `printer`, `process`, `filaments`, `plate`, `settings` and `hints`; only with `bambu-studio`   |
| `preset`            | `standard`  | `fast` 0.28 mm, `standard` 0.2 mm, `fine` 0.12 mm; `layerHeight` wins                          |
| `walls`             | `2`         | 1–16 perimeters                                                                                |
| `infillPercent`     | `15`        | 0–100; `infillPattern` selects `grid` or `lines`                                               |
| `supports`          | `false`     | the reference engine refuses `true` with a content issue                                       |
| `nozzleTemperature` | `220` °C    | 150–320; `bedTemperature` 0–120, default 55                                                    |
| `printSpeed`        | `100` mm/s  | `travelSpeed` default 250 mm/s                                                                 |
| `machineProfile`    | `bambu-x1c` | `plate` default `textured-pei`; `bedSize` default 256 × 256 mm                                 |

The reference engine is deterministic: the same GLB and options always produce byte-identical archives.
It writes its own X1C start and end sequences and annotates layers with `;LAYER_CHANGE`, `;Z:` and
`;TYPE:` so the toolpath parser recovers them. Parts must fit the bed and stand 256 mm or lower.

With `engine: 'bambu-studio'` the reference-only options are ignored. Presets not named in
`bambuStudio` default from `bambuStudio.hints` (else an X1 Carbon with the `preset` and `plate`
options). `settings` apply over the resolved presets: a filament setting reaches every used filament
whose preset has that key. Bambu Studio is found through `TAU_BAMBU_STUDIO_PATH` or its default
install location, runs in a temporary directory with its own data directory, one slice at a time,
and is stopped by the operation signal or after five minutes.

### Toolpath parser

`parseGcode` accepts the closed linear subset (`G0`–`G4`, `G17`, `G21`, `G28`, `G29`, `G90`–`G92`,
`M82`–`M84`, `M104`/`M109`, `M140`/`M190`, `M141`/`M191`, `M106`/`M107`, `M201`–`M205`, `M220`,
`M221`, `M73`, `T<n>`), linearises arcs, keeps Bambu vendor records as `vendor` events and counts
everything else as `unknown`. Sources over 64 MiB or 1,100,000 records are refused, as is extruder
motion before any nozzle temperature was commanded.

## Environment

| Host           | Supported | Notes                                                                                       |
| -------------- | --------- | ------------------------------------------------------------------------------------------- |
| Browser worker | Yes       | `manifold-3d` WebAssembly resolves through `import.meta.resolve`                            |
| Node.js        | Yes       | `>=24`; the `node` condition of `@taucad/slicer/bambu-studio` loads the Bambu Studio engine |

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
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/slicer)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/slicer/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)
