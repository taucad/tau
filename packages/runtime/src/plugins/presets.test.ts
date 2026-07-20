import { describe, it, expect } from 'vitest';
import { presets } from '#plugins/presets.js';

describe('presets.all', () => {
  it('should return all 6 kernel plugins with correct IDs', () => {
    const { kernels } = presets.all();

    expect(kernels).toHaveLength(6);

    const ids = kernels.map((k) => k.id);
    expect(ids).toEqual(['zoo', 'replicad', 'opencascade', 'manifold', 'jscad', 'tau']);
  });

  it('should return all 4 middleware plugins with correct IDs', () => {
    const { middleware } = presets.all();

    expect(middleware).toHaveLength(4);

    const ids = middleware.map((m) => m.id);
    expect(ids).toEqual(['parameterCache', 'geometryCache', 'gltfCoordinateTransform', 'gltfEdgeDetection']);
  });

  it('should return 1 bundler plugin with esbuild ID and default extensions', () => {
    const { bundlers } = presets.all();

    expect(bundlers).toEqual([
      expect.objectContaining({
        id: 'esbuild',
        extensions: ['ts', 'js', 'tsx', 'jsx'],
      }),
    ]);
  });

  it('should return 1 transcoder plugin with converter ID', () => {
    const { transcoders } = presets.all();

    expect(transcoders).toEqual([
      expect.objectContaining({
        id: 'converter',
      }),
    ]);
  });

  it('should keep implementation details off public plugin objects', () => {
    const { kernels, middleware, bundlers, transcoders } = presets.all();
    const moduleUrlProperty = ['module', 'Url'].join('');

    for (const plugin of [...kernels, ...middleware, ...bundlers, ...transcoders]) {
      expect(plugin).not.toHaveProperty(moduleUrlProperty);
      expect(plugin).not.toHaveProperty('createModule');
    }
  });

  it('should return fresh objects on each call', () => {
    const first = presets.all();
    const second = presets.all();

    expect(first.kernels).not.toBe(second.kernels);
    expect(first.middleware).not.toBe(second.middleware);
    expect(first.bundlers).not.toBe(second.bundlers);
    expect(first.transcoders).not.toBe(second.transcoders);
  });
});
