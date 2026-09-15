---
title: 'Tau Flags and Provider Configuration'
description: 'Deployment switches, UI feature flags and provider settings for self-hosted Tau and Tau Cloud.'
---

# Tau Flags and Provider Configuration

Operator reference for first-party API, UI, desktop and `tau serve` flags, provider credentials and related configuration. `TAU_CLOUD_ENABLED` is implemented as the single Tau Cloud presence switch. The final cross-host and deployed qualification remains tracked by the [billing closeout](research/tau-cloud-credit-billing-launch-charter.md).

## Deployment mode

| Flag                                                   | Target default / values                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAU_CLOUD_ENABLED`                                    | `false`; strict `true`/`false`                | The single API/UI presence switch for Tau Cloud billing and funded LLM admission. At API bootstrap false selects a Nest graph without billing, payment, funded-admission or commercial-entitlement providers. At UI build time false selects side-effect-free self-host boundaries and excludes the cloud implementations, usage route and offline billing worker from client, SSR and worker graphs. Operator-configured providers run without Tau credit checks. True retains all financial gates. |
| `NODE_ENV`                                             | Required: `development`, `test`, `production` | Runtime/security/build posture, **not** cloud mode. Self-host production must support cloud=false.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `TAU_API_URL`, `TAU_WEBSOCKET_URL`, `TAU_FRONTEND_URL` | Explicit URLs                                 | API, kernel/socket and browser origins; UI receives public values. Point self-host clients at your own API. Desktop currently defaults missing URLs to Tau production; override all three. `PORT` selects the API listener; development WebSocket listener configuration must match the public socket URL.                                                                                                                                                                                           |

Set the same cloud mode in API bootstrap and UI build configuration. **Changing this flag requires rebuilding the UI and restarting the API.** The web, desktop renderer, desktop main/preload and `tau serve` builds compile the value to a literal and include it in their Nx cache inputs. `window.ENV`, preload and browser storage cannot override compiled mode. The API remains authoritative for charging. URLs and other public runtime settings can still be injected. Never expose provider keys in `window.ENV`. Managed Cloud manifests must explicitly assert true so a missing deployment value cannot accidentally serve unbilled calls.

**Self-host profile:** cloud=false, own URLs, normal application database/Redis/auth/storage, and only credentials for providers you use. Billing variables may be omitted. **Managed Cloud profile:** cloud=true plus coherent financial environment, Stripe account/mode, billing secrets, published policy and funded supplier routes. Cloud startup refuses missing or mode-inconsistent financial configuration.

## API provider configuration

Keys belong on the API, not in UI variables or browser storage. Credential presence is configuration, not a Tau subscription. A provider can charge your own account when cloud=false.

| Setting                                            | Current source / target behavior                                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                                   | Optional OpenAI Responses provider. When available, the bounded Luna model is preferred for API-owned title, commit and completion helpers.                      |
| `ANTHROPIC_API_KEY`                                | Optional Anthropic Messages provider. A one-provider Anthropic self-host supports gateway calls and API-owned helper prompts.                                    |
| `GOOGLE_VERTEX_AI_CREDENTIALS`                     | Optional service-account JSON object, including project/client email/private key. Never serialize it to clients.                                                 |
| `TOGETHER_API_KEY`, `MORPH_API_KEY`, `XAI_API_KEY` | Optional providers with authenticated server-side gateway routes. Only configured providers are advertised.                                                      |
| `CEREBRAS_API_KEY`, `MOONSHOT_API_KEY`             | Optional direct self-host providers using OpenAI-compatible completion routes. They are excluded from managed Cloud because they have no qualified funded route. |
| `TAVILY_API_KEY`                                   | Optional search-provider credential; not an LLM credit-mode switch.                                                                                              |
| `OLLAMA_ENABLED`                                   | API local-model discovery and execution; strict `true`/`false`, default false.                                                                                   |

Current provider service uses Ollama at `http://localhost:11434`; do not assume a configurable remote Ollama URL is wired through every path. Closeout must verify discovery **and execution**, including container/network placement. A configured model should work without unrelated provider keys or a billing account. No new mandatory “enable each provider” flag is planned.

## Runtime and integration switches

