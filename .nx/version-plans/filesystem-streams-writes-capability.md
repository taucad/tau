---
filesystem: minor
---

Providers that hold one chunk at a time in `writeFileStream` (File System Access, OPFS, Node) declare `streamsWrites` in their capabilities, and a rooted view's `privateStore` offers `writeFileStream` only over such a provider. Over memory, IndexedDB or the Node bridge client, whose fallback gathers the stream, it is absent, so a consumer writes the bytes it already holds instead of paying for a second copy.
