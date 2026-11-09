---
occt-core: patch
---

The tracing wrappers keep `gp` value types proxied, so their methods check for a superseding abort and name the OCCT exception they throw, such as `gp_VectorWithNullMagnitude`. The exception-only wrapper still returns them unproxied for speed; its documentation now names both trade-offs.
