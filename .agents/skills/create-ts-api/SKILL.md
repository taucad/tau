---
name: create-ts-api
description: Designs a TypeScript or JavaScript API with compiled consumer sketches and misuse checks. Use for exported TS packages, hooks, options, plugin contracts, or agent tools; compose create-api for the common DX guide and review workflow.
---

# TypeScript API design

Follow [create-api](../create-api/SKILL.md), its [authoring contract](../create-api/authoring.md),
and [library API policy](../../../docs/policy/library-api-policy.md).

- Import real package types and exports. Put proposed additions in the option's `surface.ts` as
  extensions of those real types; do not restate existing contracts.
- Show each audience's actual call site first. Mark inferred values with `// ^?`; put invalid uses
  in `misuse.ts` with `// @ts-expect-error`.
- Check with `node .agents/skills/create-api/scripts/check-design.mjs <guide> --project <project>`.
  Remove one expectation once to prove the compiler catches a real error.
- Apply TS conventions from the library API policy: named inputs, inference without casts, right
  package/subpath, and a minimal public export set.
