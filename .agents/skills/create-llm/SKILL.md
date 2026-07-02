---
name: create-llm
description: Add, update, enable, or evaluate LLM model catalog entries and providers for Tau's API. Use when adding models to model.constants.ts, checking provider availability, updating model costs/capabilities/descriptions, wiring a new LLM provider, or running model integration smoke tests.
---

# Create LLM

Use this skill when adding, updating, enabling, or evaluating an LLM in Tau's API model catalog.

## Workflow

1. Research current provider availability from official/current provider sources when model facts may have changed.
2. Inspect Tau's existing model and provider code before deciding where the model belongs.
3. Decide whether an existing dedicated provider can serve the model or whether a new provider is needed.
4. Add or update the catalog row with complete model, provider, cost, context, support, and configuration fields.
5. Apply enablement gates before exposing the model publicly.
6. Update tests and provider-key maps that correspond to the chosen provider path.
7. Run focused validation first, then live smoke when credentials are available.
8. Report exact commands, smoke status, and any unrelated blockers.

## Key Rules

- Prefer an existing dedicated provider when it serves the model with the right billing, telemetry identity, adapter, and provider controls.
- Do not route non-OpenAI providers through `openai` just because their API is OpenAI-compatible.
- Keep model descriptions CAD-task focused: say when a Tau user should pick the model.
- Cap catalog context windows at Tau's effective `200_000` policy unless that policy changes.
- Keep text-only or uncertain models hidden until Tau can route image inputs safely.
- Treat skipped live smoke as not validated.
- Preserve unrelated user or dirty-worktree changes.

## Reference

For the file map, model-row checklist, provider-add matrix, enablement gates, and commands, read [model-catalog-checklist.md](model-catalog-checklist.md).
