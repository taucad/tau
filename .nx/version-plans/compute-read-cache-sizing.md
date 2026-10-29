---
runtime: minor
---

Size the worker's compute caches by binding and device. A Memory binding no longer keeps a read cache in front of its in-worker engine, so each published result is held once instead of twice. `ComputeBinding` accepts `memoryConstrained`: a constrained Memory engine retains 32 MiB instead of 64 MiB, and a constrained Durable binding bounds its read cache at 16 MiB instead of 64 MiB. A Durable hit whose content the read cache evicted while keeping its record is now served from the store instead of recomputed.
