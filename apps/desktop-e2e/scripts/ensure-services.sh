#!/usr/bin/env bash
#
# Bring up the infrastructure every `apps/desktop-e2e` tier needs, once.
#
# `api:db-migrate` is now the whole bootstrap: it applies the schema, installs
# the billing protections and the runtime role, and — with
# `TAU_CLOUD_ENABLED=true` — derives the development tariff from the code route
# table over `infra/billing/development.commercial.json` and publishes it when
# its content moved. It is idempotent, so the head-revision probe this script
# used to carry is gone: a second run reports `unchanged`, and a run after a
# catalog change supersedes the stale tariff instead of refusing to (defect C,
# and the C65/P70 failure the probe was working around).
#
# `billing-command` runs `ensureWorktreeDatabase` for development, so this
# checkout's own fork of `tau_dev` is the one migrated and published to.
#
# `TAU_CLOUD_ENABLED=true` is exported for the same reason `global-setup.ts`
# sets it on the API child: without it `migrate` still applies the schema but
# skips the tariff, and the funded desktop turn has nothing to bill against.
#
# Required env vars:
#   None
# Optional env vars:
#   None
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
TAU_CLOUD_ENABLED=true pnpm --dir "${REPO_ROOT}" exec nx run api:db-migrate
