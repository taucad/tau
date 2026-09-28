---
name: create-kcl-api
description: Designs KCL authoring syntax and standard-library APIs in a browser-viewable DX guide. Use for KCL functions, tags, constraints, units, or CAD authoring contracts; compose create-api for shared review.
---

# KCL API design

Follow [create-api](../create-api/SKILL.md) and its [authoring contract](../create-api/authoring.md).

- Sketch valid KCL source with its imports, pipeline stages, tags, units, and complete model
  context. Compare the same modeled result under each option, including the unchanged syntax.
- Keep naming and units visible in the KCL source. Design parse/type/runtime failures with the
  location and correction an author or agent would see.
- Place `design/**/*.kcl` in the guide. The common checker parses and runs each directory's
  `main.kcl` with the workspace `@taucad/kcl-wasm-lib` mock engine; record its version and
  diagnostics. Highlight with `tauCustomShikiLanguages` from `@taucad/grammars`.
