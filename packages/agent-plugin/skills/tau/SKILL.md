---
name: tau
description: Starts Tau code-CAD work in a project folder — the project layout and tau.json, which kernel to choose and when, the skill each model file needs, and the evaluate_model, test_model, screenshot and export_model loop; use whenever the user mentions Tau, CAD, a 3D part, model or assembly, a GeoSpec test, a STEP/STL/3MF export or 3D printing.
---

# Tau

Tau runs code-CAD models from files in a project folder. This plugin's `tau` server evaluates a model, runs its GeoSpec geometry tests, renders screenshots and exports files. You write and edit the files with your own file tools; the server never edits source.

## Project

A Tau project is a folder whose model entry file, normally `main.<ext>` at its root, may import library files (`lib/bracket.ts`, `lib/hinge.scad`). Every tool takes project-relative paths. The server works in the folder your host names: Codex sends the thread's folder with each call, Claude Code its project folder. Each result names that folder as `projectRoot`: every `targetFile` and every GeoSpec `loadModel({ file })` resolves against it, and a suite that loads from a subfolder passes `rootDir`, as in `loadModel({ file: 'main.ts', rootDir: 'parts/gear' })`.

`tau.json` is optional for the tools and lets the Tau app open the folder as a project. Its schema is strict: write exactly these keys (`assets.main.thumbnail`, `syncChats` and `syncLargeExports` are the only optional extras).

```json
{
  "$schema": "https://tau.new/schemas/tau-v1.json",
  "name": "Wall bracket",
  "description": "",
  "tags": [],
  "assets": { "main": { "entryPath": "main.ts" } }
}
```

Do not add `id` or `projectId`. Tau creates and preserves project identity automatically when the folder is opened.

## Kernels

<!-- generated:kernel-routing-card:start (pnpm nx run chat:generate-kernel-routing) -->

If the project has no model file, choose a kernel before writing one. Once an entry file exists, its kernel is the project's: keep it.

The entry file binds the kernel: its extension, and for `.ts`, `.js` and `.py` the library the entry imports. Before writing it, choose the kernel with these rules.

### Kernels available here

| Kernel      | Entry       | Imports                   | Use when                                                                                                                                                                                     | Avoid when                                                                                                           | Prerequisites                                                                            | Skill           |
| ----------- | ----------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| PicoGK      | `main.cs`   | none                      | Computational engineering in C#: reusing PicoGK or LEAP 71 code, or a voxel model the browser runs out of memory on                                                                          | STEP or an exact B-rep is needed, or the work can stay in TypeScript in the browser                                  | The desktop app or the CLI; downloads a .NET runtime once per computer                   | `cad-picogk`    |
| PicoVoxel   | `main.ts`   | `picovoxel`               | Computational engineering (lattices and graded infill, TPMS and gyroid cores, heat exchangers, conformal cooling channels, porous implants) and blended, branching or stylised organic forms | STEP, an exact B-rep or thin precise features are needed; output is a mesh, and time rises as the voxel size shrinks | none                                                                                     | `cad-picovoxel` |
| Build123d   | `main.py`   | `build123d`               | Python is asked for or Python code is reused; exact B-rep parts and assemblies with labelled topology and STEP                                                                               | Python is not asked for and the work can run in the browser                                                          | The desktop app or the CLI; downloads a native Python runtime once per computer (194 MB) | `cad-build123d` |
| SMLibPy     | `main.py`   | `smlibpy`                 | NURBS B-rep in Python, physical materials, textures and mechanisms, or a project that already imports smlibpy                                                                                | build123d's builder mode, joints or STEP labels are needed, or Python is not asked for                               | The desktop app or the CLI; downloads a native runtime once per computer                 | `cad-smlibpy`   |
| OpenSCAD    | `main.scad` | none                      | Boxes, cylinders and holes; a script others will adjust; a `.scad` file or a MakerWorld or Thingiverse customiser; a script around an imported mesh                                          | STEP, edge fillets or exact mating geometry are needed; output is a mesh                                             | none                                                                                     | `cad-openscad`  |
| Replicad    | `main.ts`   | `replicad`                | Exact B-rep parts and assemblies: edge fillets and chamfers, shells, lofts, sweeps and revolves, standard or toleranced features, fits to bought parts, STEP                                 | Lattices or field-driven geometry, mesh repair, a `.scad` deliverable, or another language is asked for              | none                                                                                     | `cad-replicad`  |
| Manifold    | `main.ts`   | `manifold-3d/manifoldCAD` | Repairing, combining or remixing an existing mesh (STL, OBJ, 3MF); fast, robust mesh booleans                                                                                                | STEP or exact topology is needed; output is a mesh                                                                   | none                                                                                     | `cad-manifold`  |
| JSCAD       | `main.ts`   | `@jscad/modeling`         | JSCAD is asked for, or existing JSCAD code is reused                                                                                                                                         | STEP or an exact B-rep is needed; curves become facets                                                               | none                                                                                     | `cad-jscad`     |
| OpenCascade | `main.ts`   | `libcascade`              | An OpenCascade operation replicad lacks, or the direct OCCT API is asked for                                                                                                                 | Replicad covers the operation on the same kernel without manual memory management                                    | none                                                                                     | none            |
| SMLib       | `main.ts`   | `@classcad/smlibwasm`     | Freeform NURBS surfaces in TypeScript, or SMLib is asked for                                                                                                                                 | A plain prismatic part that needs no NURBS surfaces                                                                  | none                                                                                     | `cad-smlib`     |
| tscircuit   | `main.tsx`  | none                      | Circuit boards: schematics, PCB layouts, netlists, BOM and fabrication files                                                                                                                 | Anything that is not electronics; an enclosure for a board is a separate model                                       | none                                                                                     | `cad-tscircuit` |

