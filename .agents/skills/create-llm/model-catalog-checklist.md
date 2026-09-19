# Model Catalog Checklist

Use this checklist after loading `SKILL.md` for model/provider work.

## File Map

| Concern                            | Primary files                                                    |
| ---------------------------------- | ---------------------------------------------------------------- |
| Model catalog rows                 | `apps/api/app/api/models/model.constants.ts`                     |
| Model schema                       | `apps/api/app/api/models/model.schema.ts`                        |
| Catalog cap/shape tests            | `apps/api/app/api/models/model.service.test.ts`                  |
| Gateway routes, wires, credentials | `apps/api/app/api/providers/provider-gateway.ts`                 |
| Strict gateway request boundary    | `apps/api/app/api/billing/billable-model-request.ts`             |
| Provider/family enums (chat wire)  | `libs/chat/src/schemas/provider.schema.ts`                       |
| Tool-schema contract test          | `libs/chat/src/schemas/provider-tool-schema-compat.test.ts`      |
| Host transport: wire + reasoning   | `packages/agent-host/src/transport/gateway-model-transport.ts`   |
| Vertex response/request shim       | `packages/agent-host/src/transport/vertex-completions-shim.ts`   |
| UI reasoning derivation            | `apps/ui/app/chat-clients/_internal/turn-body.ts`                |
| Self-host helper path (LangChain)  | `apps/api/app/api/providers/provider.service.ts`                 |
| Helper invocation                  | `apps/api/app/api/llm/direct-model-invocation.service.ts`        |
| Environment config                 | `apps/api/app/config/environment.config.ts`                      |
| Live gateway suite (gateway URL)   | `packages/agent-host/tests/live/provider-streaming.live.test.ts` |

## Research Checklist

Before editing, verify current model facts from official/current sources:

- Provider endpoint and exact provider model ID.
- Release/version naming and deprecation status.
- Context window and max output tokens on the chosen provider surface.
- Input/output pricing, cached-input pricing, and any cache-write pricing.
- Input modalities, especially image support.
- Tool/function calling, structured output or JSON mode, and streaming support.
- Reasoning controls and whether Tau's transport can pass them through.
- Whether an existing gateway provider already represents the billing and runtime identity.

## Provider Decision

Use an existing provider when all are true:

- The provider id is already in `providerTargets` in `provider-gateway.ts`.
- The model is available on that provider's configured URL and wire.
- The host transport's codec and compat overrides can express required model settings.
- Billing, telemetry, base URL, and token accounting match that provider identity.

Add a new provider only when at least one is true:

- The user explicitly wants direct billing or direct API access through a different provider.
- Required provider-native controls are not available through an existing provider.
- The provider needs distinct env vars, base URL, telemetry, or token accounting.
- No existing gateway provider serves the model.

Never put a non-OpenAI provider under `openai` only because the API is OpenAI-compatible.

## Existing-Provider Workflow

1. Add or update the row under the provider in `modelList` (`model.constants.ts`).
2. Use a provider-prefixed `id`, for example `together-glm-5.2`; `provider.id` must be a gateway provider id.
3. Set `provider.id`, `provider.name`, and provider `model` exactly for the chosen provider surface.
4. Set `details.contextWindow` to Tau's effective cap, currently `200_000`, for long-context models.
5. Add the model ID to `cappedModelIds` in `model.service.test.ts` when the provider supports more than Tau exposes.
6. Set `support.toolChoice: false` when explicit tool choice is not proven safe for the provider/model.
7. Set `configuration` only to controls the transport actually forwards (see Reasoning below).
8. Keep `enabled: false` for text-only, unproven, beta, or otherwise unsafe public exposure.
9. Run the verification ladder.

Routes are built from `modelList` at import time: a row with `enabled: false` gets no gateway route and cannot be reached even by id.

## New-Provider Workflow

When a new provider is actually needed, update all relevant surfaces:

- Add the provider id to `GatewayProviderId` and `providerTargets` (`key`, `url`, `wire`) in `provider-gateway.ts`.
- Add it to `fundedGatewayProviderIds` only when Tau Cloud funds it; unfunded providers are self-host only.
- Extend `isGatewayProviderConfigured` if the credential is not a plain string key.
- Add the env var to `environment.config.ts`.
- Add the provider id to `providerIdSchema`, and a family to `modelFamilySchema` only if no existing family fits (`libs/chat/src/schemas/provider.schema.ts`).
- Add the provider kind to `openAiGatewayProviderKinds` in `gateway-model-transport.ts`, and to `isOpenAiResponsesProviderKind` only if it speaks the Responses wire (today: `openai`, `xai`).
- Add a `piModelFor` compat override only for a proven upstream incompatibility.
- Extend the request boundary in `billable-model-request.ts` if the wire carries block shapes it does not yet accept.
- Add reasoning derivation in `turn-body.ts` if the provider names its reasoning control differently.
- Add at least one catalog row and a live matrix row.

## Catalog Row Checklist

