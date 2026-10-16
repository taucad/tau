---
runtime: patch
---

Fetch every WASM module with the Subresource Integrity value an application build registers for its URL (`globalThis[Symbol.for('taucad.assetIntegrity')]`), so a tampered module is refused before compilation on both the streaming and the fallback path.
