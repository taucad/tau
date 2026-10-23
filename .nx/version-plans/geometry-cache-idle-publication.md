---
cache-core: minor
runtime: minor
middleware: patch
replicad: minor
opencascade: minor
---

Deliver a computed geometry result before publishing it to the compute store, and take the whole-model native-handle snapshot only when the worker is idle.

`createComputeReuseService` accepts an optional `schedulePublication`. With it, a best-effort miss resolves as soon as its computation does, with publication status `deferred`, and hands the scheduler a `ComputePublicationTask` that encodes and publishes later; required evaluations still publish before they resolve. `EncodedContent.digests` lets a codec attest the digests of leaves it already owns and hashed, so publication neither copies nor re-hashes them, and publication no longer re-hashes leaves it has just written. `createMemoryContentStore` gains `ownsProducerWrites` for a read cache whose only writer is a same-realm producer, and SHA-256 hashing drops its redundant defensive copy.

The runtime's compute host queues best-effort whole-action publications behind the delivery permit and runs them only when the worker's operation lane is empty. An admitted operation interrupts the running publication at its next await, and it runs again at the next idle. A result whose operation was cancelled before delivery never publishes, at most four publications are held, and teardown drains them within the existing budget while native handles still live. Each settlement is traced as `kernel.compute.publication`. Because the geometry cache serialises a build's native-handle snapshot inside that publication, every kernel that defines `serializeHandle` now snapshots at idle instead of on the result path.

`geometryCache` attests its binary leaf digests. Replicad (kernel 1.5.0) and OpenCascade (kernel 1.2.0) write native-handle snapshots as binary `BinTools` BRep without triangulation instead of text; the version bump re-keys their cached entries, so earlier text snapshots stop matching and age out.
