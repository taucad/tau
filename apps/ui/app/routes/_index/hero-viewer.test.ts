import { describe, it, expect } from 'vitest';
import type { CapabilitiesManifest } from '@taucad/runtime';
import { deriveExportFormatOptions } from '#routes/_index/hero-viewer.utils.js';

describe('deriveExportFormatOptions', () => {
  it('should return empty list when capabilities are unavailable', () => {
    expect(deriveExportFormatOptions(undefined)).toEqual([]);
  });

  it('should return one option per unique target format', () => {
    const capabilities: CapabilitiesManifest = {
      routes: [
        {
          targetFormat: 'glb',
          kernelId: 'openrscad',
          sourceFormat: 'glb',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
        {
          targetFormat: 'stl',
          kernelId: 'openrscad',
          sourceFormat: 'stl',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
      ],
      renderSchemas: {},
    };

    expect(deriveExportFormatOptions(capabilities)).toEqual([
      { format: 'glb', label: 'GLB' },
      { format: 'stl', label: 'STL' },
    ]);
  });

  it('should deduplicate routes that share a target format (first-occurrence wins)', () => {
    const capabilities: CapabilitiesManifest = {
      routes: [
        {
          targetFormat: 'usdz',
          kernelId: 'openrscad',
          sourceFormat: 'glb',
          transcoderId: 'converter',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
        {
          targetFormat: 'usdz',
          kernelId: 'replicad',
          sourceFormat: 'glb',
          transcoderId: 'converter',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
      ],
      renderSchemas: {},
    };

    expect(deriveExportFormatOptions(capabilities)).toEqual([{ format: 'usdz', label: 'USDZ' }]);
  });

  it('should preserve manifest route order when emitting options', () => {
    const capabilities: CapabilitiesManifest = {
      routes: [
        {
          targetFormat: 'stl',
          kernelId: 'openrscad',
          sourceFormat: 'stl',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
        {
          targetFormat: 'glb',
          kernelId: 'openrscad',
          sourceFormat: 'glb',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
        {
          targetFormat: '3mf',
          kernelId: 'openrscad',
          sourceFormat: 'glb',
          transcoderId: 'converter',
          fidelity: 'mesh',
          schema: {},
          defaults: {},
        },
      ],
      renderSchemas: {},
    };

    expect(deriveExportFormatOptions(capabilities).map((o) => o.format)).toEqual(['stl', 'glb', '3mf']);
  });
});
