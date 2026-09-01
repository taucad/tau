# Production GitOps runbook (Tau)

Human steps after code lands in Git. Implementation details: **[ui-deployment-topology.md](./ui-deployment-topology.md)**.

## Prerequisites (operators)

| Step                                                                                                                                                                                                                                                                                                                                                                                                            | Workspace / tool   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Link Netlify site `taucad-prod-us` to repo `taucad/tau` (GitHub App) if not already done                                                                                                                                                                                                                                                                                                                        | Netlify UI         |
| Add HCP Sensitive vars `posthog_cli_token`, `posthog_cli_env_id` to **`tau-cloud-staging`** + **`tau-cloud-prod-us`**                                                                                                                                                                                                                                                                                           | HCP Terraform      |
| `terraform plan && apply`: **prod-us first**, then staging (Netlify env parity)                                                                                                                                                                                                                                                                                                                                 | HCP Terraform      |
| Verify `netlify env:list --filter taucad` and `--filter taucad-prod-us`                                                                                                                                                                                                                                                                                                                                         | Netlify CLI        |
| **Apply `tau-repo`** stack (`repos/tau-cloud/stacks/repo/tau`) — Apps, rulesets, `RELEASE_BOT_*`, GitHub environments + **`FLY_API_TOKEN`** / Nx secrets (see **[github-repository-stack](../../repos/tau-cloud/docs/github-repository-stack.md)**; HCP `nx_cloud_access_token_read_write`, `nx_cloud_access_token_read_only`, `fly_api_token_staging`, `fly_api_token_production`, `fly_api_token_review`) | HCP Terraform      |
| Org/repo **never** toggles ON "Actions can create/approve PRs" — enforced by IaC (`github_workflow_repository_permissions`)                                                                                                                                                                                                                                                                                     | GitHub             |
| One-time: `git push origin main:production` to bootstrap the production branch                                                                                                                                                                                                                                                                                                                                  | Git                |
| Branch rulesets on `production` + `main` + `release-managers` team — managed by `tau-repo` stack; **do not protect** `release/*` bot branches                                                                                                                                                                                                                                                                   | GitHub / Terraform |

## First release cycle

1. **Apply `tau-repo` in HCP** (or confirm it is current) — `RELEASE_BOT_APP_ID` / `RELEASE_BOT_APP_PRIVATE_KEY` must exist before the next `prepare-prod-release` run. If brownfield, delete the UI `production` Environment **once** before first apply (see [`repos/tau-cloud/docs/github-repository-stack.md`](../../repos/tau-cloud/docs/github-repository-stack.md)).
2. Merge the `tau` PR that ships App-token `prepare-prod-release.yml` + `.github/CODEOWNERS` to `main`.
3. Push to `main` (or re-run the workflow) — `prepare-prod-release.yml` force-syncs `release/main-to-production` and upserts the trail PR (`base=production`).
4. Smoke **staging**: `https://taucad.dev`, `https://api.taucad.dev/health/live`.
5. Merge the trail PR (**no CI on that PR** — CI uses `pull_request.branches-ignore: production`).
6. Confirm Netlify deployed `taucad-prod-us` and GH Actions **`prod-deploy-on-merge`** deployed Fly `tau-api`.
7. (Optional hygiene) Remove obsolete GitHub repo / Environment secrets nobody reads anymore (safe even if duplicates existed):
   - Repo + environment: `NETLIFY_AUTH_TOKEN`, `NETLIFY_PROD_US_SITE_ID`, any `NETLIFY_*_SITE_ID`
   - Repo / env duplicates of PostHog if migrated to Netlify-only: `POSTHOG_CLI_TOKEN`, `POSTHOG_CLI_ENV_ID`
   - **`FLY_API_TOKEN`** lives only on GitHub Actions **environments** `staging`, `production`, and `review-api` — **delete repo-scope `FLY_API_TOKEN`** once `tau-repo` has applied so deploy + review workflows keep resolving env secrets.
   - **`NX_CLOUD_ACCESS_TOKEN`**: writable token only on environment **`nx-cloud-write`** (`main` + `production`); repo-scope holds the **read-only** fallback for PRs/Fly Docker builds (`tau-repo` replaces the repo-level value)—see **[github-repository-stack](../../repos/tau-cloud/docs/github-repository-stack.md)**.
8. Delete unused environment **`review-ui`** in GitHub (Netlify previews replaced it).

## GitHub environments (`NX_CLOUD_ACCESS_TOKEN` + Fly)

Tau splits Nx Cloud access so PR workflows cannot overwrite the remote execution cache (“cache poisoning”). Full branch-policy matrix and Terraform resource list: **[repos/tau-cloud/docs/github-repository-stack.md](../../repos/tau-cloud/docs/github-repository-stack.md)**.

| Goal                                 | Implementation                                                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only trusted branches write Nx cache | `ci.yml` job `affected` uses **`environment: nx-cloud-write`** on `main` **push**; that env exposes the **read-write** Nx Cloud token and is limited to **`main`** + **`production`** branch policies |
| PRs still read remote cache          | Other jobs inherit repo-scope **`NX_CLOUD_ACCESS_TOKEN`** = **read-only** token (Terraform-managed)                                                                                                   |

Fly deploy secrets are **never** repo-global: use **`staging`**, **`production`**, **`review-api`** environments only (`FLY_API_TOKEN`).

Operator pre-flight (once): create **read-write** + **read-only** access tokens in the Nx Cloud workspace; set HCP Sensitive vars **`nx_cloud_access_token_read_write`** and **`nx_cloud_access_token_read_only`** before `tau-repo` apply.

## Break-glass

- **`tau-iac` / `tau-release-bot` key compromise** — regenerate the App key in GitHub → update Sensitive HCP var (`github_app_pem` or `release_bot_app_pem`) → `terraform apply` `tau-repo`.
- **`netlify/netlify` provider — `Account.billing_period` regression** — see [`repos/tau-cloud/docs/netlify-iac-runbook.md`](../../repos/tau-cloud/docs/netlify-iac-runbook.md): provider `token` only, per-resource `team_id` on encrypted env vars.
- **Netlify webhook / Git breakage** — emergency UI deploy via local `netlify deploy --prod` with a human PAT (not stored in GitHub Actions by default).