### Rules, applied in order; each removes kernels

1. Ownership: when the project has an entry file, keep its kernel. A project never migrates.
2. Entitlement: choose only from the kernels available here.
3. Explicit request: A kernel named in the request: that kernel. Python: Build123d, SMLibPy. C#: PicoGK. KCL: none available here. A `.scad` file: OpenSCAD. Say it is not available here and offer the nearest available kernel.
4. Required output: STEP or an exact B-rep hand-off; standards-based or toleranced mating geometry (a thread, a gear, an H7 bore): Build123d, SMLibPy, Replicad, OpenCascade, SMLib. A board, schematic, netlist, BOM or fabrication files: tscircuit. A `.scad` file, or a MakerWorld or Thingiverse customiser: OpenSCAD.
5. Required input: An existing mesh to repair, combine or remix: OpenSCAD, Manifold. An existing mesh to offset, hollow or lattice: PicoGK, PicoVoxel.
6. Process: Machining, sheet metal or casting (moulding counts as casting) named in the request: Build123d, SMLibPy, Replicad, OpenCascade, SMLib.
7. Representation: Computational engineering: lattices and graded infill, TPMS and gyroid cores, heat exchangers and cold plates, conformal and regenerative cooling channels, porous implants, topology-optimised and lightweighted structures, additive manifolds with blended internal passages: PicoGK, PicoVoxel. Does not fire on "Lightweight" or "organic" alone, a plate of plain holes, a honeycomb drawn as a pattern.

Two rules with no common survivor, such as a lattice core that must ship as STEP, are a conflict: ask.

### Use cases

In a broad zone every listed kernel is correct: weigh the signals against the request, choose, and name the trade-off you weighed. Do not ask. A request that fits no row is read against the nearest one.

