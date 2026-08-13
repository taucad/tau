import { afterEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { geoSpecMatcherDescriptors, normalizeGeoSpecExpected } from '#engine/matchers.js';
import { geoSpecEngineProtocolVersion } from '#engine/protocol.js';
import { createTestGeoSpecEngineProtocol } from '#engine/protocol.test-support.js';
import {
  clearGeoSpecEngine,
  describeGeoSpecEngine,
  geoSpecEngineGlobalKey,
  geoSpecEngineUnavailableCode,
  geoSpecEngineUnavailableDiagnostic,
  GeoSpecEngineUnavailableError,
  getGeoSpecEngine,
  getGeoSpecEngineHostBinding,
  getGeoSpecEngineProtocol,
  registerGeoSpecEngine,
  requireGeoSpecEngineHostBinding,
} from '#engine/seam.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecEngineImplementation } from '#engine/seam.js';
import { geoSpecMatcherNames } from '#create-geospec.js';

afterEach(() => {
  clearGeoSpecEngine();
});

describe('matcher registry', () => {
  it('describes every matcher expectGeo exposes, in registry order', () => {
    expect(Object.keys(geoSpecMatcherDescriptors)).toStrictEqual([...geoSpecMatcherNames]);
    expect(geoSpecMatcherNames).toHaveLength(23);
  });

  it('gives every matcher a distinct assertion kind', () => {
    const kinds = Object.values(geoSpecMatcherDescriptors).map((descriptor) => descriptor.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('normalizes every documented expectation shape', () => {
    expect(normalizeGeoSpecExpected('true', [])).toBe(true);
    expect(normalizeGeoSpecExpected('first', [{ value: 1 }])).toStrictEqual({ value: 1 });
    expect(normalizeGeoSpecExpected('first-or-empty', [])).toStrictEqual({});
    expect(normalizeGeoSpecExpected('first-or-empty', [{ tolerance: 2 }])).toStrictEqual({ tolerance: 2 });
    expect(normalizeGeoSpecExpected('bounds', [{ min: [0, 0, 0] }])).toStrictEqual({ min: [0, 0, 0] });
    expect(
      normalizeGeoSpecExpected('bounds', [
        [0, 0, 0],
        [1, 1, 1],
      ]),
    ).toStrictEqual({
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
  });
});

const hostSubject = mock<GeometrySubject>();
const hostLoadStep = async (): Promise<GeometrySubject> => hostSubject;
const engineStub: GeoSpecEngineImplementation = {
  protocolVersion: geoSpecEngineProtocolVersion,
  engine: '@taucad/geospec-engine',
  version: '9.9.9',
  protocol: createTestGeoSpecEngineProtocol({
    engine: '@taucad/geospec-engine',
    version: '9.9.9',
    capabilities: ['toHaveVolume', 'analyzeBrep'],
  }),
  host: { loadStep: hostLoadStep },
};

describe('engine registration', () => {
  it('reports no engine before registration', () => {
    expect(getGeoSpecEngine()).toBeUndefined();
    expect(getGeoSpecEngineProtocol()).toBeUndefined();
    expect(describeGeoSpecEngine()).toBeUndefined();
    expect(getGeoSpecEngineHostBinding('loadStep')).toBeUndefined();
  });

  it('describes protocol capabilities and keeps host bindings separate', () => {
    registerGeoSpecEngine(engineStub);

    expect(getGeoSpecEngine()).toBe(engineStub);
    expect(getGeoSpecEngineProtocol()).toBe(engineStub.protocol);
    expect(describeGeoSpecEngine()).toStrictEqual({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: '@taucad/geospec-engine',
      version: '9.9.9',
      capabilities: ['toHaveVolume', 'analyzeBrep'],
    });
    expect(requireGeoSpecEngineHostBinding('loadStep')).toBe(hostLoadStep);
  });

  it('describes an engine with no capabilities', () => {
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'bare',
      version: '0.0.0',
      protocol: createTestGeoSpecEngineProtocol({ engine: 'bare', version: '0.0.0' }),
    });

    expect(describeGeoSpecEngine()?.capabilities).toStrictEqual([]);
  });

  it('refuses an engine speaking another protocol version', () => {
    expect(() => {
      registerGeoSpecEngine({
        protocolVersion: 99,
        engine: 'future',
        version: '1.0.0',
        protocol: createTestGeoSpecEngineProtocol({ engine: 'future', version: '1.0.0' }),
      });
    }).toThrow(GeoSpecEngineUnavailableError);
    expect(getGeoSpecEngine()).toBeUndefined();
  });

  it('refuses an engine whose initialization response changes protocol version', () => {
    expect(() => {
      registerGeoSpecEngine({
        ...engineStub,
        protocol: {
          ...engineStub.protocol,
          initialize: (request) => ({
            ...engineStub.protocol.initialize(request),
            protocolVersion: geoSpecEngineProtocolVersion + 1,
          }),
        },
      });
    }).toThrow(GeoSpecEngineUnavailableError);
    expect(getGeoSpecEngine()).toBeUndefined();
  });

  it('publishes registration through one global slot', () => {
    registerGeoSpecEngine(engineStub);

    expect((globalThis as Record<string, unknown>)[geoSpecEngineGlobalKey]).toBe(engineStub);
    clearGeoSpecEngine();
    expect((globalThis as Record<string, unknown>)[geoSpecEngineGlobalKey]).toBeUndefined();
  });
});

describe('engine-unavailable vocabulary', () => {
  it('answers with the GEOSPEC_ENGINE_UNAVAILABLE diagnostic', () => {
    const diagnostic = geoSpecEngineUnavailableDiagnostic('loadStep');

    expect(diagnostic.code).toBe(geoSpecEngineUnavailableCode);
    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.message).toContain('loadStep');
    expect(diagnostic.details).toStrictEqual({
      capability: 'loadStep',
      protocolVersion: geoSpecEngineProtocolVersion,
    });
  });

  it('carries the same diagnostic on the thrown error', () => {
    const error = new GeoSpecEngineUnavailableError('loadStep');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GeoSpecEngineUnavailableError');
    expect(error.code).toBe(geoSpecEngineUnavailableCode);
    expect(error.diagnostics).toStrictEqual([geoSpecEngineUnavailableDiagnostic('loadStep')]);
  });

  it('throws when a required host binding is absent', () => {
    expect(() => requireGeoSpecEngineHostBinding('loadStep')).toThrow(GeoSpecEngineUnavailableError);
  });
});
