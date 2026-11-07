---
revisions: minor
---

A large object downloaded in the browser is verified by reading back what was stored (D9, D11). The bytes are written beside their final name, read back once and hashed with WebCrypto on the compute worker, and only then renamed into place. A mismatch, from the wire or from the disk, discards the partial file and fails with `did not hash to its own id`. Any other failure between the write and the rename also discards it. The read-back buffer is transferred to the compute worker rather than copied: `ComputeWorker.sha256` takes an optional `consumed` flag. A whole copy already stored under the oid is kept, but a download is still read back before its bytes are delivered. A compute call that cannot be posted to the worker no longer stays pending. `LfsClient.downloadMany` now checks only the declared size and hands the bytes to `received` unhashed. The caller verifies them, so each object is hashed once. `LfsClient.download` still hashes the bytes it returns.
