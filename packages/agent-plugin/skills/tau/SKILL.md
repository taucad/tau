---
name: tau
description: Starts Tau code-CAD work in a project folder — the project layout and tau.json, which kernel and skill each model file uses, and the evaluate_model, test_model, screenshot and export_model loop; use whenever the user mentions Tau, CAD, a 3D part, model or assembly, a GeoSpec test, a STEP/STL/3MF export or 3D printing.
---

# Tau

Tau runs code-CAD models from files in a project folder. This plugin's `tau` server evaluates a model, runs its GeoSpec geometry tests, renders screenshots and exports files. You write and edit the files with your own file tools; the server never edits source.

## Project

A Tau project is a folder whose model entry file, normally `main.<ext>` at its root, may import library files (`lib/bracket.ts`, `lib/hinge.scad`). Every tool takes project-relative paths. The server works in the folder your host names: Codex sends the thread's folder with each call, Claude Code its project folder.

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

The entry's extension picks the kernel. A `.ts` or `.js` entry runs on the kernel whose library it, or a file it imports, imports. Load the kernel's skill before writing model code.

| Kernel                                       | Entry       | Imports           | Skill                 |
| -------------------------------------------- | ----------- | ----------------- | --------------------- |
| replicad: BRep solids, the default for parts | `main.ts`   | `replicad`        | `cad-replicad`        |
| OpenSCAD                                     | `main.scad` | —                 | `cad-openscad`        |
| JSCAD                                        | `main.ts`   | `@jscad/modeling` | `cad-jscad`           |
| Manifold: robust mesh booleans               | `main.ts`   | `manifold-3d`     | `cad-manifold`        |
| PicoVoxel: voxels, SDFs, lattices            | `main.ts`   | `picovoxel`       | `cad-picovoxel`       |
| tscircuit: circuit boards                    | `main.tsx`  | `tscircuit`       | `cad-tscircuit`       |
| OpenCascade.js                               | `main.ts`   | `libcascade`      | none; prefer replicad |

The kernels' libraries come with the server: do not install them or add a `package.json` for them. Existing STEP, IGES, BREP, 3DM, glTF and mesh files (STL, OBJ, 3MF, FBX and more) open for evaluation, screenshots and conversion, not for authoring.

## The loop

1. Write or update GeoSpec tests for the stated requirements before changing geometry.
2. Edit the model.
3. `evaluate_model` on the entry file. Fix every error, and read the issues even when `status` is `ready`.
4. `test_model` runs the project's GeoSpec suite, or one file or test by name. Fix the model, not the test, unless the requirement changed.
5. `screenshot` the views that show the change, and look at the images before you describe the result.
6. `export_model` only when the user asks for a file. `evaluate_model` lists the export IDs a file offers; pass one, or an extension such as `step`, `stl` or `3mf`.
7. `arrange_workbench` is optional: it opens views and panes for a person who has the project open in the Tau app (skill `workbench`).

These are the Tau server's tools; your host may show them with a server prefix. Repeat steps 2–5 until the model evaluates cleanly and the tests pass.

## GeoSpec

Tests sit beside the model as `*.geospec.ts` (or `*.geospec.js`) and import `geospec` and `geospec/model`; the test runner provides both, so nothing is installed. Load `geospec-authoring` before writing one. Assert measured requirements — overall size, wall thickness, hole positions and diameters, a closed watertight solid — rather than restating the code.

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

If no Tau tools are available, the server could not start. It needs Node.js 24 or later and the Tau CLI: `npm install -g @taucad/cli@beta`, or set `TAU_CLI` to a `tau` executable. Without either it fetches the CLI with `npx`, which can take minutes on first use.
