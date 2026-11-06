---
runtime: patch
---

An export's operation observation names the transcoder that wrote it when the export was requested before the document was described, as `tau export` does right after it opens the document. The kernel, the transcoder and the source format are stamped when the export settles, from the kernel that owns the document, instead of from whichever kernel's route for that format came first, so a route is no longer guessed from another kernel that writes the same format natively.
