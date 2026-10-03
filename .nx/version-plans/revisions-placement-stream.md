---
revisions: patch
---

A turn placement's revocable filesystem returns `readFileStream` and `dispose` synchronously, as the filesystem it wraps does, rather than wrapping their results in a promise.
