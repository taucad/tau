import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { contentDigest } from '@taucad/cache-core';
import type { CapabilitiesManifest, ExportRoute } from '@taucad/runtime';
import type {
  PublishedAssembly,
  PublishedPartRecord,
  PublishedPartExact,
  PublishedPartAsset,
} from '@taucad/runtime/types';
import type { FileExtension } from '@taucad/types';
import { createMockRuntimeDocument } from '@taucad/runtime-testing';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import {
  deriveAvailableFormats,
  bestRouteForActiveKernel,
  exportDocumentWithValidatedInput,
} from '#utils/export-formats.utils.js';

const fidelityRank = (fidelity: ExportRoute['fidelity']): number => (fidelity === 'brep' ? 0 : 1);

const directnessRank = (route: ExportRoute): number => (route.transcoderId === undefined ? 0 : 1);

function createRoute(format: FileExtension, overrides: Partial<ExportRoute> = {}): ExportRoute {
  return {
    targetFormat: format,
    kernelId: 'replicad',
    sourceFormat: format,
    fidelity: 'mesh',
    exportOptions: { schema: {}, defaults: {} },
    ...overrides,
  };
}

function createClient(routes: ExportRoute[]): AppRuntimeClient {
  const capabilities: CapabilitiesManifest = { routes, renderCapabilities: {}, registrations: [] };
  const client = mock<AppRuntimeClient>();
  Object.defineProperty(client, 'capabilities', { value: capabilities, configurable: true });
  vi.mocked(client.bestRouteFor).mockImplementation((format: string, options?: { kernelId?: string }) => {
    const candidates = routes
      .filter((route) => route.targetFormat === format)
      .filter((route) => (options?.kernelId ? route.kernelId === options.kernelId : true))
      .map((route, index) => ({ route, index }));

    candidates.sort((a, b) => {
      const fidelityDelta = fidelityRank(a.route.fidelity) - fidelityRank(b.route.fidelity);
      if (fidelityDelta !== 0) {
        return fidelityDelta;
      }
      const directnessDelta = directnessRank(a.route) - directnessRank(b.route);
      if (directnessDelta !== 0) {
        return directnessDelta;
      }
      return a.index - b.index;
    });

    return candidates[0]?.route;
  });
  return client;
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const displayAsset: PublishedPartAsset = {
  path: 'part.glb',
  digest: contentDigest({ value: `sha256:${'0'.repeat(64)}`, name: 'route display fixture' }),
  byteLength: 42,
};

function createPartRecord(exact?: PublishedPartExact): PublishedPartRecord {
  return {
    schemaVersion: 1,
    variants: {
      default: {
        source: { entry: 'part.ts', files: { 'part.ts': displayAsset.digest } },
        glb: displayAsset,
        ...(exact ? { exact } : {}),
      },
    },
  };
}

function createExact(providerVersion: string): PublishedPartExact {
  return {
    kernelId: 'replicad',
    provider: 'opencascade',
    providerVersion,
    codec: 'brep',
    codecVersion: '1',
    unit: 'millimeter',
    linearToleranceMm: 0,
    angularToleranceRad: 0,
    asset: { ...displayAsset, path: 'part.native' },
  };
}

describe('deriveAvailableFormats', () => {
  it('should select GLB conversion for mesh assemblies without borrowing an unrelated exact kernel', () => {
    const client = createClient([
      createRoute('glb', { exportOptions: { schema: { type: 'object' }, defaults: { stale: true } } }),
      createRoute('usdz', { sourceFormat: 'glb', transcoderId: 'assimp' }),
      createRoute('step', { fidelity: 'brep' }),
      createRoute('stl', { sourceFormat: 'stl' }),
    ]);
    const assembly: PublishedAssembly = {
      schemaVersion: 1,
      parts: { insert: createPartRecord() },
      occurrences: [{ id: 'insert', part: 'insert', variant: 'default', transform: identity }],
    };
    expect(deriveAvailableFormats(client, assembly)).toEqual([
      { format: 'glb', fidelity: 'mesh', direct: true },
      { format: 'usdz', fidelity: 'mesh', direct: false },
    ]);
    expect(bestRouteForActiveKernel(client, 'glb', assembly)?.exportOptions.defaults).toEqual({});
  });

  it('should reject incompatible providers while offering nested and flat descriptor-matched STEP routes', () => {
    const client = createClient([createRoute('step', { fidelity: 'brep', exportId: 'native-step' })]);
    const first = createExact('1');
    const second = createExact('2');
    const assembly: PublishedAssembly = {
      schemaVersion: 1,
      parts: {
        first: createPartRecord(first),
        second: createPartRecord(second),
      },
      occurrences: [
        {
          id: 'group',
          transform: identity,
          children: [
            { id: 'a', part: 'first', variant: 'default', transform: identity },
            { id: 'b', part: 'second', variant: 'default', transform: identity },
          ],
        },
      ],
    };
    expect(deriveAvailableFormats(client, assembly)).toEqual([]);
    const matching = { ...assembly, parts: { ...assembly.parts, second: assembly.parts['first']! } };
    expect(deriveAvailableFormats(client, matching)).toEqual([{ format: 'step', fidelity: 'brep', direct: true }]);
    const flat = {
      ...matching,
      occurrences: [
        { id: 'a', part: 'first', variant: 'default', transform: identity },
        { id: 'b', part: 'second', variant: 'default', transform: identity },
      ],
    };
    expect(deriveAvailableFormats(client, flat)).toEqual([{ format: 'step', fidelity: 'brep', direct: true }]);
  });

  it('keeps ordinary document export options and content separate from pinned export', async () => {
    const client = createClient([createRoute('glb')]);
    const { document } = createMockRuntimeDocument();
    const route = bestRouteForActiveKernel(client, 'glb', 'replicad');
    if (!route) {
      throw new Error('Expected GLB route.');
    }
    const options = { coordinateSystem: 'y-up' };
    const content = { includeEdges: true };
    await exportDocumentWithValidatedInput(document, route, { options });
    await exportDocumentWithValidatedInput(document, route, { content });
    await exportDocumentWithValidatedInput(document, route, { content, options });
    await exportDocumentWithValidatedInput(document, route, {});
    expect(vi.mocked(document.export).mock.calls).toStrictEqual([
      ['glb', { options }],
      ['glb', { content }],
      ['glb', { content, options }],
      ['glb', {}],
    ]);
  });
  // Pin ownership is qualified by the converter, exact-measurement and actual admission tests.
  it('should return no formats without a client or active kernel', () => {
    const client = createClient([createRoute('glb')]);

    expect(deriveAvailableFormats(undefined, 'replicad')).toEqual([]);
    expect(deriveAvailableFormats(client, undefined)).toEqual([]);
    expect(bestRouteForActiveKernel(client, 'glb', undefined)).toBeUndefined();
    expect(client.bestRouteFor).not.toHaveBeenCalled();
  });

  it('should only include routes for the active kernel', () => {
    const client = createClient([
      createRoute('glb', { kernelId: 'replicad' }),
      createRoute('stl', { kernelId: 'openrscad' }),
    ]);

    expect(deriveAvailableFormats(client, 'replicad')).toEqual([{ format: 'glb', fidelity: 'mesh', direct: true }]);
  });

  it('should derive directness and fidelity from the best route', () => {
    const client = createClient([
      createRoute('step', { fidelity: 'mesh' }),
      createRoute('step', { fidelity: 'brep', transcoderId: 'step-transcoder' }),
      createRoute('usdz', { transcoderId: 'usdz-transcoder' }),
      createRoute('usdz'),
    ]);

    expect(deriveAvailableFormats(client, 'replicad')).toEqual([
      { format: 'step', fidelity: 'brep', direct: false },
      { format: 'usdz', fidelity: 'mesh', direct: true },
    ]);
  });

  it('should sort formats by extension', () => {
    const client = createClient([createRoute('stl'), createRoute('glb'), createRoute('step')]);

    expect(deriveAvailableFormats(client, 'replicad').map((entry) => entry.format)).toEqual(['glb', 'step', 'stl']);
  });
});
