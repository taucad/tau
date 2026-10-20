---
host: minor
mcp: minor
---

`tau mcp` tells the agent how the viewer relates to sources and exports.

- `show_model` and `open_model_file` on an export under `.tau/artifacts` (a GLB, STEP or any other file `export_model` wrote) answer with a `hint` naming the source it was exported from, also as the last line of their text: "`.tau/artifacts/<call>__main.ts-step/assembly.step` is an export of main.ts, drawn as exported. Call show_model with targetFile main.ts to show the source with its parameters and mechanism." The source is found from the export folder's name, so a GLB export in the current `<call>__<source>-<format>/` layout keeps its source's parameters in the viewer again.
- The `initialize` instructions of a server with the viewer say that `show_model` on a source shows it with its parameters and mechanism while showing an exported file shows that file only, and that a reference like `@cad[main.ts#component:node-1]` names a part whose id `view_state`, `show_model` `select` and `arrange_workbench` share.
- `TauViewerShowResult` in `@taucad/mcp/viewer-protocol` gains an optional `hint`.
