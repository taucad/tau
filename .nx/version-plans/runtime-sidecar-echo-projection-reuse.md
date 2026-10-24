---
runtime: patch
---

A committed parameter edit now meshes its view once. Before, when the host's own parameter-sidecar write reached a watched document before the update that staged the same bytes, the watch's rendering arrived under the intent the client had already left and was dropped, and the update reused the build but tessellated it again. The update now reuses the projections of that same build.
