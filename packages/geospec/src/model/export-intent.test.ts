import { describe, expect, it, vi } from 'vitest';
import { resolveRuntimeExportIntent } from '#model/export-intent.js';
import type { GeoSpecRuntimeClient } from '#model/types.js';

const createRuntime = <Runtime extends Record<string, unknown> = Record<string, never>>(
  runtime?: Runtime,
): GeoSpecRuntimeClient & Runtime =>
  ({
    export: vi.fn(),
    ...runtime,
  }) as unknown as GeoSpecRuntimeClient & Runtime;

describe('resolveRuntimeExportIntent', () => {
  it('should request canonical mesh options from route-aware runtimes', () => {
    const runtime = createRuntime({
      export: vi.fn(),
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        exportOptions: {
          schema: { properties: { coordinateSystem: {}, unit: {} } },
          defaults: {},
        },
      })),
    });

    const intent = resolveRuntimeExportIntent({ runtime, format: 'glb' });

    expect(intent).toEqual({
      options: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      },
      sourceUnit: 'mm',
      provenance: {
        requested: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        },
        honored: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
          sourceUnit: 'mm',
        },
        route: {
          kernelId: 'replicad',
          sourceFormat: 'glb',
          targetFormat: 'glb',
          fidelity: 'mesh',
          direct: true,
        },
      },
    });
    expect(runtime.bestRouteFor).toHaveBeenCalledWith('glb');
  });

  it('should treat custom runtimes without route metadata as canonical millimeter runtimes', () => {
    const runtime = createRuntime();

    const intent = resolveRuntimeExportIntent({ runtime, format: 'glb' });

    expect(intent).toEqual({
      options: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      },
      sourceUnit: 'mm',
      provenance: {
        requested: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        },
        honored: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
          sourceUnit: 'mm',
        },
      },
    });
  });

  it('should request canonical options from Tau-like runtimes before route metadata is available', () => {
    const runtime = createRuntime({
      export: vi.fn(),
      bestRouteFor: vi.fn(() => undefined),
      routesFor: vi.fn(() => []),
    });

    const intent = resolveRuntimeExportIntent({ runtime, format: 'glb' });

    expect(intent).toEqual({
      options: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      },
      sourceUnit: 'mm',
      provenance: {
        requested: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
        },
        honored: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
          sourceUnit: 'mm',
        },
      },
    });
  });

  it('should report unsupported canonical mesh intent when a route lacks unit support', () => {
    const runtime = createRuntime({
      export: vi.fn(),
      bestRouteFor: vi.fn(() => ({
        kernelId: 'legacy',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        exportOptions: {
          schema: { properties: { coordinateSystem: {} } },
          defaults: {},
        },
      })),
    });

    const intent = resolveRuntimeExportIntent({ runtime, format: 'glb' });

    expect(intent).toMatchObject({ success: false });
    if (!('success' in intent)) {
      throw new Error('Expected unsupported export intent failure.');
    }
    expect(intent.diagnostics[0]).toMatchObject({
      code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED',
      severity: 'error',
      details: {
        format: 'glb',
        missing: ['unit'],
      },
    });
  });

  it('should reject mesh-fidelity STEP transcodes for exact evidence', () => {
    const runtime = createRuntime({
      export: vi.fn(),
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'step',
        transcoderId: 'converter',
        fidelity: 'mesh',
        exportOptions: { schema: { properties: {} }, defaults: {} },
      })),
    });

    const intent = resolveRuntimeExportIntent({ runtime, format: 'step' });

    expect(intent).toMatchObject({ success: false });
    if (!('success' in intent)) {
      throw new Error('Expected direct STEP route failure.');
    }
    expect(intent.diagnostics[0]).toMatchObject({
      code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED',
      severity: 'error',
      suggestion:
        'Request a runtime export route that preserves exact STEP/BRep evidence, or load mesh evidence with GLB/glTF when exact BRep assertions are not required.',
    });
  });

  it('should pass z-up intent to direct STEP routes that expose coordinateSystem', () => {
    const runtime = createRuntime({
      export: vi.fn(),
      bestRouteFor: vi.fn(() => ({
        kernelId: 'opencascade',
        sourceFormat: 'step',
        targetFormat: 'step',
        fidelity: 'brep',
        exportOptions: {
          schema: { properties: { coordinateSystem: {} } },
          defaults: {},
        },
      })),
    });

    const intent = resolveRuntimeExportIntent({ runtime, format: 'step' });

    expect(intent).toEqual({
      options: { coordinateSystem: 'z-up' },
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'step' },
        honored: {
          format: 'step',
          coordinateSystem: 'z-up',
          sourceUnit: 'mm',
        },
        route: {
          kernelId: 'opencascade',
          sourceFormat: 'step',
          targetFormat: 'step',
          fidelity: 'brep',
          direct: true,
        },
      },
    });
  });
});
