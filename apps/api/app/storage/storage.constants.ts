/**
 * Logical namespaces inside the single R2 bucket. Each maps to a stable
 * path prefix under the CDN custom domain — `https://cdn.tau.new/<prefix><key>`.
 *
 * MUST stay in sync with:
 * - `repos/cloud-infra/modules/cloudflare-r2/main.tf` (zone cache rules)
 * - `scripts/seed-r2-defaults.sh` (default seed object keys)
 * - `infra/docker-compose.yml` MinIO bootstrap (local parity)
 * - `apps/ui/netlify.toml` CSP `connect-src` (origin only; prefix not referenced)
 */
export const STORAGE_NAMESPACE_PREFIXES = {
  blobs: 'blobs/',
  derivatives: 'derivatives/',
  'og-images': 'og-images/',
  defaults: 'defaults/',
} as const;

export type StorageNamespace = keyof typeof STORAGE_NAMESPACE_PREFIXES;

/**
 * Bucket-root-relative key for the readiness probe object. NOT prefixed
 * with any namespace — `__health/` is a sibling of the namespace prefixes
 * so the zone cache rule `/__health/*` (cache: false) matches without
 * interfering with namespace paths.
 */
export const STORAGE_HEALTH_PROBE_KEY = '__health/probe.txt';