| Flag                               | Current values/default                                         | Purpose                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAU_DEBUG`                        | UI/desktop: `1` or `true`, case-insensitive; false otherwise   | Diagnostic UI and desktop debug echo. UI `tauDebug` override can supersede the environment default.                                                                  |
| `TAU_PROVIDER_DIAGNOSTICS_VERBOSE` | Strict `true`/`false`, default false                           | Sanitized success-path provider diagnostics. Failures remain logged.                                                                                                 |
| `TAU_GIT_REMOTE_ALLOW_PRIVATE`     | API `0`/`1`, default `0`; UI also accepts `true`               | Development/private remote testing only. API refuses enabled in production; never relax auth/SSRF checks as a billing change.                                        |
| `TAU_JOBS_ENABLED`                 | `true`/`false`; unset development allowance, refused elsewhere | Paid-job supplier availability under its existing funding contract. Cloud=false does not grant Tau-owned supplier access; preserve operator-owned job configuration. |
| `TAU_S3_FORCE_PATH_STYLE`          | Strict `true`/`false`, default true                            | S3 addressing for local/object storage.                                                                                                                              |
| `LANGSMITH_TRACING`                | Optional integration value                                     | Provider tracing. Related `LANGSMITH_ENDPOINT`, `LANGSMITH_PROJECT`, `LANGSMITH_API_KEY` configure the destination; retain privacy/secret rules.                     |
| `POSTHOG_CLIENT_KEY`               | Optional; absence disables configured analytics                | UI public analytics key; `POSTHOG_API_HOST`, `POSTHOG_UI_HOST`, `POSTHOG_ASSET_HOST` choose endpoints. This is not the cloud/billing switch.                         |
| `RESEND_API_KEY`                   | Empty by default                                               | Email integration; `TAU_EMAIL_FROM` and `TAU_EMAIL_REPLY_TO` configure identity.                                                                                     |
| `HATCHET_CLIENT_TOKEN`             | Empty by default                                               | Optional job dispatch credential; `HATCHET_CLIENT_NAMESPACE` defaults to `tau-local`.                                                                                |

## Cloud financial controls

These configure a cloud deployment after the master switch is enabled. They must not be required for self-host operation after closeout. Prices/offers live in the versioned billing policy, not new environment overrides.

| Setting                                                        | Purpose / current default                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BILLING_ENVIRONMENT` / `TAU_BILLING_ENVIRONMENT`              | Server financial scope / public UI scope: `development`, `staging`, `prod-us`, `prod-eu`; values must match. They identify data, not feature presence.                                      |
| `STRIPE_SECRET_KEY`, `STRIPE_READ_SECRET_KEY`                  | Collection and authoritative-source access; server secrets required only in Cloud mode. Test mode requires `sk_test_…` and `rk_test_…`; live mode requires the corresponding live prefixes. |
| `STRIPE_ACCOUNT_ID`, `STRIPE_LIVEMODE`                         | Expected account and explicit `true`/`false` mode. Staging uses false; cloud mode does not imply live payments.                                                                             |
| `STRIPE_WEBHOOK_SECRET`                                        | Raw webhook signature secret. Local Stripe CLI forwarding uses its own listener secret.                                                                                                     |
| `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRODUCT_ID_CREDIT_PACK` | Validated account/mode catalog identities.                                                                                                                                                  |
| `BILLING_PROVIDER_ACCOUNTS`                                    | JSON provider-to-qualified-account mapping; matches published routes, not raw credentials.                                                                                                  |
| `BILLING_USAGE_CURSOR_SECRET`, `BILLING_REQUEST_DIGEST_SECRET` | Server signing/digest secrets, minimum 32 characters.                                                                                                                                       |
| `BILLING_DATABASE_URL`                                         | Protected billing command database connection; API runtime uses its configured application DB/role.                                                                                         |
| `BILLING_INVOCATION_DEADLINE`                                  | Maximum funded call duration, default 300,000 ms.                                                                                                                                           |
| `BILLING_RECOVERY_INTERVAL_MS`                                 | Funded recovery polling, default 30,000 ms. No billing polling in off mode.                                                                                                                 |
| `BILLING_EXACT_INPUT_COUNT`                                    | Strict `true`/`false`, default false; qualified OpenAI input-count request before admission. Adds supplier requests/latency.                                                                |
| `TAU_LLM_PROVIDER_UPSTREAM_URL`                                | Development-only test upstream; refused outside development financial scope today. Not a production provider-origin override or a charging bypass.                                          |

Automatic reload, promotions, model rates and supplier pauses remain policy/capability controls beneath cloud=true. There is no supported `FREE_TIER_AI_ENABLED` or separate `BILLING_ENABLED` presence switch. Paid Free accounts remain eligible for top-up/LLM use in Tau Cloud.

## Browser feature flags

Stored under localStorage `tau:flags`; defaults come from [flag.constants.ts](../apps/ui/app/flags/flag.constants.ts). These change local UI, never server permissions.

