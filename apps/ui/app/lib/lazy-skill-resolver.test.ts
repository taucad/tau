import { describe, expect, it, vi } from 'vitest';
import { systemSkillBundles } from '@taucad/skills/resources';
import { createSkillResolver } from '#lib/skill-resolver.js';
import { createLazySkillResolver } from '#lib/lazy-skill-resolver.js';
import type * as lazySkills from '#lib/lazy-skill-resolver.js';

const emptyProject = {
  readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
    throw new Error(`Missing file: ${path}`);
  },
  listDirectory: async () => [],
};

describe('createLazySkillResolver', () => {
  it('should answer every resolver call as the eager resolver does', async () => {
    const lazy = createLazySkillResolver(emptyProject);
    const eager = createSkillResolver(emptyProject);

    expect(await lazy.listSkills()).toEqual(await eager.listSkills());
    expect(await lazy.getPromptSkillListing()).toEqual(await eager.getPromptSkillListing());
    expect(await lazy.resolveSkill('create-skill')).toEqual(await eager.resolveSkill('create-skill'));
  });
});

describe('system skill bundles on demand', () => {
  // The bundles are module state, so each case starts from a fresh module.
  const freshModule = async (): Promise<typeof lazySkills> => {
    vi.resetModules();
    return import('#lib/lazy-skill-resolver.js');
  };

  it('should notify a subscriber once the bundles are readable', async () => {
    const fresh = await freshModule();
    const onLoaded = vi.fn<() => void>();
    const unsubscribe = fresh.subscribeSystemSkillBundles(onLoaded);
    expect(fresh.loadedSystemSkillBundles()).toBeUndefined();

    await vi.waitFor(() => {
      expect(onLoaded).toHaveBeenCalledOnce();
    });
    expect(fresh.loadedSystemSkillBundles()).toEqual(systemSkillBundles);
    unsubscribe();
  });

  it('should not notify a subscriber that left before the bundles landed', async () => {
    const fresh = await freshModule();
    const onLoaded = vi.fn<() => void>();
    fresh.subscribeSystemSkillBundles(onLoaded)();

    await fresh.loadSystemSkillBundles();
    expect(onLoaded).not.toHaveBeenCalled();
    expect(fresh.loadedSystemSkillBundles()).toEqual(systemSkillBundles);
  });
});
