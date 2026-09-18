#!/usr/bin/env bash
#
# Bring up the infrastructure every `apps/desktop-e2e` tier needs, once.
#
# The three steps used to be repeated verbatim in five Nx targets, and the third
# of them — `api:billing-policy:publish:development` — only ever succeeds on a
# database that has never published a billing policy. It pins
# `--activation-id development-bootstrap-v1 --job-key development-bootstrap-v1
# --expected-head-revision 0 --expected-predecessor-activation-id none`, so once
# `billing.billing_policy_head` has moved it answers either "policy publication
# job key conflicts with prior payload" (the checked-in policy file was
# regenerated since the bootstrap publish) or a head-revision conflict. Every
# desktop-e2e target therefore died before vitest started, and the two-client
# tier's recorded runs all bypassed its target (defect C65, queue ruling P70).
#
# The fix is to treat the publish as what its own metadata calls it —
# *bootstrap* — and run it only when this environment has no policy head at all.
# A published head is exactly the state the bootstrap was trying to reach, so
# skipping it is not a workaround: it is the guard the step always needed.
#
# `TAU_CLOUD_ENABLED=true` is exported for the same reason `global-setup.ts`
# sets it on the API child: `billing-command` refuses to start without it, and
# no desktop-e2e target ever supplied it, so even a virgin database could not
# bootstrap from these targets.
#
# Required env vars:
#   None
# Optional env vars:
#   DATABASE_URL                Overrides the connection `apps/api/.env` names.
#   TAU_E2E_POSTGRES_DATABASE   Overrides the database the policy guard reads.
#
# Usage:
#   apps/desktop-e2e/scripts/ensure-services.sh
#   (invoked from the `apps/desktop-e2e` directory by every Nx e2e target)
#
# Exit codes:
#   0  Infrastructure is up, migrated, and a development billing policy exists
#   non-zero  Any step failed

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

docker-compose -f "${REPO_ROOT}/infra/docker-compose.yml" up -d postgres redis minio minio-bootstrap
pnpm --dir "${REPO_ROOT}" exec nx run api:db-migrate

# The same psql vocabulary `src/support/two-client/tau-cloud.ts` seeds through,
# against the same database the API boots with. `docker exec` cannot see the
# API's `DATABASE_URL`, and this line used to name `tau_dev` outright — so in a
# linked worktree, whose `apps/api/.env` points at that worktree's own fork, the
# guard read a head belonging to a database nobody was using and either skipped
# a bootstrap the fork still needed or attempted one it did not (W10 defect 1,
# the same hard-coding fixed in `src/git/config.ts` and `src/support/config.ts`).
# `TAU_E2E_POSTGRES_DATABASE` still wins, as it does for the TypeScript helpers.
api_env_file="${REPO_ROOT}/apps/api/.env"
database_url="${DATABASE_URL:-}"
if [[ -z "${database_url}" && -f "${api_env_file}" ]]; then
  database_url="$(sed -n 's/^DATABASE_URL=//p' "${api_env_file}" | head -1)"
fi
database_name="${TAU_E2E_POSTGRES_DATABASE:-${database_url##*/}}"
database_name="${database_name%%\?*}"
: "${database_name:=tau_dev}"

existing_head="$(docker exec tau-postgres psql -qtAX -v ON_ERROR_STOP=1 -U dev_user -d "${database_name}" \
  -c "SELECT revision FROM billing.billing_policy_head WHERE environment = 'development';")"

if [[ -n "${existing_head}" ]]; then
  echo "Development billing policy already published in ${database_name} at revision ${existing_head}; skipping bootstrap."
  exit 0
fi

TAU_CLOUD_ENABLED=true pnpm --dir "${REPO_ROOT}" exec nx run api:billing-policy:publish:development
