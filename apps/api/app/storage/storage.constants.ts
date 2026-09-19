/**
 * Logical namespaces shared by both content buckets. In the public bucket
 * (`TAU_S3_BUCKET`) each maps to a stable path prefix under the CDN custom
 * domain — `https://cdn.tau.new/<prefix><key>`. The private bucket
 * (`TAU_S3_PRIVATE_BUCKET`) reuses the same prefixes but has no custom
 * domain and no anonymous read: private publications' blobs and ALL
 * publication manifests live there and are served only through the
 * authenticated publication file proxy.
 *
 * MUST stay in sync with:
 * - `repos/tau-cloud/modules/cloudflare-r2/main.tf` (buckets + zone cache rules)
 * - `scripts/seed-r2-defaults.sh` (default seed object keys)
 * - `infra/docker-compose.yml` MinIO bootstrap (local parity, incl. private bucket)
 * - `apps/ui/netlify.toml` CSP `connect-src` (origin only; prefix not referenced)
 */
export const storageNamespacePrefixes = {
  /**
   * Authoritative per-tenant state: `tenants/<ownerId>/repos/<projectId>/…`
   * and `tenants/<ownerId>/lfs/<projectId>/…` (charter D24). Private tier
   * only — it has no CDN custom domain and therefore needs no zone cache rule,
   * and no listing under it ever crosses a tenant.
   */
  tenants: 'tenants/',
  blobs: 'blobs/',
  derivatives: 'derivatives/',
  'og-images': 'og-images/',
  defaults: 'defaults/',
} as const;

export type StorageNamespace = keyof typeof storageNamespacePrefixes;

/**
 * Bucket-root-relative key for the readiness probe object. NOT prefixed
 * with any namespace — `__health/` is a sibling of the namespace prefixes
 * so the zone cache rule `/__health/*` (cache: false) matches without
 * interfering with namespace paths.
 */
export const storageHealthProbeKey = '__health/probe.txt';
