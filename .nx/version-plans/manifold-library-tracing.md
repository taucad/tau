---
manifold: minor
---

The Manifold kernel takes a `libraryTracing` option (`'off'` when left out, `'summary'` or `'per-call'`). It counts user code's `manifold-3d/manifoldCAD` static and constructor calls per class (`Manifold.cube`, `CrossSection.circle`) and emits a `manifold.library.summary` span after each run of the model: at evaluation, and again when a render or export runs it at another circular detail. Manifold and CrossSection instances stay unwrapped, so their methods are not counted. With tracing off nothing is wrapped.
