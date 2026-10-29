# Launch kernel showcase

Draft models for the 10 November 2026 launch. One model per kernel, chosen for a job that kernel does and the others do awkwardly. They live in `src/kernels/<kernel>/<example>/` like every other example. A public row (`model`, no `example.json`) is a builtin at `/s/builtin~<kernel>.<example>` once it has a thumbnail. A `reference` row is staged: in the manifest, not a builtin, not health-gated.

These rows are not in `communityLocators`. The Community shelf stays as it is until someone promotes a finished model. Marketing-site copy is untouched.

Renders are the example thumbnail pipeline (`libs/tau-examples/scripts/generate-thumbnails.mts`), which calls the runtime and NanoRaster at a fixed camera (1536×1152 WebP, 6 px edges). Copies of the renders that succeeded are also under the PR artifacts.

## Catalog versus the launch list

The product catalog (`kernelConfigurations`) has twelve offerings. The launch list has eleven.

| Asked for       | Catalog id      | Example directory | Notes                                                                                                                                                    |
| --------------- | --------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replicad        | `replicad`      | `replicad`        | Browser OpenCascade, TypeScript                                                                                                                          |
| OpenCascade     | `opencascadejs` | `opencascade`     | The locator kernel is the directory name, `opencascade`, not `opencascadejs`                                                                             |
| OpenSCAD        | `openscad`      | `openscad`        | Executed by the `openrscad` engine                                                                                                                       |
| JSCAD           | `jscad`         | `jscad`           |                                                                                                                                                          |
| Manifold        | `manifold`      | `manifold`        |                                                                                                                                                          |
| PicoVoxel       | `picovoxel`     | `picovoxel`       | PicoGK's OpenVDB engine in WebAssembly. `backendProvider` is `picogk`                                                                                    |
| tscircuit       | `tscircuit`     | `tscircuit`       |                                                                                                                                                          |
| SMLib (browser) | `smlib`         | `smlib`           |                                                                                                                                                          |
| build123d       | `build123d`     | `build123d`       | Desktop native. In `workspaceRuntime` only, not `exampleRuntime`, so a public `model` row is not allowed                                                 |
| PicoGK          | `picogk`        | `picogk`          | Desktop native, macOS arm64 closure                                                                                                                      |
| Zoo KCL         | `zoo`           | `zoo`             | Pro, metered. Not composed in either thumbnail runtime. Entry is `main.kcl`                                                                              |
| —               | `smlibpy`       | `smlibpy`         | Not on the launch list. Native Python twin of browser SMLib. Existing rows (hinged box, plate, materials) are already `reference` and ship no thumbnails |

The sensor breakout and the sensor shell are a pair: both use a 42 mm × 26 mm × 1.6 mm board. They do not share a kernel.

## Models

| Kernel      | What it does best                                     | Showcase                                                | Key parameters                                                       | Why another kernel struggles                                                                                                                   | Render       | Run        |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| Replicad    | Exact BRep in TypeScript: fillets, shells, STEP       | Sensor Shell (`replicad.usb-sensor-shell`)              | `wall`, `clearance`, `cavityHeight`, `cornerRadius`, `usbWidth`      | A mesh shell prints, then the fillet is gone and there is no STEP                                                                              | rendered     | ran        |
| OpenCascade | Full kernel: lofts through matching section wires     | Hose Adapter (`opencascade.hose-adapter`)               | `inletDiameter`, `outletWidth`, `outletHeight`, `wall`, `bend`       | A cone covers circle-to-circle. A hull between the ends misses the bent middle section                                                         | rendered     | ran        |
| OpenSCAD    | CSG and the customizer, the Thingiverse shape         | Parts Bin (`openscad.parts-bin`)                        | `length`, `width`, `height`, `wall`, `corner_radius`, `scoop_radius` | A BRep fillet or a voxel field is a long way around a difference of two offsets                                                                | rendered     | ran        |
| JSCAD       | Functional CSG, especially `hull`                     | Pebble Soap Dish (`jscad.pebble-soap-dish`)             | `length`, `width`, `bead`, `wall`, `drainDiameter`                   | A filleted box stays a box. `minkowski` can imitate the pebble and then crawls                                                                 | rendered     | ran        |
| Manifold    | Fast, robust mesh booleans at a count                 | Honeycomb Grille (`manifold.honeycomb-grille`)          | `diameter`, `cellSize`, `border`, `opening`                          | Dozens of tiled hex cuts are where OpenCascade and CGAL get expensive                                                                          | rendered     | ran        |
| PicoVoxel   | Implicit and voxel lattices in the browser            | Gyroid Lantern (`picovoxel.gyroid-lantern`)             | `voxelSize`, `radius`, `period`, `wall`                              | No BRep or CSG kernel has a gyroid; they can only mesh a substitute                                                                            | rendered     | ran        |
| tscircuit   | A circuit, a PCB and a 3D board from one TSX tree     | USB-C Sensor Breakout (`tscircuit.usb-sensor-breakout`) | `seriesOhms`, `pullupOhms`                                           | No mechanical kernel places a footprint or emits a BOM                                                                                         | rendered     | ran        |
| SMLib       | NURBS sweeps and exact curves in the browser          | Coat Hook (`smlib.coat-hook`)                           | `reach`, `rise`, `gripRadius`, `plateHeight`                         | A mesh hull chords the spline. The curve does not survive into STEP                                                                            | rendered     | ran        |
| build123d   | Native Python OpenCascade, fillets and STEP           | Bearing Pillow Block (`build123d.bearing-pillow-block`) | `bearing_od`, `bore_clearance`, `fillet_radius`, `hole_spacing`      | OpenSCAD can difference a bore and then the cylinder is a mesh                                                                                 | not rendered | unverified |
| PicoGK      | Native OpenVDB implicits, finer than the browser heap | Gyroid Heat Exchanger (`picogk.gyroid-heat-exchanger`)  | `VoxelSizeMm`, `CellMm`, `PortRadiusMm`, `CapMm`                     | PicoVoxel is the same engine until the grid no longer fits a tab. A BRep kernel has no gyroid                                                  | not rendered | unverified |
| Zoo KCL     | Cloud GPU solids, patterns, STEP, past a WASM tab     | Vented Panel (`zoo.vented-panel`)                       | `columns`, `rows`, `holePitch`, `cornerRadius`                       | Manifold cuts the holes faster as mesh and drops the fillets. A browser BRep session is the one that runs out of memory when the pattern grows | not rendered | unverified |

build123d, PicoGK and Zoo are `reference` on purpose. The other eight are public builtins, and each has a 1536×1152 thumbnail. “Ran” means the thumbnail pipeline evaluated the model and exported a GLB. It is not a watertight health pass.

## Why three rows have no render

- **build123d** is omitted from `exampleRuntime`. The thumbnail generator only renders kernels composed there. Preparing the native kernel would still not put a thumbnail in the checked-in set, because those examples are specified to ship none.
- **PicoGK** is in `exampleRuntime`, and a prepared macOS arm64 closure would render it. This VM is Linux. `tau prepare picogk` cannot seal that closure here.
- **Zoo** is not composed in `exampleRuntime` or `workspaceRuntime`. A render also needs a Pro credential this draft does not have. `main.kcl` is recognized as an entry so the source is a real manifest row.
