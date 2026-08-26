import { describe, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- package metadata belongs to this published artifact.
import packageJson from '../package.json' with { type: 'json' };
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { plugin, openrscadNative } from '#index.js';

describe('@taucad/openrscad-native', () => {
  it('binds the package-named alias to the same factory', () => {
    expect(openrscadNative).toBe(plugin);
  });

  it('exports the named plugin', async () => {
    const { plugin: importedPlugin } = await import('#index.js');
    expect(importedPlugin).toBe(plugin);
    const { capabilities } = plugin();
    // Deliberately the same id as `@taucad/openrscad`: this is the same kernel
    // over a different build of the same engine, and a host recipe registers
    // one or the other. Two registered kernels sharing an id is a collision.
    expect(capabilities.kernels.map(({ id }) => id)).toEqual(['openrscad']);
    expect(capabilities.middleware.map(({ id }) => id)).toEqual([]);
    expect(capabilities.bundlers.map(({ id }) => id)).toEqual([]);
    expect(capabilities.transcoders.map(({ id }) => id)).toEqual([]);
  });

  it('declares itself a Node package, because it carries a native addon', () => {
    // The mirror image of the payload-isolation guard every `hostTarget:
    // browser` package carries: this package exists to name a `-native`
    // implementation, so it must never claim it is browser-safe.
    expect(packageJson.taucad.hostTarget).toBe('node');
    expect(Object.keys(packageJson.dependencies)).toContain('@taulabs/openrscad-engine-native');
  });
});
