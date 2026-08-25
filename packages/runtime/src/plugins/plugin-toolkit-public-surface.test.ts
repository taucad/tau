import { describe, expect, it } from 'vitest';

describe('plugin toolkit public surface', () => {
  it('exports definePlugin from the root and plugin subpath without defaults', async () => {
    const [root, plugin] = await Promise.all([import('#index.js'), import('#plugins/plugin-entry.js')]);

    expect(root.definePlugin).toBeTypeOf('function');
    expect(plugin.definePlugin).toBe(root.definePlugin);
    expect(plugin.isPluginInstance).toBeTypeOf('function');
    expect(plugin.runtimePluginAbiVersionOf).toBeTypeOf('function');
    expect(plugin.runtimePluginAbiVersion).toBe(1);
    expect(Object.hasOwn(plugin, 'deriveKernelExtensions')).toBe(false);
    expect(Object.hasOwn(plugin, 'default')).toBe(false);
  });
});