| Use case                                                                                                                   | Tier   | Acceptable                                       | Signals                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1 Everyday functional prints: brackets, mounts, clips, organisers, spare parts                                            | broad  | Build123d, OpenSCAD, Replicad                    | OpenSCAD: boxes, cylinders and holes; a script others will adjust; Replicad: edge fillets or chamfers, shells, snap fits, a fit to a bought part, a likely later STEP                                                                                                                                                                                                                                                                                   |
| U2 Enclosures and housings                                                                                                 | broad  | Build123d, OpenSCAD, Replicad                    | Replicad: shelled walls, filleted corners, bosses, a board or supplier fit; OpenSCAD: a plain box and lid                                                                                                                                                                                                                                                                                                                                               |
| U3 Standard mechanical components: gears, flanges, shafts, fasteners                                                       | narrow | Build123d, SMLibPy, Replicad, OpenCascade, SMLib | OpenCascade: an operation replicad lacks; SMLibPy, SMLib: NURBS surfaces; Build123d: Python or existing Python code; Replicad: none of those                                                                                                                                                                                                                                                                                                            |
| U4 Parts for a manufacturing process (machining, sheet metal, casting)                                                     | narrow | Build123d, SMLibPy, Replicad, OpenCascade, SMLib | OpenCascade: an operation replicad lacks; SMLibPy, SMLib: NURBS surfaces; Build123d: Python or existing Python code; Replicad: none of those                                                                                                                                                                                                                                                                                                            |
| U5 Assemblies and mechanisms in one domain                                                                                 | narrow | Build123d, Replicad, OpenCascade                 | Build123d: Python or existing Python code; Replicad: none of those                                                                                                                                                                                                                                                                                                                                                                                      |
| U6 Product and consumer forms                                                                                              | broad  | PicoVoxel, Build123d, SMLibPy, Replicad, SMLib   | Replicad: lofts, sweeps, revolves, STEP for tooling; SMLib: freeform NURBS surfaces; PicoVoxel: blended or variable-wall forms made by printing                                                                                                                                                                                                                                                                                                         |
| U7 Organic and decorative forms                                                                                            | broad  | PicoGK, PicoVoxel, OpenSCAD, Replicad            | PicoGK, PicoVoxel: blended, branching, thickened, textured or bio-inspired forms; Replicad: a clean revolve or loft, or STEP; OpenSCAD: geometric patterns, text, polyhedra                                                                                                                                                                                                                                                                             |
| U8 Computational engineering                                                                                               | narrow | PicoGK, PicoVoxel                                | PicoVoxel: the work is in the browser, or in TypeScript; PicoGK: on desktop, and C# is asked for, PicoGK or LEAP 71 C# code is reused, or the browser runs out of memory (`PICO_OUT_OF_MEMORY`). Model the whole additive part, ports, flanges and bosses included, in the voxel model. Say the output is a mesh (STL, GLB) with no STEP, and that the voxel size sets the thinnest wall. Ask when the request also needs STEP or a machined interface. |
| U9 Electronics                                                                                                             | narrow | tscircuit                                        | A board with an enclosure is two models: build the one asked for and name the other.                                                                                                                                                                                                                                                                                                                                                                    |
| U10 Architectural elements, furniture, flat stock                                                                          | broad  | Build123d, OpenSCAD, Replicad                    | Replicad: dimensioned joinery and panels; OpenSCAD: a scale or massing model                                                                                                                                                                                                                                                                                                                                                                            |
| U11 Teaching and simple shapes                                                                                             | broad  | OpenSCAD, Replicad                               | OpenSCAD: the shortest readable script; Replicad: a lesson on sketches, fillets or STEP. A lesson about one kernel uses that kernel.                                                                                                                                                                                                                                                                                                                    |
| U12 From an existing mesh                                                                                                  | narrow | PicoGK, PicoVoxel, OpenSCAD, Manifold            | Manifold: repair and booleans; OpenSCAD: a script around an imported mesh; PicoGK, PicoVoxel: offset, hollow or lattice the mesh                                                                                                                                                                                                                                                                                                                        |
| U13a Stylised characters and figurines: mascots, chess pieces, low-detail creatures                                        | broad  | PicoGK, PicoVoxel                                | PicoGK, PicoVoxel: blended SDF shapes give one watertight printable body. Say the result is stylised.                                                                                                                                                                                                                                                                                                                                                   |
| U13b Realistic sculpts (likeness, fine anatomy, hair, cloth), textured game assets, sculpted jewellery; BIM and IFC models | none   | none                                             | Say so in a sentence, offer the nearest thing Tau can build (a stylised version, single architectural elements) and wait for a yes.                                                                                                                                                                                                                                                                                                                     |

