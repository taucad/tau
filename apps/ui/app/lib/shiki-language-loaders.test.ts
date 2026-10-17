import { describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => vi.fn());
vi.mock('@taucad/grammars/openscad', () => {
  loaded('openscad');
  return { default: [] };
});
vi.mock('@shikijs/langs-precompiled/typescript', () => {
  loaded('typescript');
  return { default: [] };
});

describe('runtimeShikiLanguageLoaders (B-16, D-UI-09)', () => {
  it('loads no grammar when the module is evaluated, only when the highlighter asks', async () => {
    const { runtimeShikiLanguageLoaders } = await import('#lib/shiki-language-loaders.js');
    await Promise.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(loaded).not.toHaveBeenCalled();
    expect(runtimeShikiLanguageLoaders.every((loader) => typeof loader === 'function')).toBe(true);
  });
});
