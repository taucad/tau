---
name: create-ts-api
description: >-
  Designs or revises a public TypeScript API as a browser-viewable DX design guide before any
  implementation: compiled call-site sketches for every audience (consumer, plugin author, host,
  agent), alternatives scored against Tau's API review rubric, designed failures, and open questions
  for the operator. Use when adding, changing, renaming or removing an exported API, hook, option,
  plugin contract, wire-visible name or agent tool surface, or when asked for an API design, a DX or
  AX review, an interface sketch, or "what would the consumer DX look like".
---

# Create a TypeScript API design guide

The public API is the design; what sits behind it is cheap to change later. This skill produces the
artifact the operator reviews before a blueprint commits to implementation: a **DX design guide**,
the API counterpart of a [design canvas](../create-canvas/SKILL.md). It is a page in the browser
built from sketch files that really compile against Tau's types.

[Library API policy](../../../docs/policy/library-api-policy.md) is normative. The
[review rubric](review-rubric.md) says what the operator tests first and how they review. The
[authoring contract](authoring.md) fixes the files, the runner and the checker.

## Scope

In: any change to what a package exports, a `defineX` contract or hook, an operation input or
outcome, an options object, a subpath, an error code, a persisted or wire-visible name, or an agent
tool's name, schema or description.

Out: internal refactors with no exported or agent-visible change; visual design
(`create-canvas`); writing the normative rule itself (`create-policy`). A guide ends at an approved
design. It does not implement.

## Workflow

1. **Find the owner.** A guide belongs to one research document (blueprint, charter or audit) and
   lives at `docs/research/artifacts/<subject>/api/`. Compose
   [create-research](../create-research/SKILL.md) and its
   [artifact contract](../create-research/artifacts.md); create the owner first if none exists.
   Editing an existing guide keeps its option ids and bumps `revision`.
2. **Read before sketching.** The policy in full; the rubric; every current export, caller and
   sibling of the surface in question (`git grep` the names, read the package's `index.ts`, its
   `*.test-d.ts` leak guard and its docs pages). Name each audience and the scenario that makes
   them call this. No caller, no API.
3. **State the contract in words.** Three to six sentences a consumer or an agent could act on
   with no types in front of them. If this cannot be written, the design is not ready to sketch.
4. **Sketch call sites first, surface second.** Under `design/<option>/`, write the code each
   audience will type, then the exported types that make it compile. Import Tau's real types; never
   restate them. Add `// ^?` under a value whose inferred type is the point, and a `misuse.ts` of
   `// @ts-expect-error` cases for every mistake the design claims to prevent.
5. **Sketch the alternatives the same way.** At least two real options plus "do nothing or keep it
   where it is" when that is live. Each option shows the _same_ call sites, so they compare line for
   line. Record what each adds, changes and removes by exported name: that list is the sprawl count.
6. **Compile it.** Run the checker (see [authoring](authoring.md)). A sketch that does not compile
   is not reviewable. Never weaken a sketch to make it pass; fix the design or record the finding.
7. **Score and attack.** Fill the scorecard for every option against every rubric check, one
   sentence of evidence each. Then run the adversarial pass the operator always asks for: are all
   parts necessary, is there a Ponytail simplification, what breaks if every recommendation is
   accepted, what did the recommended option score `concern` on. Each surviving concern becomes an
   open question with every option and its consequence spelled out.
8. **Design the failures and the agent's view.** Every failure a caller can cause gets a string
   code, the message text, and the recovery. Show what an agent reads: tool text, schema, issue
   objects. People and agents must meet the same names and the same units.
9. **List the blast radius.** Files and docs that change under the recommended option, including
   the policy line to add when the review found a rule the policy lacks.
10. **Serve, verify, deliver.** Run the guide, check it in the browser (console clean, every sketch
    badge reads `compiles`, options switch, light and dark, no page overflow at 375 px), update the
    artifact index, run `pnpm docs:validate`, and show the operator the page. Then **stop and
    await**: findings first, discussion next, implementation only on the operator's word. Record
    each ruling under `decisions` with its date, move `status` to `approved`, and only then hand
    the approved revision to the blueprint's work package.

## What a good guide does not do

- Present one option. The operator reviews trade-offs, not announcements.
- Describe an API in prose where a call site would show it.
- Hand-write an inferred type. The checker records what the compiler sees.
- Invent a caller to justify a field, pre-add unused fields, or keep a compatibility shim in a
  pre-release package.
- Hide a `concern`. A scorecard with no concerns has not been attacked.
- Implement. Production source, exports and docs pages change only after approval, under the
  owning blueprint.

## Trigger checks

- "Sketch what this design looks like", "put your DX hat on", "run this name through the library
  API policy", "is this param position consistent with the other APIs" → this skill.
- A blueprint whose work package adds or reshapes an export → compose this skill for that package
  and gate the package on the approved guide.
- "Fix the bug in `render`" with no exported change, or "design the settings screen" → not this
  skill.
