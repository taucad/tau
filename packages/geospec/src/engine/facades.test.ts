import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { JSONValue } from '@taucad/runtime/types';
import type { VmFileSystem } from '@taucad/esbuild/vm';
import { analyzeBrep } from '#brep/analyze-brep.js';
import {
  geoSpecClaimDiagnostics,
  geoSpecClaimJson,
  geoSpecProtocolViolation,
  geoSpecSubjectId,
  isGeoSpecJsonRecord,
  submitGeoSpecClaim,
} from '#engine/client.js';
import { decodeGeoSpecCanonicalJson, geoSpecEngineProtocolVersion } from '#engine/protocol.js';
import type { GeoSpecClaimResult, GeoSpecSubmitClaimsResult } from '#engine/protocol.js';
import { createTestGeoSpecEngineProtocol } from '#engine/protocol.test-support.js';
import { clearGeoSpecEngine, registerGeoSpecEngine } from '#engine/seam.js';
import type { GeoSpecEngineHostBindings } from '#engine/seam.js';
import { inspectGeometry } from '#inspection/inspect.js';
import { analyzeMesh, loadMesh } from '#mesh/load-mesh.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import type { GeometryStats, GeometrySubject } from '#mesh/types.js';
import { createModelLoader, loadModel } from '#model/load-model.js';
import { createCollector } from '#runner/collector.js';
import { createGeoSpecNodePoolRunner } from '#runner/node/node-pool-runner.js';
import { createGeoSpecNodeRunner } from '#runner/node/node-runner.js';
import type { GeoSpecNodeRunnerOptions } from '#runner/node/node-runner.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { createGeoSpecWebPoolRunner } from '#runner/web/web-pool-runner.js';
import type { GeoSpecWebPoolRunnerOptions } from '#runner/web/web-pool-runner.js';
import { createGeoSpecWebRunner } from '#runner/web/web-runner.js';
import type { GeoSpecWebRunnerOptions } from '#runner/web/web-runner.js';
import { startGeoSpecPoolWorkerHost } from '#runner/worker/pool-worker-host.js';
import type { GeoSpecPoolWorkerHostOptions } from '#runner/worker/pool-worker-host.js';
import type { GeoSpecRunner } from '#runner/worker/runner-types.js';
import { createStepLoader, loadStep, parseXdeReadResultJson } from '#step/load-step.js';

const subject = mock<GeometrySubject>({ subjectId: 'subject-1' });

class NonPlainFacadeValue {
  public get value(): number {
    return 1;
  }
}

const claimId = (bytes: Uint8Array<ArrayBuffer>): string => {
  const claim = decodeGeoSpecCanonicalJson(bytes) as { claimId: string };
  return claim.claimId;
};

const registerResult = (
  result: Omit<GeoSpecClaimResult, 'claimId' | 'provenance'>,
  options: { asynchronous?: boolean; host?: Partial<GeoSpecEngineHostBindings> } = {},
): void => {
  const submit = (
    request: Parameters<ReturnType<typeof createTestGeoSpecEngineProtocol>['submitClaims']>[0],
  ): GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult> => {
    const response: GeoSpecSubmitClaimsResult = {
      requestId: request.requestId,
      results: [{ claimId: claimId(request.claims[0]!), provenance: {}, ...result }],
    };
    return options.asynchronous ? Promise.resolve(response) : response;
  };
  registerGeoSpecEngine({
    protocolVersion: geoSpecEngineProtocolVersion,
    engine: 'facade-test',
    version: '1.0.0',
    protocol: createTestGeoSpecEngineProtocol({ submitClaims: submit }),
    host: options.host,
  });
};

afterEach(() => {
  clearGeoSpecEngine();
});

