---
name: create-llm
description: Add, update, enable, or evaluate LLM model catalog entries and providers for Tau's API model gateway. Use when adding models to model.constants.ts, routing a new provider through the gateway, updating model costs/capabilities/descriptions, wiring reasoning or thinking controls, or running the live provider matrix.
---

# Create LLM

Use this skill when adding, updating, enabling, or evaluating an LLM in Tau's model catalog.

## Where execution actually happens

Chat turns do not run in the API. The API is a relay: the portable agent host builds the provider request in the browser or desktop host and the API's model gateway forwards it to the provider with the operator's or Tau Cloud's credentials. A new model therefore has to be correct in three places: the catalog row, the gateway route, and the host transport that chooses the wire and the reasoning options.

The API's LangChain providers (`ProviderService`) survive for one narrow case only: self-host helper surfaces (`project_name`, `commit_name`, `code_completion`) executed by `DirectModelInvocationService.invokeHelper`. Do not treat that path as the chat path.

## Workflow

1. Research current provider facts from official/current provider sources when model facts may have changed.
2. Read the existing catalog row and gateway route for the nearest sibling model before deciding where the new one belongs.
3. Decide whether an existing gateway provider serves the model or whether a new provider id is needed.
4. Add or update the catalog row with complete model, provider, cost, context, support, and configuration fields.
5. Wire the host transport if the model needs a wire, compat override, or reasoning option the provider does not already have.
6. Apply enablement gates before exposing the model publicly.
7. Run focused unit checks, then the live ladder.
8. Report exact commands, live status, and any unrelated blockers.

## Key Rules

- Prefer an existing gateway provider when it serves the model with the right billing identity, wire, and provider controls.
- Do not route a non-OpenAI provider under `openai` just because its API is OpenAI-compatible; `providerKind` selects the codec and the compat overrides.
- Any provider-facing tool schema must satisfy the contract test: one top-level object, no top-level unions, no `$ref`/`definitions`, keyword denylist. A schema that only Anthropic accepts breaks Vertex.
- If the selected model family lacks a UI brand icon, follow [add-logo](../add-logo/SKILL.md) with the established brand identity instead of sourcing or generating one here.
- Keep model descriptions CAD-task focused: say when a Tau user should pick the model.
- Cap catalog context windows at Tau's effective `200_000` policy unless that policy changes.
- Keep text-only or uncertain models hidden until Tau can route image inputs safely.
- A new model row is validated only when the live matrix row for its provider passes. A skipped live run is not validated.
- Preserve unrelated user or dirty-worktree changes.

## Reference

For the file map, model-row checklist, provider-add matrix, enablement gates, Vertex wire facts, and the verification ladder, read [model-catalog-checklist.md](model-catalog-checklist.md).
