---
revisions: minor
---

The compute worker measures an import's read-back: `measureImportBytes` takes the bytes (transferred, not cloned) and answers their git blob id, SHA-256 and content kind as one-shot WebCrypto digests. `decodeImportEntry` no longer hashes: it inflates and checks the zip CRC-32, and answers the bytes alone.
