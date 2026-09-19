---
cache-core: minor
runtime: minor
runtime-testing: minor
replicad: minor
---

Land the shared compute-reuse contract and move runtime ownership onto it (compute-reuse substrate charter W1, D5).

`KernelComputeSession` (`prepared`/`lookup`/`record`/`flush`), `KernelComputeSessionLookup` and `KernelComputeRuntime.openSession` are deleted, and the runtime stops writing the rooted `.tau/cache/compute/v1` compute-session store. `KernelRuntime.compute` and `KernelMiddlewareRuntime.compute` are now a `KernelComputeCapability`: `{ status: 'off' }` carries no operations at all, and `{ status: 'on' }` exposes the existing `evaluate` plus `openScope`, which returns a runtime-owned `ComputeReuseScope` (`generation`/`warm`/`announce`/`close`) over a kernel-owned `ResidentCacheBinding`. Publication is a settle-once receipt the runtime permits only after the result has been delivered.

`@taucad/cache-core` gains an optional `CacheCodec.determinism` class, a branded `CacheRetention`, and a `promote` barrier on `createComputeReuseService`: a `required` evaluation now names its retention owner and is refused with `CacheRequiredError` unless a durable backend acknowledges the barrier — on the hit path as well as the miss path.

The Replicad kernel gains a `computeReuse` option that switches semantic reuse off explicitly instead of deriving it only from asset resolution.
