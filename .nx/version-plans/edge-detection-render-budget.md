---
middleware: minor
host: minor
mcp: minor
---

Bound the fallback edge pass by the whole render and let a screenshot ask for edge lines per call.

`@taucad/middleware`: `gltfEdgeDetection` now applies its 500,000-triangle render limit to the sum of every triangle primitive in the render, not to each primitive. A render above the limit keeps its surfaces, gets no generated edges and logs the count once. Before, an assembly of parts that were each under the limit was processed in full: eight parts totalling 3.8 million triangles took about 29 s in the pass and now skip it in about 0.1 s. Exports that ask for edges are unchanged.

`@taucad/host` and `@taucad/mcp`: the `screenshot` tool takes an optional `includeEdges`. `true` asks the runtime for the view's edge lines for that call, natively or through the fallback pass, and a view without edge lines refuses it with `VALIDATION_ERROR`. `false` or omission requests none, as before, and `false` also tells the image renderer to draw no lines.
