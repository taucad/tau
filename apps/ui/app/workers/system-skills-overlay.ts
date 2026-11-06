/**
 * The browser's system skill bundles, as the overlay a composed view merges.
 *
 * Two workers compose a view over the same checkout — the file-manager worker
 * for the user and the agent host worker for the agent — and both need the same
 * overlay data. Building it here keeps one producer for one set of bundles; the
 * merge itself is `composeView`'s and exists once (charter D1).
 *
 * Each realm that imports this module holds one content-addressed resource
 * cache, so a generated resource is fetched at most once per realm while it
 * stays within the cache budget, and every view the realm composes shares it.
 *
 * @module
 */

import {
  createCachedSkillResourceReader,
  createSkillBundleOverlay,
  createSkillBundleRegistry,
} from '@taucad/agent-tools/registry';
import type { ReadSkillResource, SkillResourceCacheStats } from '@taucad/agent-tools/registry';
import { workerTimings } from '@taucad/filesystem';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { systemSkillBundles } from '@taucad/skills/resources';

const registry = createSkillBundleRegistry(systemSkillBundles);

/* The cache owns the request, so no caller's signal reaches it: one caller
 * giving up must not abort the bytes another is waiting for. */
const fetchResource: ReadSkillResource = async (resource) => {
  const response = await fetch(resource.url);
  if (!response.ok) {
    throw Object.assign(new Error(`Resource request failed with HTTP ${String(response.status)}.`), { code: 'EIO' });
  }
  return new Uint8Array(await response.arrayBuffer());
};

/* Each caller gets its own copy: a bridge reply may transfer the buffer it is
 * handed, which would detach the cached bytes for every later read. */
const resources = createCachedSkillResourceReader(fetchResource, {
  copy: true,
  onEvent: (event) => {
    if (event === 'read') {
      workerTimings.count('overlay.read');
    } else if (event === 'fetch') {
      workerTimings.count('overlay.fetch');
    }
  },
});

/**
 * The system skill overlay for this build.
 *
 * @returns The overlay `composeView` composes at `.agents/skills`.
 * @public
 */
export const systemSkillsOverlay = (): ComposedViewOverlay => createSkillBundleOverlay(registry, resources.read);

/**
 * This realm's system skill resource cache counters.
 *
 * @returns Fetches, cache hits, retained bytes and evictions since the realm started.
 * @public
 */
export const systemSkillResourceStats = (): SkillResourceCacheStats => resources.stats();
