#!/usr/bin/env bash
# Seed default assets and the readiness probe object into the single R2 content bucket.
# Requires AWS CLI v2 configured with credentials that can write to the bucket.
#
# Namespace prefixes (blobs/, derivatives/, defaults/, __health/) are compile-time
# constants in apps/api/app/storage/storage.constants.ts and mirrored verbatim here.
#
# Usage:
#   export AWS_ACCESS_KEY_ID=<R2 access key id from HCP Terraform output>
#   export AWS_SECRET_ACCESS_KEY=<R2 secret access key>
#   export TAU_S3_ENDPOINT=https://271cffba9907a76320b6a4993f756601.r2.cloudflarestorage.com
#   export TAU_S3_BUCKET=tau-staging-content   # or tau-prod-content
#   bash scripts/seed-r2-defaults.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${TAU_S3_ENDPOINT:?set TAU_S3_ENDPOINT (R2 S3-compatible endpoint)}"
: "${TAU_S3_BUCKET:?set TAU_S3_BUCKET (single content bucket name, e.g. tau-staging-content)}"

aws s3 cp "${ROOT}/infra/seed/default-og.png" "s3://${TAU_S3_BUCKET}/defaults/og.png" \
  --endpoint-url "${TAU_S3_ENDPOINT}" \
  --content-type image/png \
  --cache-control 'public, max-age=86400'

aws s3 cp "${ROOT}/infra/seed/default-thumb.webp" "s3://${TAU_S3_BUCKET}/defaults/thumb.webp" \
  --endpoint-url "${TAU_S3_ENDPOINT}" \
  --content-type image/webp \
  --cache-control 'public, max-age=86400'

# Readiness probe object — must exist so S3HealthIndicator returns `up`.
# Cache-Control: no-store ensures the Cloudflare edge never serves a stale probe
# (the zone cache rule /__health/* no-store matches independently, but belt-and-braces).
printf 'ok\n' | aws s3 cp - "s3://${TAU_S3_BUCKET}/__health/probe.txt" \
  --endpoint-url "${TAU_S3_ENDPOINT}" \
  --content-type 'text/plain' \
  --cache-control 'no-store'

echo "seed-r2-defaults: uploaded defaults/og.png + defaults/thumb.webp + __health/probe.txt → ${TAU_S3_BUCKET}"
