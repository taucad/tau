import { describe, it, expect } from 'vitest';
import { presets } from '#plugins/presets.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { KernelDefinition, KernelExportFormats } from '#types/runtime-kernel.types.js';
import type { TranscoderDefinition } from '#types/runtime-transcoder.types.js';

describe('presets.all', () => {
  it('should return all 6 kernel plugins with correct IDs', () => {
    const { kernels } = presets.all();

    expect(kernels).toHaveLength(6);

    const ids = kernels.map((k) => k.id);
    expect(ids).toEqual(['zoo', 'replicad', 'opencascade', 'manifold', 'jscad', 'tau']);
  });

  it('should return all 5 middleware plugins with correct IDs', () => {
    const { middleware } = presets.all();

    expect(middleware).toHaveLength(5);

    const ids = middleware.map((m) => m.id);
    expect(ids).toEqual([
      'parameterFileResolver',
      'parameterCache',
      'geometryCache',
      'gltfCoordinateTransform',
      'gltfEdgeDetection',
    ]);
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

  it('should return the converter and image transcoder plugins', () => {
    const { transcoders } = presets.all();

    expect(transcoders).toEqual([
      expect.objectContaining({ id: 'converter' }),
      expect.objectContaining({ id: 'image' }),
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

  it('exposes only positive first-party content and no native scope declarations', async () => {
    const { kernels, transcoders } = presets.all();
    const definitions = new Map(
      await Promise.all(
        kernels.map(
          async (plugin) =>
            [plugin.id, await resolveRuntimePluginDefinition<KernelDefinition>('kernel', plugin)] as const,
        ),
      ),
    );

    expect(definitions.get('manifold')?.render).toBeUndefined();
    expect(definitions.get('tau')?.render).toBeUndefined();
    const opencascadeRender = definitions.get('opencascade')?.render;
    expect(opencascadeRender?.optionsSchema).toBeDefined();
    expect(Object.keys(opencascadeRender ?? {})).toEqual(['optionsSchema']);
    expect(definitions.get('jscad')?.render?.content).toEqual(['includeEdges']);
    expect(definitions.get('replicad')?.render?.content).toEqual(['includeEdges', 'includeTopology']);
    expect(definitions.get('zoo')?.render?.content).toEqual(['includeTopology']);

    const expectedExportContent: Record<string, Record<string, readonly string[]>> = {
      jscad: { glb: ['includeEdges'] },
      replicad: { glb: ['includeEdges', 'includeTopology'], gltf: ['includeEdges', 'includeTopology'] },
      zoo: { glb: ['includeTopology'], gltf: ['includeTopology'] },
    };
    for (const [id, definition] of definitions) {
      expect(Object.hasOwn(definition, 'nativeHandleScope')).toBe(false);
      expect(definition.createOptionsSchema).toBeUndefined();
      for (const [format, formatDefinition] of Object.entries(definition.exportFormats as KernelExportFormats)) {
        const expected = expectedExportContent[id]?.[format];
        if (expected) {
          expect(formatDefinition.content).toEqual(expected);
        } else {
          expect(Object.hasOwn(formatDefinition, 'content')).toBe(false);
        }
      }
    }

    const converter = transcoders.find(({ id }) => id === 'converter');
    expect(converter).toBeDefined();
    const converterDefinition = await resolveRuntimePluginDefinition<TranscoderDefinition>('transcoder', converter!);
    for (const edge of converterDefinition.edges) {
      expect(Object.hasOwn(edge, 'content')).toBe(false);
    }
  });
});
