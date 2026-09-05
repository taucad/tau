# Tau Cloud maintenance

This is the Tau-side route for the optional `repos/tau-cloud` checkout. Public install, build, test and runtime do not require it. For cloud changes, use [Repos](../../../.agents/skills/repos/SKILL.md), read that checkout's instructions and recheck the current stack/module source. The source observations below were verified on 2026-09-05; they do not prove hosted settings or authorize an apply.

## Current owners

| Concern                                    | Source owner                                                      | Tau consumer/contract                                                                |
| ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Staging and regional production            | `repos/tau-cloud/stacks/cloud/staging`, `prod-us`                 | [UI deployment topology](../ui-deployment-topology.md)                               |
| DNS zones and records                      | `repos/tau-cloud/modules/cloudflare-dns`                          | `taucad.dev` and `tau.new` deployment routing                                        |
| R2 storage/CDN/cache rules                 | `repos/tau-cloud/modules/cloudflare-r2/main.tf`                   | `apps/api/app/storage/storage.constants.ts`, publication authorization and readiness |
| Netlify site/repository/environment wiring | `repos/tau-cloud/modules/netlify-site/{main,checks,variables}.tf` | `apps/ui/netlify.toml` and its staging/production build path                         |
| Fly application secrets                    | `repos/tau-cloud/modules/fly-secrets`                             | The selected `apps/api/fly.*.toml` and deployment environment                        |
| Repository governance and Apps             | `repos/tau-cloud/stacks/repo/tau`, shared GitHub modules          | [production promotion runbook](../production-gitops-runbook.md), `.github/workflows` |

Use explicit environment/region identity. Validate required configuration and paired fields before state changes. For Netlify repository linking, site identity, repository branch, installation identity and API access must agree. Its source checks also prevent duplicate environment-variable ownership across secret/plain maps; do not depend on a silent no-op when one input is missing.

## Storage and publication boundaries

The current R2 module provisions a public content bucket plus a private bucket. Only public content has the CDN custom domain, CORS and zone cache rules. Private publication blobs and all publication manifests use the private bucket and authenticated application delivery. The module's older single-bucket README describes an earlier design and must not override `main.tf` or the application's current authorization.

Preserve the direct custom-domain R2 delivery path for public objects. Namespace prefixes, lifecycle scope, cache expressions and application constants must agree. Health objects remain uncached; verify readiness against the actual S3-compatible service and local MinIO equivalent. Public cache rules are not permission to serve a private object anonymously.

The module resolves the account-scoped R2 token permission group and derives S3 credentials according to the provider contract. Inspect names and scoped permissions without logging credential values. Cache expressions currently use prefix/suffix matching; a dated provider-plan limitation is rationale, not a permanent assumption about present entitlement.

## Environment and release boundaries

Git-mode stacks must set the Netlify build root explicitly to `apps/ui`; a missing base overwrites the dashboard value and can silently select the repository root. The committed `publish = "build/client"` is relative to that base and controls actual deploys. The module mirrors the publish value, but its dashboard copy is informational in Git mode and may be stripped in legacy CI mode; do not treat a successful dashboard write as proof of the build's effective paths.

The module's generic secret map uses explicit `environment_variable_secret_contexts` (currently production, deploy-preview, branch-deploy and dev by default). Build-only secrets use the separate three deploy contexts and builds scope. Preserve this distinction and selected-stack overrides; do not apply the build-only list to every secret or replace explicit contexts with `all`.

Keep non-sensitive build commands/defaults in the committed Netlify file and secrets in managed deployment state. Netlify variable contexts/scopes can differ by site and provider entitlement; inspect current module source and the selected site's authorized state before changing them. Do not assume a historical Builds-secret workaround still applies or let build-time `NODE_ENV` silently remove required development dependencies.

The current production UI uses Netlify Git builds on the `production` branch. The bot-owned trail PR is maintained by `.github/workflows/prepare-prod-release.yml`; its merge also triggers the Fly API workflow. Old direct Netlify CLI deployment instructions and former GitHub environment/secret-name inventories are superseded where current source differs. Follow the runbook for the actual operator sequence and verify live staging/branch checks when promotion is authorized.

## Evidence and verification

Validate in the selected stack using its declared Terraform/provider versions and existing validation/test commands. Do not run apply, destroy, DNS changes or token rotation merely to investigate a rule. For approved changes, retain the exact plan and resulting observable service checks under the task's durable owner; redact secrets and state contents.

The [migration's frozen instructions and claim ledger](../../research/artifacts/agents-md-substrate-migration-blueprint/runs/2026-09-05-migration/execution/claims.jsonl) preserve provider incidents, old configurations and their supersession evidence. Current-source pointers above keep this knowledge discoverable when the optional checkout is absent; acquire that checkout only for a task that actually needs it.
