---
host: minor
mcp: minor
---

`show_model` gives the viewer the source's CAD topology and mechanism. The GLB it renders through `export_model` now carries the `TAU_cad_topology` extension whenever the GLB route the runtime takes for the source's kernel can carry it, so the viewer's Kinematics pane lists and plays the mechanism the source declares. Before, the shown GLB held the mesh alone and a declared mechanism was lost between the source and the page. The GLB is the one `tau export --content='{"includeTopology":true}'` writes; on the planetary gear test project it grows from 4.65 MB to 5.10 MB. A source whose route carries no topology, such as an imported STEP file, is shown as before.

`export_model` takes an optional `content: { includeEdges?, includeTopology? }`, in Tau and over `tau mcp`, to export the CAD topology or the visible edge lines with the geometry. Only a key set to `true` is a request: `false` exports exactly as omitting the key or `content` does, on any route. A route that cannot carry a key set to `true` refuses it with `VALIDATION_ERROR`, and the message names the exports of that source that carry it, for example "Export to glb or gltf to keep includeTopology, or omit it." The viewer's Export pane still exports without topology.
