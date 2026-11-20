import type { LoaderFunction } from 'react-router';
import { cdnCacheControlResponseHeader } from '@taucad/ui-core/constants/cache.constants';
import { readBuildId } from '#lib/build-identity.js';

/**
 * The operator's build floor (`TAU_MIN_BUILD_ID`): the oldest build the site still supports, or `undefined` when unset or
 * not a positive integer. Read on every request, so a change to the site's variable needs no rebuild of this function.
 *
 * @returns The floor.
 */
const readMinBuildId = (): number | undefined => {
  const value = Number(process.env['TAU_MIN_BUILD_ID']);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

/**
 * The build this server renders pages for (`#lib/build-identity`).
 *
 * A page whose lazy import failed asks this to tell a deploy that replaced its
 * chunks from a genuine failure (`#lib/stale-build-recovery`, TAU-UI-6). The
 * answer must name the live deploy, so neither the browser nor the CDN stores it.
 *
 * `minBuildId`, when the operator sets one, is the oldest build the site still supports: the web app's service worker
 * stops serving its cached shells before the network once its build is below it (FP2 of Brain
 * `research/pl7-service-worker-staging-defects-blueprint.md`), the per-build form of the kill switch.
 */
export const loader: LoaderFunction = () =>
  Response.json(
    { buildId: readBuildId(), minBuildId: readMinBuildId() },
    { headers: { 'Cache-Control': 'no-store', [cdnCacheControlResponseHeader]: 'no-store' } },
  );
