---
name: create-api
description: Designs or revises a public API in TypeScript, Python, KCL, or C# as a browser-viewable DX guide before implementation. Use for exported APIs, authoring syntax, wire-visible names, tool surfaces, or a DX/AX review; select the language-specific child skill for idioms and checks.
---

# Create an API design guide

This is the shared review workflow. Compose the relevant language skill:
[TypeScript](../create-ts-api/SKILL.md), [Python](../create-python-api/SKILL.md),
[KCL](../create-kcl-api/SKILL.md), or [C#](../create-csharp-api/SKILL.md).
For mixed-language contracts, compose each relevant child into **one** guide and one owning research
document. Use [create-research](../create-research/SKILL.md) and its
[artifact contract](../create-research/artifacts.md). A guide proposes an API; it does not implement it.

1. Find the owning research document and create or revise its `docs/research/artifacts/<subject>/api/`
   guide. Keep existing option IDs when revising and increment `revision`.
2. Trace the existing surface from author call sites through the host and final consumer. Read all
   relevant callers, exports, policy, and [review rubric](review-rubric.md). State the contract in
   three to six plain sentences.
   For a second language or kernel targeting an existing wire feature, trace the canonical payload,
   component identity, units/frame conversion, validation, export, and viewer consumer. Keep one
   wire representation and show an output example alongside the authoring sketch.
3. Sketch the same real use case under at least two viable options and the unchanged path. Show
   author, host, and agent call sites as applicable, followed by the proposed surface and misuse.
   Mark proposed declarations or stand-ins explicitly; never claim they ship.
4. Run the language checks from [authoring](authoring.md). Record diagnostics and tool versions.
   A source-only sketch must say why it cannot be compiled or executed yet.
5. Score every option against every rubric ID with source-backed evidence. Attack the recommended
   choice for unnecessary parts, ownership leaks, failures, and migration costs. Put each surviving
   concern in an open question with concrete choices and consequences.
6. Specify caller-caused failure codes, messages, and recovery; list exact implementation and docs
   paths. Preserve existing names and identity where the design does not require a change.
7. Serve and inspect the guide in the browser: sketches/evidence, option switching, questions,
   console, light/dark, and 375 px layout. Update the artifact index and owning research document;
   run `pnpm docs:validate`. Deliver findings and guide for review. Record operator rulings as
   dated decisions with `settles`; mark approved only after all questions are settled.

Do not implement the production API from this skill alone. An authorized implementation proceeds
through the owning blueprint after review.
