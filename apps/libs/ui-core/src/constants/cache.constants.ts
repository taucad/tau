/**
 * Response header that carries the CDN-only cache policy. Netlify reads
 * `Netlify-CDN-Cache-Control`; other hosts may use `CDN-Cache-Control` or a
 * vendor-specific equivalent — keep names centralized here.
 */
export const cdnCacheControlResponseHeader = 'Netlify-CDN-Cache-Control';
