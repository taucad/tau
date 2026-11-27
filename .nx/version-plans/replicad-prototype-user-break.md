---
replicad: patch
---

A superseded Replicad render now also stops inside the instancing mesh extractor, on the same abort word as the batch Booleans and the regular mesh extractor, when the OpenCascade build provides `ReplicadPrototypeMeshExtractor.ExtractFacesWithOptions` (`@taulabs/replicad-opencascadejs` 0.23.0-beta.4 or later). An older build keeps running that extractor to the end, as before; while nothing aborts, the mesh is the same.
