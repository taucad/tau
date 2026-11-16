---
runtime: minor
assimp: minor
gltf: minor
image: minor
slicer: minor
---

Transcoder edges declare only the formats they convert. The runtime derives each transcoded export route's `fidelity` from those formats: `'brep'` only when both `from` and `to` are B-rep formats under `lookupExportFidelity`, otherwise `'mesh'`. Every route advertised by the first-party plugins keeps the value it had.

Breaking:

- `TranscoderEdge` no longer has a `fidelity` property. Delete it from every edge passed to `defineTranscoder`; an edge typed as `TranscoderEdge` that still declares it fails to compile. `ExportFidelity`, `ExportRoute.fidelity`, `lookupExportFidelity` and the capabilities schema are unchanged.
