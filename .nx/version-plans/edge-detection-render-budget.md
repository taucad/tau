---
middleware: minor
host: minor
mcp: minor
---

Let a screenshot ask for edge lines per call.

`@taucad/middleware`: `gltfEdgeDetection` has no triangle limit. It draws edges for every render that asks for them and whose kernel does not draw its own, at any size; its version is 3.1.0, so cached edge results regenerate.

`@taucad/host` and `@taucad/mcp`: the `screenshot` tool takes an optional `includeEdges`. `true` asks the runtime for the view's edge lines for that call, natively or through the fallback pass, and a view without edge lines refuses it with `VALIDATION_ERROR`. `false` or omission requests none, as before, and `false` also tells the image renderer to draw no lines.