describe('Contract-B client helpers', () => {
  it('submits synchronous and asynchronous claims and rejects an empty result batch', async () => {
    registerResult({ status: 'passed', diagnostics: [] });
    expect(submitGeoSpecClaim({ capability: 'inspectGeometry' })).toMatchObject({ status: 'passed' });

    clearGeoSpecEngine();
    registerResult({ status: 'passed', diagnostics: [] }, { asynchronous: true });
    await expect(submitGeoSpecClaim({ capability: 'inspectGeometry' })).resolves.toMatchObject({ status: 'passed' });

    clearGeoSpecEngine();
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'empty',
      version: '1.0.0',
      protocol: createTestGeoSpecEngineProtocol({
        submitClaims: (request): GeoSpecSubmitClaimsResult => ({ requestId: request.requestId, results: [] }),
      }),
    });
    expect(() => {
      void submitGeoSpecClaim({ capability: 'inspectGeometry' });
    }).toThrow('returned no result');
  });

  it('validates subject references, JSON records, and facade payloads', () => {
    expect(submitGeoSpecClaim({ capability: 'none' })).toBeUndefined();
    expect(geoSpecSubjectId(subject)).toBe('subject-1');
    expect(() => geoSpecSubjectId(null)).toThrow('Expected an ingested');
    expect(() => geoSpecSubjectId({ subjectId: 1 })).toThrow('Expected an ingested');
    expect(geoSpecClaimJson({ pattern: /bolt/giu })).toStrictEqual({
      pattern: { type: 'regexp', pattern: 'bolt', flags: 'giu' },
    });
    expect(geoSpecClaimJson(undefined)).toBeNull();
    expect(() => geoSpecClaimJson(Number.POSITIVE_INFINITY)).toThrow('non-finite');
    expect(() => geoSpecClaimJson(new NonPlainFacadeValue())).toThrow('class instances');
    expect(isGeoSpecJsonRecord({ ok: true })).toBe(true);
    expect(isGeoSpecJsonRecord(null)).toBe(false);
    expect(isGeoSpecJsonRecord(undefined)).toBe(false);
    expect(isGeoSpecJsonRecord([])).toBe(false);
    expect(isGeoSpecJsonRecord('x')).toBe(false);
    expect(geoSpecProtocolViolation('bad').code).toBe('GEOSPEC_ENGINE_CONTRACT_VIOLATION');
  });

  it('decodes complete diagnostics and rejects malformed diagnostics', () => {
    const result: GeoSpecClaimResult = {
      claimId: 'claim',
      status: 'failed',
      diagnostics: [
        {
          code: 'D',
          severity: 'warning',
          message: 'message',
          suggestion: 'fix it',
          spatial: { min: [0, 1, 2], max: [3, 4, 5], center: [1, 2, 3] },
          details: { fact: true },
        },
      ],
      provenance: {},
    };
    expect(geoSpecClaimDiagnostics(result)).toStrictEqual(result.diagnostics);

    const malformedDiagnostics: JSONValue[] = [null, { code: 1 }, { code: 'D', severity: 'fatal', message: 'x' }];
    for (const malformed of malformedDiagnostics) {
      expect(geoSpecClaimDiagnostics({ ...result, diagnostics: [malformed] })).toMatchObject([
        { code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION' },
      ]);
    }
    expect(
      geoSpecClaimDiagnostics({
        ...result,
        diagnostics: [{ code: 'D', severity: 'info', message: 'minimal', spatial: { min: [0, 1] } }],
      }),
    ).toStrictEqual([{ code: 'D', severity: 'info', message: 'minimal', spatial: {} }]);
  });
});

