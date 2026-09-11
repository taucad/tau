# @taucad/jobs

Durable job contracts, providers, events, artifacts, and executor conformance for Tau workloads.

## Deterministic compute reuse

Every hosted provider attempt receives an owner-scoped `runtime.compute` service backed by
`@taucad/cache-core`. `JobArtifactStore` implementations declare whether they support durable
action records. Supported stores publish output content first and the immutable action record
last; unsupported stores receive an isolated in-memory service and execute normally.

Action authority follows the leased job across retries, while a different job cannot resolve
the record. Remote stores must derive the owner from the authenticated runner credential and
authorize the exact active attempt on every content or action operation. Providers never derive
storage paths or receive remote credentials directly.
