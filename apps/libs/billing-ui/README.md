# @taucad/billing-ui

The billing feature of the Tau UI app: the payment and lifecycle clients, the financial session, the saved-usage store, the billing settings page, the Add credits dialog, the plan cards and the cancel-plan, auto-reload and account-closure settings, plus the billing presentation primitives, the monthly credits meter, the plan and kernel tier badges, the usage page's charts, tables, summary cards and filters, and the usage control under a chat message. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Moved from `apps/ui/app`: `components/billing`, `components/settings/billing-settings`, `components/tier-badge`, `lib/billing-payment-client`, `lib/billing-lifecycle-client`, `db/billing-snapshot-store`, `providers/financial-session-provider` and `hooks/use-auto-reload-enabled` keep their paths under `src/`; the usage page's leaves under `routes/usage`, including its activity table and chat-name lookup, and the chat message usage control from `routes/w.$workspace.$project`, are under `src/components/usage`. Nothing here reads the app's environment: the API base URL arrives in the payment-action binding from `@taucad/billing`'s billing session, storage and channel names take the database prefix from `@taucad/ui-core/constants/meta.constants`, request ids are recorded through `@taucad/ui-core/lib/api-request-id`, the desktop build is told apart by `@taucad/ui-core/lib/build-target`, and the app supplies what only it can reach: the legal-page links through `BillingLegalLinksProvider`, the account-deletion call as `AccountClosureSettings`' `services` prop, its email-deliverability banner as `BillingSettings`' `accountNotice`, and the project manager's `getChatRecordsForResource` as `UsageTable`'s prop of that name. `@taucad/billing` stays the billing data layer (wire schemas, catalogue and hooks), and this library imports it.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the billing settings, the navigation credits menu, the cloud commercial features, the chat message usage parts and the `/usage` route).

| Subpath                                          | Contents                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `./components/billing/billing-primitives`        | Notices, inline errors, status badge, icon lines, summary rows, `supportEmail` and `formatBillingDate`                                      |
| `./components/billing/monthly-credits-meter`     | `MonthlyCreditsMeter` and its state type                                                                                                    |
| `./components/billing/auto-reload-settings`      | `AutoReloadSettings`, the auto-reload consent and threshold controls                                                                        |
| `./components/billing/cancel-plan-settings`      | `CancelPlanSettings`                                                                                                                        |
| `./components/billing/plan-cards`                | `PlanCards` bound to the payment client                                                                                                     |
| `./components/billing/use-billing-binding`       | `useBillingBinding`, the payment-action binding for the signed-in owner                                                                     |
| `./components/billing/topup-modal`               | `TopupModal`, the Add credits dialog                                                                                                        |
| `./components/billing/account-closure-settings`  | `AccountClosureSettings` and the `AccountClosureServices` it is given                                                                       |
| `./components/settings/billing-settings`         | `BillingSettings`, the Billing settings page                                                                                                |
| `./components/tier-badge`                        | `ProBadge`, `TierBadge` and `KernelTierBadge`                                                                                               |
| `./components/usage/activity-names`              | Chat and project labels for usage rows                                                                                                      |
| `./components/usage/chat-message-usage`          | `ChatMessageUsage`, the usage control under an assistant message, and `sumUsageTokens`; the app passes the resolved model's name and family |
| `./components/usage/credits`                     | Credit display helpers for the usage charts                                                                                                 |
| `./components/usage/provider-colors`             | Provider colours for the usage charts                                                                                                       |
| `./components/usage/columns`                     | The usage table's columns and row helpers                                                                                                   |
| `./components/usage/reserved-table`              | `ReservedTable`, the open credit holds                                                                                                      |
| `./components/usage/usage-summary-cards`         | `UsageSummaryCards`                                                                                                                         |
| `./components/usage/usage-table`                 | `UsageTable`, the activity rows and each row's credit explanation                                                                           |
| `./components/usage/use-chat-name`               | `useChatName` and the `ChatRecordsReader` it is given                                                                                       |
| `./components/usage/use-usage-filters`           | `useUsageFilters` and the filter options                                                                                                    |
| `./components/usage/charts/credit-usage-tooltip` | `CreditUsageTooltip`                                                                                                                        |
| `./components/usage/charts/usage-bar-chart`      | `UsageBarChart`                                                                                                                             |
| `./components/usage/charts/usage-line-chart`     | `UsageLineChart`                                                                                                                            |
| `./components/usage/charts/usage-pie-chart`      | `UsagePieChart`                                                                                                                             |
| `./db/billing-snapshot-store`                    | The saved-usage IndexedDB store, revision minimum and purge                                                                                 |
| `./hooks/use-auto-reload-enabled`                | `useAutoReloadEnabled`                                                                                                                      |
| `./lib/billing-lifecycle-client`                 | Auto-reload consent and account-closure requests                                                                                            |
| `./lib/billing-payment-client`                   | Top-up, subscription, portal and recovery requests; `followPaymentRedirect`                                                                 |
| `./providers/billing-legal-links-provider`       | `BillingLegalLinksProvider` and `useBillingLegalLinks`, the legal-page links the app supplies                                               |
| `./providers/financial-session-provider`         | `FinancialSessionProvider`, `useFinancialSession` and the cross-tab purge                                                                   |

## Still in the app

What remains in `apps/ui` stays by design: each piece is a build boundary or reads what only the app can reach.

- `cloud/*` billing variants (`environment-billing`, `financial-purge`, `nav-billing`, `root-billing`, `settings-billing`, each with `.cloud` and `.self-host` files and most with an `.adaptive` one): the cloud build boundary (`cloudBoundarySpecifiers` in `apps/ui/vite.config.ts`) picks one per deployment, and a module inside this library cannot be swapped that way. They also bind the seams: `root-billing` supplies the legal links, `settings-billing` the account-deletion call from `lib/auth-client` and the email-deliverability banner, all of which read `#environment.config`.
- `hooks/use-credit-preflight` and its `.self-host` and `.adaptive` overrides, with `hooks/credit-preflight-refusal`: the self-host build swaps the module (`selfHostSourceOverrides` in `apps/ui/vite.config.ts`), which works only on an app `#…` specifier.
- `lib/legal-url`: it reads `#environment.config` through `lib/website-origin`; it reaches this library through `BillingLegalLinksProvider`.
- `chat-error-credits*` and `chat-details-usage*` under `routes/w.$workspace.$project`: self-host build overrides that also reach `hooks/use-chat`, `hooks/use-models`, `hooks/use-chats` and the project hooks.
- `routes/usage/route.tsx`: a route module, which the app's file-based route manifests find under `app/routes`. It reads `hooks/use-cloud-projects` and `hooks/use-project-manager`, and passes the project manager's `getChatRecordsForResource` to `UsageTable`.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
