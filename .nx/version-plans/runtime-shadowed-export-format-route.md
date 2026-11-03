---
runtime: patch
---

An export whose target format is declared natively by a different export of the same kernel now transcodes when the evaluation did not offer that export. A PicoGK kernel declares `stl` for the author's own files and meshes `glb`, and a build that wrote no authored file reached a native `stl` export it never offered rather than the `glb` → `stl` route. The planner now treats a named export whose extension is not the requested format as a routed request, which is what the resolver already decided.
