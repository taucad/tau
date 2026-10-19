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
  "$schema": "https://tau.new/schemas/tau-schema-v1.json",
  "id": "proj_V1StGXR8Z5jdHi6BmyT3a",
  "name": "Wall bracket",
  "description": "",
  "tags": [],
  "assets": { "main": { "entryPath": "main.ts" } }
}
```

`id` is `proj_` and 21 letters or digits. Generate a new one for each project you create, and keep an existing project's `id` unchanged.

## Kernels

The entry's extension picks the kernel. A `.ts` or `.js` entry runs on the kernel whose library it, or a file it imports, imports. Choose the kernel from the table, then load its skill before writing model code.

| Kernel         | Entry       | Imports                   | Use it when                                                                                                                                                                | Avoid it when                                                                                                            | Prerequisites                                                         | Skill                 |
| -------------- | ----------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------- |
| replicad       | `main.ts`   | `replicad`                | Parts and assemblies that need exact BRep: machined or printed parts, fillets and chamfers, STEP out, named interfaces, mechanisms; the default when the user does not say | Mesh repair, voxel or lattice work; the user asked for another language                                                  | none                                                                  | `cad-replicad`        |
| OpenSCAD       | `main.scad` | none                      | The user writes OpenSCAD or brings `.scad` files; quick CSG for printing                                                                                                   | Exact BRep, STEP or fillets are needed (output is a mesh); moving parts                                                  | none                                                                  | `cad-openscad`        |
| JSCAD          | `main.ts`   | `@jscad/modeling`         | JavaScript CSG built from 2D profiles extruded once; existing JSCAD code                                                                                                   | Exact BRep or STEP (curves become mesh evidence)                                                                         | none                                                                  | `cad-jscad`           |
| Manifold       | `main.ts`   | `manifold-3d/manifoldCAD` | Robust booleans on meshes, combining or repairing STL and OBJ input, fast large CSG                                                                                        | STEP or exact topology is needed (output is a mesh)                                                                      | none                                                                  | `cad-manifold`        |
| PicoVoxel      | `main.ts`   | `picovoxel`               | Lattices, gyroids, signed-distance fields, porous or organic forms; voxel-native materials and mechanisms                                                                  | Thin precise features or STEP (output is a mesh; cost grows as `voxelSize` shrinks)                                      | none                                                                  | `cad-picovoxel`       |
| SMLib          | `main.ts`   | `@classcad/smlibwasm`     | NURBS BRep solids in TypeScript with smlibpy's build123d-style algebra API; the user asks for SMLib                                                                        | The user did not ask for SMLib (replicad is the default for exact BRep)                                                  | none                                                                  | `cad-smlib`           |
| tscircuit      | `main.tsx`  | `tscircuit`               | Circuit boards: schematic, PCB layout, BOM, 3D board                                                                                                                       | Anything that is not electronics                                                                                         | none                                                                  | `cad-tscircuit`       |
| build123d      | `main.py`   | `build123d`               | The user wants Python or build123d; exact BRep with labels preserved in the topology and STEP                                                                              | The computer may not download a runtime, or the user did not ask for Python (replicad gives the same BRep in TypeScript) | `prepare_kernel {"kernel":"build123d"}` once per computer (194 MB)    | `cad-build123d`       |
| PicoGK         | `main.cs`   | `PicoGK` (C#)             | The user asks for PicoGK or C# voxel engineering                                                                                                                           | Everything PicoVoxel does without a runtime download                                                                     | `prepare_kernel {"kernel":"picogk"}` once per computer (.NET runtime) | `cad-picogk`          |
| Zoo (KCL)      | `main.kcl`  | none                      | Not available from the plugin                                                                                                                                              | Always: offer replicad for a new model                                                                                   | not available from the plugin                                         | none                  |
| OpenCascade.js | `main.ts`   | `libcascade`              | An OCCT operation replicad lacks, when the user accepts manual `.delete()` memory management                                                                               | Everything else: prefer replicad on the same kernel                                                                      | none                                                                  | none; prefer replicad |

A `.py` or `.cs` entry answers `KERNEL_NOT_PREPARED` until its runtime is prepared: ask the user before calling `prepare_kernel`, which downloads it once. An existing `.py` entry that imports `smlibpy` runs on the native SMLibPy kernel, for which the plugin ships no skill; write new Python models in build123d.

The kernels' libraries come with the server: do not install them or add a `package.json` for them. Existing STEP, IGES, BREP, 3DM, glTF and mesh files (STL, OBJ, 3MF, FBX and more) open for evaluation, screenshots and conversion, not for authoring.

## The loop

1. Write or update GeoSpec tests for the stated requirements before changing geometry.
2. Edit the model.
3. `evaluate_model` on the entry file. Fix every error, and read the issues even when `status` is `ready`. Its `summary` gives the default view's box in millimetres (`bounds`, Z up), its part count and its mesh size without running a test. An `admission.warning` means a whole-model `loadModel` of this model is estimated to be refused at this capacity: keep the model and its assertions as designed, and expect those claims to be reported as not decided.
4. `test_model` runs the project's GeoSpec suite, or one file or test by name. Fix the model, not the test, unless the requirement changed.
5. `screenshot` the views that show the change, and look at the images before you describe the result.
6. `export_model` only when the user asks for a file. `evaluate_model` lists the export IDs a file offers; pass one, or an extension such as `step`, `stl` or `3mf`.
7. `arrange_workbench` is optional: it opens views and panes for a person who has the project open in the Tau app (skill `workbench`).

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

A moving assembly exports a `mechanism` beside its geometry. After `evaluate_model`, read `mechanism`: `declared` says the source exports one, and `admitted` says the default view carries it. When it is declared but not admitted, fix the path its `issues` name rather than the geometry. Show the source, not an export: `show_model { targetFile: 'main.ts' }` shows the parameters and mechanism, and its `mechanism.preserved` says whether the page received them. A file under `.tau/artifacts` is an export, drawn as exported: `show_model` on it answers a `hint` naming its source. Never deliver a moving assembly as a `.glb` from `.tau/artifacts`.

## Files Tau writes

- Exports go under `.tau/artifacts/` in the project; the result lists each file's project-relative path.
- Screenshots come back in the tool result; their image files stay in a temporary folder outside the project.
- `arrange_workbench` writes the view and pane records under `.tau/workbench/`.

Leave `.tau/artifacts/` out of commits unless the user wants exports versioned.

## The other skills here

The kernel skills and `workbench` are shared with the agent inside the Tau app. Where one says `read_file`, `create_file` or `edit_file`, use your own file tools. Their API references (`api-index.md` and the files it names) sit beside each `SKILL.md`: search the index for a name, then read only the section you need.

## Printing

This server does not send jobs to printers. For a print, export STL or 3MF with `export_model` and give the user the path to open in their slicer.

## When the server is missing

If no Tau tools are available, the server could not start. It needs Node.js 24 or later and a Tau CLI of the plugin's own version: `npm install -g @taucad/cli@<plugin version>`, or set `TAU_CLI` to a `tau` executable of that version. Otherwise it fetches that version with `npx`, which can take minutes on first use; if Node.js, npm or npm's cache would stop `npx`, the server exits with one `tau:` line naming the fix, which `node <plugin folder>/dist/launch.mjs </dev/null` prints.

If the Tau tools are missing or the server fails to start, ask the user to run `node <plugin folder>/dist/doctor.mjs` (for example `node ~/.claude/plugins/cache/taucad/tau/<version>/dist/doctor.mjs`, or the same under `~/.codex/plugins/cache/`): it prints one line per check and `next` lines with the exact commands that fix what it found.

The last sentence of the Tau server's instructions names the CLI version, how it was started and the server version; if you can read it, this chat has the Tau tools. If the viewer says "This Tau server has no export formats", the server runs another CLI version: install the version it names with `npm install -g @taucad/cli@<version>` (or point `TAU_CLI` at a `tau` of that version), then restart the Tau server or your agent and show the model again.
