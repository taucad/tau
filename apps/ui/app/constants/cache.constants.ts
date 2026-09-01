/**
 * Browser cache: always revalidate; freshness is delegated to the CDN layer.
 * Portable `Cache-Control` — not provider-specific.
 */
export const browserRevalidateCacheControl = 'public, max-age=0, must-revalidate';

/**
 * Edge CDN hint for SSR routes whose body changes only on deploy. Today this
 * targets Netlify Durable Cache; if the edge moves,
 * replace {@link cdnCacheControlResponseHeader} + this directive string per
 * the new provider's docs.
 */
export const edgeDurableSsrRouteCacheControl = 'public, durable, s-maxage=86400, stale-while-revalidate=604800';

/**
 * Shorter edge TTL for marketing/homepage SSR where copy may change between
 * deploys without a client hash bump. Browser still revalidates every
 * navigation via {@link browserRevalidateCacheControl}.
 */
export const edgeShortLivedSsrRouteCacheControl = 'public, durable, s-maxage=600, stale-while-revalidate=86400';

/**
 * Response header that carries the CDN-only cache policy. Netlify reads
 * `Netlify-CDN-Cache-Control`; other hosts may use `CDN-Cache-Control` or a
 * vendor-specific equivalent — keep names centralized here.
 */
export const cdnCacheControlResponseHeader = 'Netlify-CDN-Cache-Control';

/**
 * Netlify header: restrict query keys that participate in the cache key (empty
 * allowlist ⇒ strip arbitrary `?utm_*` etc.). Swap the header name if the CDN
 * uses a different vary mechanism.
 */
export const cdnVaryQueryResponseHeader = 'Netlify-Vary';

/**
 * Empty query-key allowlist (`query=`) so UTM/shard params do not fragment CDN
 * entries for static-output SSR handlers.
 */
export const cdnVaryQueryEmptyAllowlist = 'query=';

/** Standard tag header for granular CDN purge APIs (Netlify `Cache-Tag`). */
export const cacheTagResponseHeader = 'Cache-Tag';
