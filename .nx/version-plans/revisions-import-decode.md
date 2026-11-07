---
revisions: minor
---

The compute worker gains `decodeImportEntry`, which decodes and digests one import entry from the `Blob` it is handed (`@taucad/filesystem/importer`'s `decodeImportEntry`), so an import's inflate, CRC check, git blob id and SHA-256 run off the main thread and its bytes are hashed once.
