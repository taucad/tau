import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { CapabilitiesManifest, ExportRoute } from '@taucad/runtime';
import type { FileExtension } from '@taucad/types';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';
import { deriveAvailableFormats } from '#utils/export-formats.utils.js';

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
  vi.mocked(client.bestRouteFor).mockImplementation((format: FileExtension, options?: { kernelId?: string }) => {
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

describe('deriveAvailableFormats', () => {
  it('should return no formats without a client or active kernel', () => {
    const client = createClient([createRoute('glb')]);

    expect(deriveAvailableFormats(undefined, 'replicad')).toEqual([]);
    expect(deriveAvailableFormats(client, undefined)).toEqual([]);
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
