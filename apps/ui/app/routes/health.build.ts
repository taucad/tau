import type { LoaderFunction } from 'react-router';
import { cdnCacheControlResponseHeader } from '#constants/cache.constants.js';
import { readBuildId } from '#lib/build-identity.js';

/**
 * The build this server renders pages for (`#lib/build-identity`).
 *
 * A page whose lazy import failed asks this to tell a deploy that replaced its
 * chunks from a genuine failure (`#lib/stale-build-recovery`, TAU-UI-6). The
 * answer must name the live deploy, so neither the browser nor the CDN stores it.
 */
export const loader: LoaderFunction = () =>
  Response.json(
    { buildId: readBuildId() },
    { headers: { 'Cache-Control': 'no-store', [cdnCacheControlResponseHeader]: 'no-store' } },
  );
