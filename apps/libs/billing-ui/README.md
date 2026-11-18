# @taucad/billing-ui

The billing feature of the Tau UI app: the billing presentation primitives, the monthly credits meter, the plan and kernel tier badges, and the usage page's charts, tables, summary cards and filters. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Cut from `apps/ui/app/components/billing`, `components/tier-badge` and `routes/usage` in UI wave D (CI decomposition blueprint, Part 3 P2 row D). It holds presentation only: no module here sends a payment request, reads the financial session or touches saved usage. `@taucad/billing` stays the billing data layer (wire schemas, catalogue and hooks), and this library imports it.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the billing settings, the navigation credits menu, the cloud commercial features and the `/usage` route).

| Subpath                                          | Contents                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `./components/billing/billing-primitives`        | Notices, inline errors, status badge, icon lines, summary rows, `supportEmail` and `formatBillingDate` |
| `./components/billing/monthly-credits-meter`     | `MonthlyCreditsMeter` and its state type                                                               |
| `./components/tier-badge`                        | `ProBadge`, `TierBadge` and `KernelTierBadge`                                                          |
| `./components/usage/activity-names`              | Chat and project labels for usage rows                                                                 |
| `./components/usage/credits`                     | Credit display helpers for the usage charts                                                            |
| `./components/usage/provider-colors`             | Provider colours for the usage charts                                                                  |
| `./components/usage/columns`                     | The usage table's columns and row helpers                                                              |
| `./components/usage/reserved-table`              | `ReservedTable`, the open credit holds                                                                 |
| `./components/usage/usage-summary-cards`         | `UsageSummaryCards`                                                                                    |
| `./components/usage/use-usage-filters`           | `useUsageFilters` and the filter options                                                               |
| `./components/usage/charts/credit-usage-tooltip` | `CreditUsageTooltip`                                                                                   |
| `./components/usage/charts/usage-bar-chart`      | `UsageBarChart`                                                                                        |
| `./components/usage/charts/usage-line-chart`     | `UsageLineChart`                                                                                       |
| `./components/usage/charts/usage-pie-chart`      | `UsagePieChart`                                                                                        |

## Still in the app

- `lib/billing-payment-client`: it reaches `db/billing-snapshot-store` (and through it `constants/meta.constants`, which reads `#package.json`), `lib/api-request-id`, `lib/build-target` (`import.meta.env.TAU_TARGET`) and `providers/financial-session-provider`. Every payment surface imports it, so these stay with it: `plan-cards`, `topup-modal` (also `lib/legal-url`), `cancel-plan-settings`, `auto-reload-settings`, `account-closure-settings` (also `lib/auth-client`), `use-billing-binding` and `components/settings/billing-settings` (also the email-deliverability banner).
- `lib/billing-lifecycle-client`, `hooks/use-auto-reload-enabled` and `hooks/use-credit-preflight`: they reach the payment client and `lib/api-request-id`; `use-credit-preflight` is also a self-host build override.
- `db/billing-snapshot-store` and `providers/financial-session-provider`: `constants/meta.constants` (`#package.json`).
- `cloud/*-billing*`: the cloud build boundary (`cloudBoundarySpecifiers` in `apps/ui/vite.config.ts`); `root-billing` also reads `#environment.config`.
- `routes/usage/route.tsx` (the route module), `usage-table` and `use-chat-name`: `hooks/use-project-manager`.
- The chat usage and credit-error modules under `routes/w.$workspace.$project`: self-host build overrides that reach `hooks/use-models`, `hooks/use-chat`, `db/billing-snapshot-store` and `lib/api-request-id`.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