describe('protocol-backed evidence facades', () => {
  it('reports engine-unavailable results without registration', async () => {
    expect(analyzeBrep({ subject }).success).toBe(false);
    expect(inspectGeometry({ subject, selectors: [] }).diagnostics[0]?.code).toBe('GEOSPEC_ENGINE_UNAVAILABLE');
    const overlap = await analyzeMeshOverlap({ subject });
    const loaded = await loadMesh({ source: new Uint8Array(), format: 'glb' });
    const analyzed = await analyzeMesh({ source: new Uint8Array(), format: 'glb' });
    expect(overlap.success).toBe(false);
    expect(loaded.success).toBe(false);
    expect(analyzed.success).toBe(false);
    await expect(loadModel({ source: new Uint8Array(), format: 'glb' })).rejects.toMatchObject({
      diagnostics: [{ code: 'GEOSPEC_ENGINE_UNAVAILABLE' }],
    });
  });

  it('returns successful BRep, inspection, and overlap evidence', async () => {
    registerResult({
      status: 'passed',
      diagnostics: [],
      evidence: { success: true, brep: { valid: true } },
    });
    expect(analyzeBrep({ subject })).toMatchObject({ success: true, brep: { valid: true } });

    clearGeoSpecEngine();
    registerResult({ status: 'passed', diagnostics: [], evidence: { selections: [{ matches: [] }] } });
    expect(inspectGeometry({ subject, selectors: ['body'] }).selections).toHaveLength(1);

    clearGeoSpecEngine();
    registerResult({ status: 'passed', diagnostics: [], evidence: { success: true, evidence: { overlaps: [] } } });
    expect(await analyzeMeshOverlap({ subject, tolerance: 0.1 })).toMatchObject({
      success: true,
      evidence: { overlaps: [] },
    });
  });

  it('preserves engine-declared failures', async () => {
    const failure: Omit<GeoSpecClaimResult, 'claimId' | 'provenance'> = {
      status: 'failed',
      diagnostics: [{ code: 'FAIL', severity: 'error', message: 'failed' }],
      evidence: { success: false },
    };
    registerResult(failure);
    expect(analyzeBrep({ subject })).toMatchObject({ success: false, diagnostics: [{ code: 'FAIL' }] });

    clearGeoSpecEngine();
    registerResult(failure);
    expect(await analyzeMeshOverlap({ subject })).toMatchObject({ success: false, diagnostics: [{ code: 'FAIL' }] });
  });

  it('rejects malformed and incomplete facade evidence', async () => {
    registerResult({ status: 'passed', diagnostics: [], evidence: null });
    expect(analyzeBrep({ subject }).success).toBe(false);
    expect(inspectGeometry({ subject, selectors: [] }).selections).toStrictEqual([]);

    clearGeoSpecEngine();
    registerResult({ status: 'passed', diagnostics: [], evidence: { success: true } });
    expect(analyzeBrep({ subject }).success).toBe(false);
    const incompleteOverlap = await analyzeMeshOverlap({ subject });
    expect(incompleteOverlap.success).toBe(false);

    clearGeoSpecEngine();
    registerResult({ status: 'passed', diagnostics: [], evidence: null });
    const malformedOverlap = await analyzeMeshOverlap({ subject });
    expect(malformedOverlap.success).toBe(false);
  });

  it('rejects invalid subjects and asynchronous synchronous-facade responses', async () => {
    registerResult({ status: 'passed', diagnostics: [], evidence: { success: true } });
    const invalidSubject = mock<GeometrySubject>();
    expect(analyzeBrep({ subject: invalidSubject }).success).toBe(false);
    expect(inspectGeometry({ subject: invalidSubject, selectors: [] }).selections).toStrictEqual([]);
    const invalidOverlap = await analyzeMeshOverlap({ subject: invalidSubject });
    expect(invalidOverlap.success).toBe(false);

    clearGeoSpecEngine();
    registerResult({ status: 'passed', diagnostics: [], evidence: { success: true } }, { asynchronous: true });
    expect(analyzeBrep({ subject }).success).toBe(false);
    expect(inspectGeometry({ subject, selectors: [] }).selections).toStrictEqual([]);
  });

  it('stringifies non-Error protocol failures at synchronous facade boundaries', async () => {
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'throwing',
      version: '1.0.0',
      protocol: createTestGeoSpecEngineProtocol({
        submitClaims: () => {
          // oxlint-disable-next-line typescript/only-throw-error -- Exercise hostile non-Error protocol throws.
          throw 'opaque failure';
        },
      }),
    });

    expect(analyzeBrep({ subject }).diagnostics[0]?.message).toBe('opaque failure');
    expect(inspectGeometry({ subject, selectors: [] }).diagnostics[0]?.message).toBe('opaque failure');
    const overlap = await analyzeMeshOverlap({ subject });
    expect(overlap.diagnostics[0]?.message).toBe('opaque failure');
  });
});

describe('collector protocol failure projection', () => {
  const run = async (subjectValue: unknown = subject) => {
    const collector = createCollector();
    collector.it('contract result', () => {
      collector.expectGeo(subjectValue).toBeWatertight();
    });
    await collector.waitForCompletion(1000);
    return collector.tests[0]!.assertions[0]!.diagnostics;
  };

  it('reports unsupported subjects and absent engines', async () => {
    registerResult({ status: 'passed', diagnostics: [] });
    expect(await run(1)).toMatchObject([{ code: 'GEOSPEC_SUBJECT_UNSUPPORTED' }]);
    clearGeoSpecEngine();
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_ENGINE_UNAVAILABLE' }]);
  });

  it('synthesizes diagnostics for empty, failed, and cancelled claim results', async () => {
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'empty',
      version: '1.0.0',
      protocol: createTestGeoSpecEngineProtocol({
        submitClaims: (request) => ({ requestId: request.requestId, results: [] }),
      }),
    });
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION' }]);

    clearGeoSpecEngine();
    registerResult({ status: 'failed', diagnostics: [] });
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION' }]);

    clearGeoSpecEngine();
    registerResult({ status: 'cancelled', diagnostics: [] });
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_CLAIM_CANCELLED' }]);
  });

  it('converts malformed and thrown engine diagnostics into contract violations', async () => {
    registerResult({ status: 'failed', diagnostics: [null] });
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION' }]);

    clearGeoSpecEngine();
    registerResult({ status: 'failed', diagnostics: [{}] });
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION' }]);

    clearGeoSpecEngine();
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'throwing',
      version: '1.0.0',
      protocol: createTestGeoSpecEngineProtocol({
        submitClaims: () => {
          // oxlint-disable-next-line typescript/only-throw-error -- Exercise hostile non-Error protocol throws.
          throw 'opaque failure';
        },
      }),
    });
    expect(await run()).toMatchObject([{ code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION', message: 'opaque failure' }]);
  });
});

