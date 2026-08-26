# Model Catalog Checklist

Use this checklist after loading `SKILL.md` for model/provider work.

## File Map

| Concern                | Primary files                                    |
| ---------------------- | ------------------------------------------------ |
| Model catalog          | `apps/api/app/api/models/model.constants.ts`     |
| Model schema           | `apps/api/app/api/models/model.schema.ts`        |
| Provider schema        | `apps/api/app/api/providers/provider.schema.ts`  |
| Provider runtime       | `apps/api/app/api/providers/provider.service.ts` |
| Environment config     | `apps/api/app/config/environment.config.ts`      |
| Context cap tests      | `apps/api/app/api/models/model.service.test.ts`  |
| Live smoke env mapping | `apps/api/app/testing/skip-helpers.ts`           |
| Live smoke scenarios   | `apps/api/app/testing/model-integration.test.ts` |

## Research Checklist

Before editing, verify current model facts from official/current sources:

- Provider endpoint and exact provider model ID.
- Release/version naming and deprecation status.
- Context window and max output tokens on the chosen provider surface.
- Input/output pricing, cached-input pricing, and any cache-write pricing.
- Input modalities, especially image support.
- Tool/function calling, structured output or JSON mode, and streaming support.
- Reasoning controls and whether Tau's adapter can pass them through.
- Whether an existing Tau provider already represents the billing and runtime identity.

## Provider Decision

Use an existing provider when all are true:

- The provider ID already exists in Tau.
- The model is available on that provider's API endpoint.
- The existing adapter can express required model settings.
- Billing, telemetry, base URL, and token accounting match that provider identity.

Add a new provider only when at least one is true:

- The user explicitly wants direct billing or direct API access through a different provider.
- Required provider-native controls are not available through an existing provider.
- The provider needs distinct env vars, base URL, telemetry, or token accounting.
- No existing dedicated provider serves the model.

Never put a non-OpenAI provider under `openai` only because the API is OpenAI-compatible.

## Existing-Provider Workflow

1. Add or update the row under the provider in `modelList`.
2. Use a provider-prefixed `id`, for example `together-glm-5.2`.
3. Set `provider.id`, `provider.name`, and provider `model` exactly for the chosen provider surface.
4. Set `details.contextWindow` to Tau's effective cap, currently `200_000`, for long-context models.
5. Add the model ID to `cappedModelIds` when the provider supports more than Tau exposes.
6. Set `support.toolChoice: false` when explicit tool choice is not proven safe for the provider/model.
7. Keep `enabled: false` for text-only, unproven, beta, or otherwise unsafe public exposure.
8. Run focused lint, focused model-service tests, and live smoke when credentials are available.

## New-Provider Workflow

When a new provider is actually needed, update all relevant surfaces:

- Add the provider ID to `providerIdSchema`.
- Add a model family to `modelFamilySchema` only if no existing family fits.
- Add the provider to `ProviderOptionsMap`.
- Add provider construction in `ProviderService.getProviders()`.
- Add env vars to `environment.config.ts` and tests if required.
- Add provider-service tests for adapter construction and config.
- Add live-smoke env mapping in `providerEnvForModelId()`.
- Add benchmark env mapping in `providerKeyMap`.
- Add at least one catalog row and the relevant model tests.

## Catalog Row Checklist

Every model row should explicitly address:

- `id`, `name`, `slug`, and provider `model`.
- `provider.id` and `provider.name`.
- `recommended` only when product-visible defaults should include it.
- `description` as one concise CAD-task sentence.
- `support.tools` or `support.toolChoice` when relevant.
- `details.family` and `details.families`.
- `details.contextWindow`, capped to Tau policy when needed.
- `details.maxTokens`.
- `details.knowledgeCutoff` when current reliable data exists.
- `details.cost.inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`.
- `configuration.streaming`.
- Reasoning, thinking, temperature, or output config only when the local adapter supports them.
- `enabled: false` when public exposure is unsafe or intentionally staged.

## Description Rubric

Write descriptions for Tau users, not vendor scorecards.

Good:

- `Strong text-only open reasoning model for long-horizon CAD code generation and complex geometry planning.`
- `Fast model for rapid design iterations and small changes.`
- `Strong long-context capable open coder with vision, good for large multi-file CAD projects.`

Avoid:

- `Latest Z.ai GLM model on Together.`
- `Flagship frontier model with best performance.`
- `Long-context model with strong benchmarks.`

## Enablement Gates

Before public enablement, verify:

- The model supports every input modality Tau may send to it.
- Text-only models remain hidden unless Tau prevents image parts from reaching them.
- Tool calling works with Tau's agent tool loop.
- Streaming works through the configured adapter.
- Provider-specific reasoning or JSON controls are actually wired.
- Live smoke passed with the intended model ID and provider key.

Hidden rows are still useful: `enabled: false` removes the model from public listing while keeping it internally addressable for targeted smoke tests.

## Verification Ladder

For existing provider catalog changes:

```bash
pnpm nx lint api --files="app/api/models/model.constants.ts app/api/models/model.service.test.ts"
pnpm nx test api --watch=false app/api/models/model.service.test.ts
TEST_MODEL_ID=<provider-model-id> pnpm nx run api:test:models -- app/testing/model-integration.test.ts -t "should use tool calls when requested"
```

For new providers, also run provider-service tests and env-mapping tests:

```bash
pnpm nx test api --watch=false app/api/providers/provider.service.test.ts
pnpm nx test api --watch=false app/testing/model-integration.test.ts
```

Run typecheck when provider schemas, env config, or adapter options changed:

```bash
pnpm nx typecheck api
```

## Reporting Template

Report:

- Provider decision: existing provider or new provider, with evidence.
- Catalog changes: ID, provider model ID, context cap, costs, support flags, enabled state.
- Description review: why the wording is CAD-focused.
- Verification: exact commands and pass/fail/skip status.
- Live smoke: model ID, test name, and whether credentials were present.
- Blockers: unrelated dirty-worktree failures called out precisely.
