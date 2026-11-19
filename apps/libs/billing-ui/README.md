# @taucad/billing-ui

The billing feature of the Tau UI app: the payment and lifecycle clients, the financial session, the saved-usage store, the plan cards and the cancel-plan and auto-reload settings, plus the billing presentation primitives, the monthly credits meter, the plan and kernel tier badges, and the usage page's charts, tables, summary cards and filters. Private and source-consumed (`scope:ui type:app-lib layer:feature`): `apps/ui` imports it; it imports only app-libs and packages, never `apps/ui`.

Moved from `apps/ui/app`: `components/billing`, `components/tier-badge`, `lib/billing-payment-client`, `lib/billing-lifecycle-client`, `db/billing-snapshot-store`, `providers/financial-session-provider` and `hooks/use-auto-reload-enabled` keep their paths under `src/`; the usage page's leaves under `routes/usage` are under `src/components/usage`. Nothing here reads the app's environment: the API base URL arrives in the payment-action binding from `@taucad/billing`'s billing session, storage and channel names take the database prefix from `@taucad/ui-core/constants/meta.constants`, request ids are recorded through `@taucad/ui-core/lib/api-request-id`, and the desktop build is told apart by `@taucad/ui-core/lib/build-target`. `@taucad/billing` stays the billing data layer (wire schemas, catalogue and hooks), and this library imports it.

## Entrypoints

One subpath per module, pinned by `src/exports.test.ts`. Audience: `apps/ui` (the billing settings, the navigation credits menu, the cloud commercial features and the `/usage` route).

| Subpath                                          | Contents                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `./components/billing/billing-primitives`        | Notices, inline errors, status badge, icon lines, summary rows, `supportEmail` and `formatBillingDate` |
| `./components/billing/monthly-credits-meter`     | `MonthlyCreditsMeter` and its state type                                                               |
| `./components/billing/auto-reload-settings`      | `AutoReloadSettings`, the auto-reload consent and threshold controls                                   |
| `./components/billing/cancel-plan-settings`      | `CancelPlanSettings`                                                                                   |
| `./components/billing/plan-cards`                | `PlanCards` bound to the payment client                                                                |
| `./components/billing/use-billing-binding`       | `useBillingBinding`, the payment-action binding for the signed-in owner                                |
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
| `./db/billing-snapshot-store`                    | The saved-usage IndexedDB store, revision minimum and purge                                            |
| `./hooks/use-auto-reload-enabled`                | `useAutoReloadEnabled`                                                                                 |
| `./lib/billing-lifecycle-client`                 | Auto-reload consent and account-closure requests                                                       |
| `./lib/billing-payment-client`                   | Top-up, subscription, portal and recovery requests; `followPaymentRedirect`                            |
| `./providers/financial-session-provider`         | `FinancialSessionProvider`, `useFinancialSession` and the cross-tab purge                              |

## Still in the app

- `components/billing/topup-modal`: it links the Terms and refund policy through `lib/legal-url`, which reads `#environment.config` (`lib/website-origin`).
- `components/billing/account-closure-settings`: it signs the closed account out through `lib/auth-client` (`#environment.config`).
- `components/settings/billing-settings`: it renders both of the above and the email-deliverability banner.
- `hooks/use-credit-preflight`: a self-host build override (`selfHostSourceOverrides` in `apps/ui/vite.config.ts`).
- `cloud/*-billing*` and `cloud/financial-purge`: the cloud build boundary (`cloudBoundarySpecifiers` in `apps/ui/vite.config.ts`); `root-billing` also reads `#environment.config`.
- `routes/usage/route.tsx` (the route module), `usage-table` and `use-chat-name`: `hooks/use-project-manager`.
- The chat usage and credit-error modules under `routes/w.$workspace.$project`: self-host build overrides that reach `hooks/use-models` and `hooks/use-chat`.

Part of the [Tau](https://github.com/taucad/tau) monorepo.
