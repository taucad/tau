---
build123d: minor
---

build123d draws its own edges. Its model view and its GLB export now declare `includeEdges`, so the runtime no longer runs the fallback `gltfEdgeDetection` pass for build123d. Before, the worker wrote exact B-rep edge lines into every GLB and the fallback then added its own dihedral lines over the same triangles: a build123d model in the viewer carried two edge sets and paid for edge detection on every render, and above 500,000 triangles it lost the fallback set. The lines now come from the worker alone, at the same effective tolerances as the surface, including after a budget downgrade, and at any triangle count.

The worker samples edges only when the caller asks. A `mesh` request carries `includeEdges`, which the kernel sets from the render or export `content`. With `includeEdges: true` the lines are the same ones build123d wrote before, byte for byte: one `LINES` primitive per part with `tauComponentKind: 'line'`, `tauComponentSelector` `node/<n>/edges` and `edgeGroups`. Without it, the worker skips edge sampling and writes no `LINES` primitive, no edge material and no `edgeGroups`.

Deliberate change to GLB export bytes: a build123d GLB export that does not ask for `includeEdges` no longer carries edge lines. This matches replicad and the runtime's export default (`includeEdges: false`). Ask for them with `export('glb', { content: { includeEdges: true } })`. STEP exports are unchanged.

The kernel version gains `edges1`, so cached renders and exports regenerate.