describe('host-backed facades', () => {
  it('delegates model, STEP, runner, filesystem, and worker-host calls', async () => {
    const runner = mock<GeoSpecRunner>();
    const filesystem = mock<VmFileSystem>();
    const stats: GeometryStats = {
      vertexCount: 0,
      meshCount: 0,
      triangleCount: 0,
      watertight: false,
      meshQuality: {
        triangleCount: 0,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles: [],
        surfaceArea: 0,
        signedVolume: 0,
      },
    };
    const analyzedSubject: GeometrySubject = {
      kind: 'geometry-subject',
      subjectId: 'subject-1',
      mesh: { format: 'glb', stats: { vertexCount: 0, meshCount: 0, triangleCount: 0 } },
      provenance: { source: { kind: 'bytes', format: 'glb' }, unit: 'm', loader: 'gltf-transform' },
      capabilities: [],
      diagnostics: [],
    };
    const loadStepHost = vi.fn<GeoSpecEngineHostBindings['loadStep']>(async () => subject);
    const disposeModelLoader = vi.fn(async () => undefined);
    const managedModelLoader = Object.assign(
      vi.fn(async () => subject),
      { dispose: disposeModelLoader },
    );
    const host: Partial<GeoSpecEngineHostBindings> = {
      loadModel: vi.fn(async () => subject),
      createModelLoader: vi.fn(() => managedModelLoader),
      loadStep: loadStepHost,
      loadMesh: vi.fn<GeoSpecEngineHostBindings['loadMesh']>(async () => ({ success: true, subject })),
      analyzeMesh: vi.fn<GeoSpecEngineHostBindings['analyzeMesh']>(async () => ({
        success: true,
        subject: analyzedSubject,
        stats,
      })),
      createGeoSpecNodeRunner: vi.fn(() => runner),
      createGeoSpecNodePoolRunner: vi.fn(() => runner),
      createGeoSpecWebRunner: vi.fn(() => runner),
      createGeoSpecWebPoolRunner: vi.fn(() => runner),
      createNodeVmFileSystem: vi.fn(() => filesystem),
      startGeoSpecPoolWorkerHost: vi.fn(),
    };
    registerResult({ status: 'passed', diagnostics: [] }, { host });

    expect(await loadModel({ source: new Uint8Array(), format: 'glb' })).toBe(subject);
    const configuredModelLoader = createModelLoader({ projectPath: '/project' });
    expect(await configuredModelLoader({ file: 'main.ts' })).toBe(subject);
    expect(host.createModelLoader).toHaveBeenCalledWith({ projectPath: '/project' });
    expect(managedModelLoader).toHaveBeenCalledWith({ file: 'main.ts' });
    await configuredModelLoader.dispose();
    expect(disposeModelLoader).toHaveBeenCalledOnce();

    expect(await loadStep({ source: new Uint8Array() })).toBe(subject);
    const configuredStepLoader = createStepLoader({ unit: 'mm' });
    const configuredStepSource = new Uint8Array();
    expect(await configuredStepLoader({ source: configuredStepSource })).toBe(subject);
    expect(loadStepHost).toHaveBeenLastCalledWith({ unit: 'mm', source: configuredStepSource });
    expect(await loadMesh({ source: new Uint8Array(), format: 'glb' })).toMatchObject({ success: true });
    expect(await analyzeMesh({ source: new Uint8Array(), format: 'glb' })).toMatchObject({ success: true });

    expect(createGeoSpecNodeRunner(mock<GeoSpecNodeRunnerOptions>())).toBe(runner);
    expect(createGeoSpecNodePoolRunner({ projectPath: '/project' })).toBe(runner);
    expect(createGeoSpecWebRunner(mock<GeoSpecWebRunnerOptions>())).toBe(runner);
    expect(createGeoSpecWebPoolRunner(mock<GeoSpecWebPoolRunnerOptions>())).toBe(runner);
    expect(createNodeVmFileSystem('/project')).toBe(filesystem);
    startGeoSpecPoolWorkerHost(mock<GeoSpecPoolWorkerHostOptions>());
    expect(host.startGeoSpecPoolWorkerHost).toHaveBeenCalledOnce();
  });

  it('parses complete and defaulted XDE records and rejects reader errors', () => {
    expect(parseXdeReadResultJson('{}')).toStrictEqual({
      occurrences: [],
      subshapeNames: [],
      datumPlacements: [],
      semanticDatums: [],
      datumSystems: [],
      supplementalPlanes: [],
      freeShapeCount: 0,
    });
    const complete = {
      occurrences: [{ id: '1' }],
      subshapeNames: [{ name: 'face' }],
      datumPlacements: [{ name: 'A' }],
      semanticDatums: [{ name: 'B' }],
      datumSystems: [{ name: 'C' }],
      supplementalPlanes: [{ name: 'D' }],
      freeShapeCount: 2,
    };
    expect(parseXdeReadResultJson(JSON.stringify(complete))).toStrictEqual(complete);
    expect(() => parseXdeReadResultJson('{"error":"broken"}')).toThrow('AP242 reader failed: broken');
  });
});
