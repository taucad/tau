# @taucad/api-billing

API billing: credit ledger, payments, Stripe and billing commands.

The NestJS server library behind Tau Cloud billing. `BillingModule` and its services are imported from the root; the billing administration command body is `./cli` (the app's `app/billing-command.ts` entry builds it into `apps/api/dist/billing-command.js`), and the foundation fixtures are `./testing/*`.

## Checks

- `pnpm nx test api-billing` runs the unit suites.
- `pnpm nx run api-billing:test:billing-foundation` runs the database and Stripe adapter contracts on a disposable PostgreSQL 17 it owns. CI runs it in the `Billing contracts` job when this project or one it depends on is affected.
- `pnpm nx run api-billing:formal:tla` checks the `GatewayInvocation` models in `specs/`.
