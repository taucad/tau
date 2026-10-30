import { describe, expect, it, vi } from 'vitest';
import { assimpCapabilities } from 'libassimp/capabilities';
import type { DescribedOptionDescriptor } from 'libassimp/capabilities';
import { toJSONSchema } from 'zod';
import { assimpEdgeSchemas, tauSetExportOptions } from '#assimp-export-options.js';

const shownKeys = (format: keyof typeof assimpEdgeSchemas): string[] =>
  Object.keys(
    (toJSONSchema(assimpEdgeSchemas[format], { io: 'input' }) as { properties?: Record<string, unknown> }).properties ??
      {},
  );

describe('assimp export option schemas', () => {
  it('covers every canonical target from the generated registry', () => {
    expect(Object.keys(assimpEdgeSchemas)).toEqual(Object.keys(assimpCapabilities.export));
  });

  it('shows only the export choices a CAD export dialog offers', () => {
    expect(
      Object.fromEntries(
        Object.keys(assimpEdgeSchemas).map((format) => [format, shownKeys(format as keyof typeof assimpEdgeSchemas)]),
      ),
    ).toEqual({
      '3mf': ['unit', 'requireManifold'],
      assjson: [],
      dae: [],
      fbx: ['binary'],
      glb: [],
      gltf: [],
      // eslint-disable-next-line id-denylist -- OBJ file format identifier
      obj: ['materials'],
      ply: ['binary'],
      step: [],
      stl: ['binary'],
      usda: [],
      usdc: [],
      usdz: [],
    });
  });

  it('applies tau form defaults over libassimp defaults', () => {
    expect(assimpEdgeSchemas.stl.parse({})).toEqual({ binary: true });
    expect(assimpEdgeSchemas.ply.parse({})).toEqual({ binary: false });
    expect(assimpEdgeSchemas.fbx.parse({})).toEqual({ binary: true });
    expect(assimpEdgeSchemas.obj.parse({})).toEqual({ materials: true });
    expect(assimpEdgeSchemas['3mf'].parse({})).toEqual({ unit: 'millimeter', requireManifold: true });
    expect(assimpEdgeSchemas.glb.parse({})).toEqual({});
  });

  it('keeps libassimp descriptions as help text', () => {
    const { properties } = toJSONSchema(assimpEdgeSchemas['3mf'], { io: 'input' }) as {
      properties: Record<string, { description?: string }>;
    };
    expect(properties['unit']?.description).toBe(assimpCapabilities.export['3mf'].exportOptions.unit.description);
  });

  it('rejects hidden, unknown and invalid options', () => {
    expect(assimpEdgeSchemas.stl.parse({ binary: false })).toEqual({ binary: false });
    expect(assimpEdgeSchemas['3mf'].parse({ unit: 'inch', requireManifold: false })).toEqual({
      unit: 'inch',
      requireManifold: false,
    });
    expect(assimpEdgeSchemas['3mf'].safeParse({ unit: 'parsec' }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ upAxis: 'y' }).success).toBe(false);
    expect(assimpEdgeSchemas['3mf'].safeParse({ decimalPrecision: 12 }).success).toBe(false);
    expect(assimpEdgeSchemas.glb.safeParse({ pointClouds: true }).success).toBe(false);
    expect(assimpEdgeSchemas.glb.safeParse({ binary: true }).success).toBe(false);
  });

  it('sets the 3MF application name itself', () => {
    expect(tauSetExportOptions).toEqual({ '3mf': { application: 'Tau' } });
  });

  it.each([
    [
      'treat an optional boolean as optional',
      {
        unit: { kind: 'string', default: 'meter', values: ['meter'] },
        requireManifold: { kind: 'boolean', default: null },
      },
      undefined,
    ],
    [
      'refuse a shown option libassimp no longer offers',
      { unit: { kind: 'string', default: 'meter', values: ['meter'] } },
      /no longer offers the 3mf export option requireManifold/u,
    ],
    [
      'refuse a shown option that is not a toggle or a choice',
      { unit: { kind: 'string', default: 'meter' }, requireManifold: { kind: 'boolean', default: true } },
      /unit is a string/u,
    ],
  ] as const)('should %s', async (_name, options, error) => {
    const exportOptions = Object.fromEntries(
      Object.entries(options).map(([name, descriptor]) => [name, { ...descriptor, description: name }]),
    ) as Record<string, DescribedOptionDescriptor>;
    vi.resetModules();
    vi.doMock('libassimp/capabilities', () => ({ assimpCapabilities: { export: { '3mf': { exportOptions } } } }));

    try {
      const load = import('#assimp-export-options.js');
      if (error === undefined) {
        const { assimpEdgeSchemas: isolated } = await load;
        expect(isolated['3mf'].parse({})).toEqual({ unit: 'meter' });
        expect(isolated['3mf'].parse({ requireManifold: true })).toEqual({ unit: 'meter', requireManifold: true });
      } else {
        await expect(load).rejects.toThrow(error);
      }
    } finally {
      vi.doUnmock('libassimp/capabilities');
      vi.resetModules();
    }
  });
});
