/**
 * The compiled system skills, loaded on first use rather than with the route (D4, LB4c).
 *
 * `#lib/skill-resolver.js` carries every package bundle's body through `#lib/system-skills-catalog.js`,
 * so the composer, the transcript and the RPC handlers reach it only through this module's dynamic
 * imports. Every resolver method is asynchronous already, so the import adds no state a caller sees:
 * the first call waits for it, and later calls share it. A failed import is not kept, so the next call
 * retries it.
 *
 * `critical-graph.node.test.ts` holds the edge: no route's open graph reaches the bodies statically.
 *
 * @module
 */

import type { SystemSkillBundle } from '@taucad/skills/resources';
import type { SkillResolver, SkillResolverDependencies } from '#lib/skill-resolver.js';

/**
 * A skill resolver whose system layer is imported by its first call.
 *
 * @param deps - Reader and directory lister for the active project.
 * @returns A resolver with the same contract as `createSkillResolver`.
 */
export function createLazySkillResolver(
  deps: Pick<SkillResolverDependencies, 'readFile' | 'listDirectory'>,
): SkillResolver {
  let pending: Promise<SkillResolver> | undefined;
  const importResolver = async (): Promise<SkillResolver> => {
    try {
      const { createSkillResolver } = await import('#lib/skill-resolver.js');
      return createSkillResolver(deps);
    } catch (error) {
      pending = undefined;
      throw error;
    }
  };
  const load = async (): Promise<SkillResolver> => {
    pending ??= importResolver();
    return pending;
  };

  return {
    async listSkills() {
      const resolver = await load();
      return resolver.listSkills();
    },
    async resolveSkill(skillName) {
      const resolver = await load();
      return resolver.resolveSkill(skillName);
    },
    async getPromptSkillListing() {
      const resolver = await load();
      return resolver.getPromptSkillListing();
    },
  };
}

let bundles: readonly SystemSkillBundle[] | undefined;
let pendingBundles: Promise<readonly SystemSkillBundle[]> | undefined;

/**
 * The shipped package bundles, once {@link loadSystemSkillBundles} has resolved.
 *
 * @returns The bundles, or `undefined` before the first load completes.
 */
export const loadedSystemSkillBundles = (): readonly SystemSkillBundle[] | undefined => bundles;

const importBundles = async (): Promise<readonly SystemSkillBundle[]> => {
  try {
    const { systemSkillBundles } = await import('@taucad/skills/resources');
    bundles = systemSkillBundles;
    return systemSkillBundles;
  } catch (error) {
    pendingBundles = undefined;
    throw error;
  }
};

/**
 * Import the shipped package bundles (the same chunk the resolver's system layer uses).
 *
 * @returns The bundles; a failed import is not kept, so the next call retries it.
 */
export async function loadSystemSkillBundles(): Promise<readonly SystemSkillBundle[]> {
  pendingBundles ??= importBundles();
  return pendingBundles;
}

async function notifyWhenLoaded(onLoaded: () => void, isSubscribed: () => boolean): Promise<void> {
  try {
    await loadSystemSkillBundles();
  } catch {
    // The reader keeps its no-bundle state; the next subscription retries the import.
    return;
  }
  if (isSubscribed()) {
    onLoaded();
  }
}

/**
 * A `useSyncExternalStore` subscription over the bundles: subscribing starts the import, and the
 * listener runs once it lands. A failed import notifies nothing, so readers keep the state they show
 * for a skill with no shipped bundle.
 *
 * @param onLoaded - Called once the bundles are readable through {@link loadedSystemSkillBundles}.
 * @returns The unsubscribe function.
 */
export function subscribeSystemSkillBundles(onLoaded: () => void): () => void {
  let isSubscribed = true;
  if (bundles === undefined) {
    // async-iife: bootstrap -- the subscriber's snapshot owns the result, and a failed import leaves it unchanged.
    void notifyWhenLoaded(onLoaded, () => isSubscribed);
  }
  return () => {
    isSubscribed = false;
  };
}
