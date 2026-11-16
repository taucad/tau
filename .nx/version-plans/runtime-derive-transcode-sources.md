---
runtime: minor
---

Add `deriveTranscodeSources(runtime, to)` to `@taucad/runtime/plugin`. It returns the formats that the registered transcoders convert directly to `to`, in registration order and without duplicates. Use it to admit exactly the sources a runtime can convert instead of keeping a separate list. A target that no registered edge produces is rejected at compile time.
