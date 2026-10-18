---
runtime: patch
---

fix(runtime): Require Zod 4.1 or newer in every Zod peer range. The published declarations name Zod's two-argument `ZodDiscriminatedUnion`, which Zod 4.0.0 to 4.0.15 lack, so a TypeScript consumer on those versions failed to typecheck.