### Asking and announcing

- Ask one question only when two rules conflict, when the best fit is not available here and the alternative loses something the request needs, or for a request no kernel fits. Never inside a broad zone.
- Before modelling, say in one sentence which kernel you chose and why; in a broad zone the reason is the trade-off.
- If the host refuses the entry ("No kernel handles…", `PRO_REQUIRED`, or `KERNEL_NOT_PREPARED` when its prerequisites cannot be met), choose again from the kernels above.
- When a kernel reaches a limit (`RESOURCE_LIMIT`), state the limit and stop; do not offer to move the model to another kernel.

After choosing, load that kernel's skill before writing model code; a kernel whose skill is none has no skill in this plugin.

<!-- generated:kernel-routing-card:end -->

A `.py` or `.cs` entry answers `KERNEL_NOT_PREPARED` until its runtime is prepared: ask the user before calling `prepare_kernel`, which downloads it once. A `.py` entry runs on SMLibPy when a top-level line imports `smlibpy`, and on build123d otherwise.

The kernels' libraries come with the server: do not install them or add a `package.json` for them. Existing STEP, IGES, BREP, glTF and mesh files (STL, OBJ, 3MF, FBX and more) open for evaluation, screenshots and conversion, not for authoring.

## The loop

1. Write or update GeoSpec tests for the stated requirements before changing geometry.
2. Edit the model.
3. `evaluate_model` on the entry file. Fix every error, and read the issues even when `status` is `ready`. Its `summary` gives the default view's box in millimetres (`bounds`, Z up), its part count and its mesh size without running a test. An `admission.warning` means a whole-model `loadModel` of this model is estimated to be refused at this capacity: keep the model and its assertions as designed, and expect those claims to be reported as not decided.
4. `test_model` runs the project's GeoSpec suite, or one file or test by name. Fix the model, not the test, unless the requirement changed.
5. `screenshot` the views that show the change, and look at the images before you describe the result.
6. `export_model` only when the user asks for a file. `evaluate_model` lists the export IDs a file offers; pass one, or an extension such as `step`, `stl` or `3mf`.
7. `arrange_workbench` is optional: it opens views and panes for a person who has the project open in the Tau app (skill `workbench`). `screenshot { workbenchView: '<id>' }` then captures a saved view as that person sees it: its file, camera, field of view, section cuts and display. Section offsets are metres in both tools.

These are the Tau server's tools; your host may show them with a server prefix. Repeat steps 2–5 until the model evaluates cleanly and the tests pass.

## Done

Before reporting done, name the row that applied:

| Deliverable        | Done when                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static part        | `evaluate_model` `status` is `ready`; `summary.bounds` and `componentCount` fit the brief; the whole `test_model` suite reports `runStatus: passed`. An `inconclusive`, `unsupported` or `not-run` requirement is undecided, not passed. |
| Moving assembly    | The static-part row, plus `evaluate_model` `mechanism.declared` and `mechanism.admitted` both `true`, `show_model main.ts` reporting `mechanism.preserved: true`, and the interference requirement decided.                              |
| Manufacturing file | The row above that applies, plus the `export_model` `validation` of the requested file: `watertight: true` for a GLB or STL, and the expected `solids` count and `units` for STEP.                                                       |

## Parts the person points at

A reference like `@cad[main.ts#component:node-1]` names a part in a model file: the path before `#` and the component id after it. The person adds one by right-clicking a part in the viewer (or selecting it and pressing Shift+F10) and choosing Add to chat (Send to chat on a host that only takes messages, Copy reference where the page copies it for them to paste). When they mention a part they picked or added and no reference reached you, call `view_state`: it reports the selected parts and the parts added to chat with those ids, which `show_model`'s `select` and `arrange_workbench` also take.

## GeoSpec

Tests sit beside the model as `*.geospec.ts` (or `*.geospec.js`) and import `geospec` and `geospec/model`; the test runner provides both, so nothing is installed. Load `geospec-authoring` before writing one. Assert measured requirements — overall size, wall thickness, hole positions and diameters, a closed watertight solid — rather than restating the code.

