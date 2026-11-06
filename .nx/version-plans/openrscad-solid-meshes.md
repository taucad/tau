---
openrscad: minor
host: minor
cli: minor
skills: minor
viewer: minor
---

Consume `@taulabs/openrscad-engine` 0.11.0-beta.5, whose GLB writes each closed solid as one leaf node and one `EXT_mesh_manifold` mesh under mesh-less module nodes, with each primitive naming its owning module in `extras.openrscad.owner`. GeoSpec now judges a part built from OpenSCAD modules as one watertight solid, so `toBeWatertight` and `toHaveConnectedComponents({ count: 1 })` pass on it. The OpenRSCAD kernel adds a `TAU_cad_topology` payload to the preview and to the GLB export, built from that ownership, so selecting, hiding or isolating a module in Explorer still acts on exactly its triangles; a module that made one solid stays one row. The kernel version is 0.11.0-beta.5. The `cad-openscad` doctrine adds that modules, `render()` and code structure never change the exported surface, and that a GeoSpec verdict which changes after such a refactor is a suspected tool defect to report with both runs' evidence. A new `openscad.chamfered-cutout-cube` example and its GeoSpec suite guard the modular case end to end. The viewer gives a glTF node that holds one primitive and has child nodes a group of its own, so an OpenRSCAD module's feature edges no longer take its solids with them when they become fat lines or are hidden.