| Name               | Default             | Purpose                                                                                |
| ------------------ | ------------------- | -------------------------------------------------------------------------------------- |
| `planMode`         | false               | Planning selector and plan viewer.                                                     |
| `pluginsStore`     | false               | Developing plugin/skill store.                                                         |
| `tauDebug`         | `TAU_DEBUG` default | Diagnostic panels; local override supported.                                           |
| `marketingLanding` | false               | Marketing home for signed-out visitors. Billing must still be absent when cloud=false. |

## CLI and desktop host controls

[Serve options](../packages/cli/src/commands/serve.ts) are the detailed authority; CLI flags may override environment defaults.

| Settings                                                                                    | Purpose / default                                                                                                |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `TAU_HOST_GATEWAY_URL`, `TAU_HOST_RELAY_URL`                                                | Model gateway / relay origins; relay currently defaults to Tau API. Explicitly configure self-host destinations. |
| `TAU_HOST_MODEL`, `TAU_HOST_MODEL_PROVIDER`                                                 | Optional host model override. Browser and desktop compositions otherwise use the API's configured-only catalog.  |
| `TAU_HOST_MODEL_CONTEXT_WINDOW`, `TAU_HOST_SYSTEM_PROMPT`                                   | Host context limit (200,000) and optional system prompt.                                                         |
| `TAU_HOST_AGENT_TOKEN`, `TAU_HOST_URL`                                                      | Host authentication token (minimum 32 characters; generated if absent) and agent-client host locator.            |
| `TAU_HOST_AGENT_PORT`, `TAU_HOST_UI_DIR`, `TAU_HOST_WORKSPACE`                              | Serve port, UI assets and local workspace.                                                                       |
| `TAU_HOST_TEST_MODEL`, `TAU_HOST_EXTERNAL_AGENTS`                                           | Enabled unless exactly `false`; expose GeoSpec test tool / external agents.                                      |
| `TAU_API_TOKEN`                                                                             | CLI publication credential; not browser configuration.                                                           |
| `TAU_RUNTIME_EPHEMERAL`, `TAU_RUNTIME_DEBUG`                                                | Desktop kernel utility switches, enabled with `1`; ephemeral/debug runtime.                                      |
| `TAU_PROJECT_ROOT`, `TAU_CONFIG_DIR`, `TAU_DESKTOP_LOG_DIR`, `TAU_DESKTOP_CLIENT_ROOT`      | Host-managed paths; not cloud mode.                                                                              |
| `TAU_BUILD123D_RESOURCE_ROOT`, `TAU_PICOGK_RESOURCE_ROOT`                                   | Native kernel resource locations.                                                                                |
| `TAU_SOLVER_INPUT_ROOT`, `TAU_OPENFOAM_VERSION`, `TAU_OPENFOAM_IMAGE`, `TAU_CALCULIX_IMAGE` | Optional solver inputs/version/images, independent of billing presence.                                          |

## Ordinary application configuration

Self-host mode still needs normal service configuration. [API schema](../apps/api/app/config/environment.config.ts), [UI schema](../apps/ui/app/environment.config.ts) and [API example](../apps/api/.env.example) list database, pool/timeouts/runtime role, Redis, authentication/OAuth, storage, Git backup, CORS, logging and OpenTelemetry settings. `TAU_GIT_ROOT` and `TAU_GIT_BACKUP_INTERVAL_HOURS` select repository storage and backup cadence. `LOG_LEVEL`, `LOG_SERVICE`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_METRICS_PORT` control observability.

Build/CI variables (`STATS`, `NETLIFY`, `CONTEXT`, `DEPLOY_PRIME_URL`, `DEPLOY_URL`, `NETLIFY_AI_GATEWAY_URL`, `ELECTRON_RENDERER_URL`) are host/build inputs, not self-host feature switches. `import.meta.env.TAU_TARGET` is selected by web/desktop build composition, not a substitute for cloud mode. Internal E2E seeds/tokens and OS/library variables are not deployment features; never ship test credentials as operator defaults. Closeout must reconcile examples against these owners and remove stale entries such as the example-only `SAMBA_API_KEY` if no consumer exists.

## Verification and maintenance

Changes to deployment flags must update this file, the relevant examples, host allowlists and Nx cache inputs together. Release qualification runs production cloud-on/off builds, checks Nest provider/lifecycle presence, inspects emitted module and source-map provenance, tests false→true→false cache transitions, and verifies provider execution off plus funded enforcement on. See the [boundary contract](research/artifacts/tau-cloud-credit-billing-launch-charter/runs/implementation/billing-cloud-boundary.md). New user-facing flags belong here with values, default, consumer, secret/public status and restart/build behavior.