A `test_model` row is a failure only when its `status` is `failed`; `inconclusive`, `unsupported` and `not-run` rows are undecided, so report them as not decided, keep the assertion, and follow the row's suggestion. A row with `category` `analysis-limit`, `resource-limit` or `work-budget` is a claim the host could not decide, never a failure; its `limit` names the limit and the numbers, and `limit.retry` is the only retry worth making: when it is present, re-run with `workUnitLimit` set to `retry.value` where that claim's budget is set (the `test_model` argument for the run, or the claim's `loadModel` or `expectGeo` option, which wins for its own claims), and when `retry` is `null` keep the model and assertion as designed and report the claim as not decided. An `infrastructure` row is a host or engine failure, not a verdict on the model.

For a worked GeoSpec suite, read the planetary example at the tag of the release you run, `https://raw.githubusercontent.com/taucad/tau/<release-tag>/libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.geospec.ts`, never `main`: it loads `format: 'step'` only for the matchers that need exact BRep and keeps bounds and watertightness on the default mesh.

## Mechanisms

A moving assembly exports a `mechanism` beside its geometry. After `evaluate_model`, read `mechanism`: `declared` says the source exports one, and `admitted` says the default view carries it. When it is declared but not admitted, fix the path its `issues` name rather than the geometry. Show the source, not an export: `show_model { targetFile: 'main.ts' }` shows the parameters and mechanism, and its `mechanism.preserved` says whether the page received them. The viewer then follows the source: each edit to the file or its parameters redraws every open page, so call `show_model` again only to show another file. A file under `.tau/artifacts` is an export, drawn as exported: `show_model` on it answers a `hint` naming its source. Never deliver a moving assembly as a `.glb` from `.tau/artifacts`. Prove the motion before you say it works: `pose_model { animation: { id, action: 'seek', time } }` answers every coordinate at that time, and `view_state` reports what the page plays; `screenshot { pose }` captures a pose without a page.

## Files Tau writes

- Exports go under `.tau/artifacts/` in the project; the result lists each file's project-relative path.
- Screenshots come back in the tool result; their image files stay in a temporary folder outside the project.
- `arrange_workbench` writes the view and pane records under `.tau/workbench/`. The viewer page opens a model from those records too, so an arranged view stays after the person reloads the page.

Leave `.tau/artifacts/` out of commits unless the user wants exports versioned.

## The other skills here

The kernel skills and `workbench` are shared with the agent inside the Tau app. Where one says `read_file`, `create_file` or `edit_file`, use your own file tools. Their API references (`api-index.md` and the files it names) sit beside each `SKILL.md`: search the index for a name, then read only the section you need.

## Printing

This server does not send jobs to printers. For a print, export STL or 3MF with `export_model` and give the user the path to open in their slicer.

## When the server is missing

If no Tau tools are available, the server could not start. It needs Node.js 24 or later and a Tau CLI of the plugin's own version: `npm install -g @taucad/cli@<plugin version>`, or set `TAU_CLI` to a `tau` executable of that version. Otherwise it fetches that version with `npx`, which can take minutes on first use; if Node.js, npm or npm's cache would stop `npx`, the server exits with one `tau:` line naming the fix, which `node <plugin folder>/dist/launch.mjs </dev/null` prints.

If the Tau tools are missing or the server fails to start, ask the user to run `node <plugin folder>/dist/doctor.mjs` (for example `node ~/.claude/plugins/cache/taucad/tau/<version>/dist/doctor.mjs`, or the same under `~/.codex/plugins/cache/`): it prints one line per check and `next` lines with the exact commands that fix what it found.

The last sentence of the Tau server's instructions names the CLI version, how it was started and the server version; if you can read it, this chat has the Tau tools. If the viewer says "This Tau server has no export formats", the server runs another CLI version: install the version it names with `npm install -g @taucad/cli@<version>` (or point `TAU_CLI` at a `tau` of that version), then restart the Tau server or your agent and show the model again.
