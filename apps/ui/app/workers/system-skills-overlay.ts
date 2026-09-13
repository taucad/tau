/**
 * The browser's built-in skill bundles, as the overlay a composed view merges.
 *
 * Two workers compose a view over the same checkout — the file-manager worker
 * for the user and the agent host worker for the agent — and both need the same
 * overlay data. Building it here keeps one producer for one set of bundles; the
 * merge itself is `composeView`'s and exists once (charter D1).
 *
 * @module
 */

import { createSkillBundleOverlay, createSkillBundleRegistry } from '@taucad/agent-tools/registry';
import type { ComposedViewOverlay } from '@taucad/filesystem/composed-view';
import { systemSkillBundles } from '@taucad/skills/resources';

const registry = createSkillBundleRegistry(systemSkillBundles);

/**
 * The built-in skill overlay for this build.
 *
 * @returns The overlay `composeView` composes at `.agents/skills`.
 * @public
 */
export const systemSkillsOverlay = (): ComposedViewOverlay =>
  createSkillBundleOverlay(registry, async (resource, { signal }) => {
    const response = await fetch(resource.url, signal === undefined ? {} : { signal });
    if (!response.ok) {
      throw Object.assign(new Error(`Resource request failed with HTTP ${String(response.status)}.`), { code: 'EIO' });
    }
    return new Uint8Array(await response.arrayBuffer());
  });
