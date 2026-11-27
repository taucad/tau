import type { LoaderFunction } from 'react-router';
import { cdnCacheControlResponseHeader } from '@taucad/ui-core/constants/cache.constants';
import { readBuildId, resolveMinBuildId } from '#lib/build-identity.js';

/**
 * The oldest build whose assets this deploy still serves, as the deploy stamped it into the server graph
 * (`retain-previous-assets.mts`), or `undefined` where nothing defines it (dev, tests, desktop, `tau serve`). An
 * unstamped build holds the placeholder, which is no build id.
 *
 * @returns The stamped text, or `undefined`.
 */
const readRetainedBuildFloor = (): string | undefined =>
  typeof tauRetainedBuildFloor === 'string' ? tauRetainedBuildFloor : undefined;

/**
 * The build this server renders pages for (`#lib/build-identity`).
 *
 * A page whose lazy import failed asks this to tell a deploy that replaced its
 * chunks from a genuine failure (`#lib/stale-build-recovery`, TAU-UI-6). The
 * answer must name the live deploy, so neither the browser nor the CDN stores it.
 *
 * `minBuildId` is the oldest build the site still supports (FP2 of Brain
 * `research/pl7-service-worker-staging-defects-blueprint.md`): the newer of the operator's floor (`TAU_MIN_BUILD_ID`,
 * read on every request, the per-build form of the kill switch, also raised on a breaking API change) and the oldest
 * build whose assets this deploy still serves. The page hands it to the web app's service worker, which then serves
 * the cached shells of an older build only offline.
 */
export const loader: LoaderFunction = () =>
  Response.json(
    {
      buildId: readBuildId(),
      minBuildId: resolveMinBuildId({
        operatorFloor: process.env['TAU_MIN_BUILD_ID'],
        retainedFloor: readRetainedBuildFloor(),
      }),
    },
    { headers: { 'Cache-Control': 'no-store', [cdnCacheControlResponseHeader]: 'no-store' } },
  );
