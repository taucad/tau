---
project-core: minor
host: minor
---

A `tau.json` may omit `assets.main` while a project has no model file yet. `projectManifestSchema` accepts the entry-less manifest, `projectToManifest` leaves `main` out when the project has none, and the new `mainEntryPath(manifest)` returns the declared entry path or `undefined`. The published `tau-v1.json` schema no longer requires `main`. The host's viewer share reads an absent main as no model to share instead of failing on it. Writers still always declare a main; this release only teaches readers to tolerate its absence.
