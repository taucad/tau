---
replicad: minor
---

Use `@taulabs/replicad` 1.2.1-beta.0, which brings upstream Replicad 1.2.0 and 1.2.1 into the fork. Models can call `extrudeUntil` on a sketch or a set of sketches to extrude up to a limiting face, `extrudeFaceUntil` for the same from explicit geometry, `findEdge`, `findEdges`, `findFace` and `findFaces` on any shape, and pass a named axis (`'X'`, `'-Y'` and so on) to `revolve`. The Boolean operations take a `simplify` option (default `true`); `false` skips merging same-domain faces and edges. The editor's type declarations and the `cad-replicad` agent skill include the new API. Text now goes through opentype.js 2.0.0; the outlines of every Tau example that draws text are byte-identical.
