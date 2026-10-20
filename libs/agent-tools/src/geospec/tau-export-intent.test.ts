import { describe, expect, it, vi } from 'vitest';
import { geoSpecMeshEvidenceMatchers } from 'geospec/model';

import type { TauExporterClient } from '#geospec/tau-client-exporter.js';
import { resolveRuntimeExportIntent } from '#geospec/tau-export-intent.js';

function createRuntime(): TauExporterClient;
function createRuntime<Runtime extends Record<string, unknown>>(runtime: Runtime): TauExporterClient & Runtime;
function createRuntime(runtime?: Record<string, unknown>) {
  const client: TauExporterClient = {
    connect: vi.fn(async () => undefined),
    open: vi.fn<TauExporterClient['open']>(),
    terminate: vi.fn(),
  };
  return Object.assign(client, runtime);
}

describe('resolveRuntimeExportIntent', () => {
  it('should request canonical mesh options from route-aware runtimes', () => {
    const runtime = createRuntime({
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
    if ('success' in intent) {
      throw new Error('Expected a resolved export intent.');
    }
    expect(Object.values(intent.provenance.route ?? {})).not.toContain(undefined);
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

  it('should carry a linear-only tessellation through a route-unaware runtime', () => {
    const intent = resolveRuntimeExportIntent({
      runtime: createRuntime(),
      format: 'glb',
      meshLinearTolerance: 0.2,
    });

    expect(intent).toMatchObject({
      options: { tessellation: { linearTolerance: 0.2 } },
      provenance: { honored: { tessellation: { linearTolerance: 0.2 } } },
    });
  });

  it('should carry requested mesh tessellation into export options and provenance', () => {
    const runtime = createRuntime({
      bestRouteFor: vi.fn(() => ({
        kernelId: 'replicad',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        exportOptions: {
          schema: { properties: { coordinateSystem: {}, unit: {}, tessellation: {} } },
          defaults: {},
        },
      })),
    });

    const intent = resolveRuntimeExportIntent({
      runtime,
      format: 'glb',
      meshLinearTolerance: 0.1,
      meshAngularToleranceDegrees: 30,
    });

    expect(intent).toMatchObject({
      options: { tessellation: { linearTolerance: 0.1, angularTolerance: 30 } },
      provenance: {
        requested: { tessellation: { linearTolerance: 0.1, angularToleranceDegrees: 30 } },
        honored: { tessellation: { linearTolerance: 0.1, angularToleranceDegrees: 30 } },
      },
    });
  });

  it('should request canonical options from Tau-like runtimes before route metadata is available', () => {
    const runtime = createRuntime({
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

  it('should carry an angular-only tessellation before Tau route metadata is available', () => {
    const intent = resolveRuntimeExportIntent({
      runtime: createRuntime({ bestRouteFor: vi.fn(() => undefined), routesFor: vi.fn(() => []) }),
      format: 'glb',
      meshAngularToleranceDegrees: 12,
    });

    expect(intent).toMatchObject({
      options: { tessellation: { angularTolerance: 12 } },
      provenance: { honored: { tessellation: { angularToleranceDegrees: 12 } } },
    });
  });

  it('should report unsupported canonical mesh intent when a route lacks unit support', () => {
    const runtime = createRuntime({
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
      details: { meshAlternative: { format: 'glb', matchers: [...geoSpecMeshEvidenceMatchers] } },
    });
    expect(intent.diagnostics[0]?.suggestion).toContain("format: 'glb'");
    expect(intent.diagnostics[0]?.suggestion).not.toContain("format: 'step'");
  });

  describe('with the evaluating kernel', () => {
    const routes = [
      {
        kernelId: 'replicad',
        sourceFormat: 'step',
        targetFormat: 'step',
        fidelity: 'brep',
        exportOptions: { schema: { properties: { coordinateSystem: {} } }, defaults: {} },
      },
      {
        kernelId: 'picovoxel',
        sourceFormat: 'glb',
        targetFormat: 'glb',
        fidelity: 'mesh',
        exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } }, defaults: {} },
      },
    ];
    const routeAwareRuntime = () =>
      createRuntime({
        capabilities: { routes },
        bestRouteFor: vi.fn((format: string, request?: { kernelId?: string }) =>
          routes.find(
            (route) =>
              route.targetFormat === format && (request?.kernelId === undefined || route.kernelId === request.kernelId),
          ),
        ),
      });

    it('should report BRep matchers unsupported on a kernel without a STEP route and name the mesh alternative', () => {
      const runtime = routeAwareRuntime();

      const intent = resolveRuntimeExportIntent({ runtime, format: 'step', kernelId: 'picovoxel' });

      expect(runtime.bestRouteFor).toHaveBeenCalledWith('step', { kernelId: 'picovoxel' });
      if (!('success' in intent)) {
        throw new Error('Expected a kernel-aware refusal.');
      }
      expect(intent.diagnostics).toStrictEqual([
        expect.objectContaining({
          code: 'GEOSPEC_KERNEL_BREP_UNSUPPORTED',
          severity: 'error',
          details: {
            format: 'step',
            kernelId: 'picovoxel',
            meshAlternative: { format: 'glb', matchers: [...geoSpecMeshEvidenceMatchers] },
          },
        }),
      ]);
      expect(intent.diagnostics[0]?.message).toContain("Kernel 'picovoxel'");
      expect(intent.diagnostics[0]?.suggestion).not.toMatch(/format: 'step'|load the model as step/iu);
    });

    it('should keep the direct BRep route of a kernel that has one', () => {
      const intent = resolveRuntimeExportIntent({
        runtime: routeAwareRuntime(),
        format: 'step',
        kernelId: 'replicad',
      });

      expect(intent).toMatchObject({
        options: { coordinateSystem: 'z-up' },
        provenance: { route: { kernelId: 'replicad', direct: true } },
      });
    });
  });

  it('should pass z-up intent to direct STEP routes that expose coordinateSystem', () => {
    const runtime = createRuntime({
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

describe('runtime export intent from bare runtime shapes', () => {
  const routelessRuntime = {} as unknown as TauExporterClient;

  it('should request canonical mesh evidence from a route-unaware runtime', () => {
    const intent = resolveRuntimeExportIntent({ runtime: routelessRuntime, format: 'glb' });

    expect(intent).toStrictEqual({
      options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'glb', coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
        honored: {
          format: 'glb',
          coordinateSystem: 'z-up',
          unit: { length: 'millimeter' },
          sourceUnit: 'mm',
        },
      },
    });
  });

  it('should accept a direct BRep STEP route and record its provenance', () => {
    const runtime = {
      bestRouteFor: () => ({
        kernelId: 'replicad',
        sourceFormat: 'brep',
        targetFormat: 'step',
        fidelity: 'brep',
        exportOptions: { schema: { properties: { coordinateSystem: {} } } },
      }),
    } as unknown as TauExporterClient;

    const intent = resolveRuntimeExportIntent({ runtime, format: 'step' });

    expect(intent).toStrictEqual({
      options: { coordinateSystem: 'z-up' },
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'step' },
        honored: { format: 'step', sourceUnit: 'mm', coordinateSystem: 'z-up' },
        route: {
          kernelId: 'replicad',
          sourceFormat: 'brep',
          targetFormat: 'step',
          fidelity: 'brep',
          direct: true,
        },
      },
    });
  });

  it('should reject a transcoded STEP route', () => {
    const runtime = {
      bestRouteFor: () => ({ transcoderId: 'mesh-to-step', fidelity: 'mesh' }),
    } as unknown as TauExporterClient;

    const result = resolveRuntimeExportIntent({ runtime, format: 'step' });

    expect(result).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED' })],
    });
  });

  it('should accept a route-aware runtime that has no STEP route at all', () => {
    const runtime = { bestRouteFor: () => undefined } as unknown as TauExporterClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'stp' })).toStrictEqual({
      options: {},
      sourceUnit: 'mm',
      provenance: {
        requested: { format: 'stp' },
        honored: { format: 'stp', sourceUnit: 'mm' },
        route: undefined,
      },
    });
  });

  it('should fail a mesh route that cannot express the canonical request', () => {
    const runtime = {
      bestRouteFor: () => ({ exportOptions: { schema: { properties: {} } } }),
    } as unknown as TauExporterClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED' })],
    });
  });

  it('should fall back to a canonical request when a route-aware runtime advertises no routes', () => {
    const runtime = { bestRouteFor: () => undefined, capabilities: { routes: [] } } as unknown as TauExporterClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toMatchObject({ sourceUnit: 'mm' });
  });

  it('should report a missing route when the runtime advertises routes it cannot pick from', () => {
    const runtime = {
      bestRouteFor: () => undefined,
      capabilities: { routes: [{}] },
    } as unknown as TauExporterClient;
    const viaRoutesFor = {
      bestRouteFor: () => undefined,
      routesFor: () => [{}],
    } as unknown as TauExporterClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED' })],
    });
    expect(resolveRuntimeExportIntent({ runtime: viaRoutesFor, format: 'glb' })).toStrictEqual({
      success: false,
      diagnostics: [expect.objectContaining({ code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED' })],
    });
  });

  it('should honour a fully expressive mesh route', () => {
    const runtime = {
      bestRouteFor: () => ({
        kernelId: 'replicad',
        transcoderId: 'gltf',
        exportOptions: { schema: { properties: { coordinateSystem: {}, unit: {} } } },
      }),
    } as unknown as TauExporterClient;

    expect(resolveRuntimeExportIntent({ runtime, format: 'glb' })).toMatchObject({
      options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } },
      provenance: { route: { direct: false } },
    });
  });
});
