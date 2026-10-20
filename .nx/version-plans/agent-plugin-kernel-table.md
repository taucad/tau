---
agent-plugin: minor
build123d: minor
picogk: minor
---

The plugin's `tau` skill says which kernel to choose and when: one table names, for replicad, OpenSCAD, JSCAD, Manifold, PicoVoxel, SMLib, tscircuit, build123d, PicoGK, Zoo (KCL) and OpenCascade.js, the entry file, the import, when to use it, when to avoid it, what it needs first and its skill. KCL is not available from the plugin, and a `.py` or `.cs` model needs `prepare_kernel` once, after asking the user. The plugin now ships `cad-build123d` and `cad-picogk`, so every kernel the table recommends has its skill; `cad-zoo`, `cad-smlibpy` and `cad-opencascadejs` stay out.

The skill also gathers what the other plugin changes tell the agent: `projectRoot` and `rootDir`, the `evaluate_model` summary and admission warning, when a `test_model` row is a failure and when a limit is worth a retry, the planetary GeoSpec example, the done criteria for a static part, a moving assembly and a manufacturing file, mechanisms and showing the source rather than an export, `@cad[...]` references and `view_state`, and, when the Tau tools are missing, the CLI version the plugin needs, `dist/launch.mjs`, the doctor and the instructions sentence that shows a chat has the tools.

The `cad-build123d` and `cad-picogk` descriptions say they apply in Tau Desktop or in the Tau plugin after `prepare_kernel`.