Every model row should explicitly address:

- `id`, `name`, `slug`, and provider `model`.
- `provider.id`, `provider.name`, and `providerKind`.
- `recommended` only when product-visible defaults should include it. Self-host helper surfaces fall back to the first `recommended` enabled row when `openai-gpt-5.6-luna` is unconfigured, so this flag also selects the helper model.
- `description` as one concise CAD-task sentence.
- `support.tools`, `support.toolChoice`, and `support.modalities` when relevant.
- `details.family` and `details.families`.
- `details.contextWindow`, capped to Tau policy when needed, and `details.maxTokens`.
- `details.knowledgeCutoff` when current reliable data exists.
- `details.cost.inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`.
- `configuration.streaming`.
- Reasoning, thinking, temperature, or output config only when the transport forwards them.
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

## Reasoning And Thinking Controls

`turn-body.ts` derives the host's `reasoning` from the catalog `configuration` per provider kind:

- `anthropic`: `configuration.thinking` (`enabled` -> budget tokens, `adaptive` -> effort/display).
- `vertexai`: `configuration.thinkingLevel`, lowercased into `reasoning.effort`.
- everything else: `configuration.reasoning` passed through.

`gateway-model-transport.ts` then applies it: Anthropic gets `thinkingEnabled` plus budget/display/effort, the Responses providers get `reasoningEffort`/`reasoningSummary`, and Vertex gets `samplingParams.extra_body.google`.

## Vertex Wire Facts

A Vertex row goes through Tau's OpenAI-compatible route, not Gemini's native `generateContent`. Facts a model author must know:

- Thinking levels are per model. Gemini 3.5 Flash and 3.5 Flash-Lite accept `MINIMAL` upstream; Gemini 3.7 Flash and 3.1 Pro accept `LOW`, `MEDIUM`, `HIGH` only. Tau cannot declare `MINIMAL`: the `thinkingLevel` enum in `model.schema.ts` and the gateway transport admit only `LOW`, `MEDIUM`, `HIGH`. Setting a level the model rejects is a request-time refusal, not a downgrade.
- Never send `extra_body.google.stream_function_call_arguments`. It makes Vertex answer 499 on every non-first function call of a turn, and 400 on a unary request.
- Thought-signature echo is handled by `vertex-completions-shim.ts`: it captures `extra_content.google.thought_signature` off the response stream and replays it onto outbound tool calls. Do not add a second signature path in a catalog change.
- Tool schemas must satisfy the contract test. Vertex rejects `$ref`/`definitions` loops and a non-object top-level schema outright.
- The gateway exchanges the service-account JSON in `GOOGLE_VERTEX_AI_CREDENTIALS` for an OAuth token and prefixes the model id with `google/`; the catalog row carries the bare provider model id.

## Enablement Gates

Before public enablement, verify:

- The model supports every input modality Tau may send to it.
- Text-only models remain hidden unless Tau prevents image parts from reaching them.
- Tool calling works through the agent host's full toolbelt, not one sample tool.
- Streaming works through the configured wire.
- Provider-specific reasoning or JSON controls are actually wired, not merely present in the row.
- The live matrix row for the model's provider passed with this model id.

Hidden rows are still useful for staging, but `enabled: false` also removes the gateway route, so a hidden row cannot be smoke-tested through the gateway.

## Verification Ladder

Focused unit checks first:

```bash
pnpm nx lint api --files="app/api/models/model.constants.ts"
pnpm nx test api --watch=false app/api/models/model.service.test.ts
pnpm nx typecheck api
```

When the tool surface, provider enums, or transport changed:

```bash
pnpm nx test chat --watch=false src/schemas/provider-tool-schema-compat.test.ts
pnpm nx test agent-host --watch=false
pnpm nx typecheck agent-host
```

Then the live ladder. `api:test:live` runs an in-process live gateway harness (suites under `apps/api/app/testing/live/`: a provider matrix suite and a provider-switch suite) against real keys from `apps/api/.env`, with no running API required:

```bash
pnpm nx run api:test:live
```

The gateway-URL variant drives a running gateway from the agent host instead:

```bash
TAU_AGENT_LIVE_GATEWAY_URL=... TAU_AGENT_LIVE_BEARER=... TAU_AGENT_LIVE_PROVIDERS=vertexai \
  pnpm nx run agent-host:test:live
```

Per-provider model overrides use `TAU_AGENT_LIVE_<PROVIDER>_MODEL`.

A new model row must pass the live matrix row for its provider. A skipped live run is not validated; say so rather than reporting green.

## Reporting Template

Report:

- Provider decision: existing provider or new provider, with evidence.
- Catalog changes: id, provider model id, context cap, costs, support flags, enabled state.
- Transport changes: wire, compat override, reasoning option, and why each was needed.
- Description review: why the wording is CAD-focused.
- Verification: exact commands and pass/fail/skip status.
- Live run: model id, suite, and whether credentials were present.
- Blockers: unrelated dirty-worktree failures called out precisely.
