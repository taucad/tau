// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createGeoSpecAssertionClient } from 'geospec/assertion-client';
import { exactClusterSelector, withCandidate } from '#workers/geospec-runner.impl.js';

describe('exact cluster candidate selector', () => {
  it('should skip private candidate work for an authored mesh contentHash claim', () => {
    const contentHash = 'a'.repeat(64);
    let request: Uint8Array<ArrayBuffer> | undefined;
    const engine = {
      processRequest: vi.fn(() => new Uint8Array()),
      evaluateClaim: (bytes: Uint8Array<ArrayBuffer>) => {
        request = bytes;
        throw new Error('captured');
      },
    };
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 8_000_000 });
    expect(() => client.expectGeo({ contentHash }).toHaveConnectedComponents({ count: 1, toleranceMm: 0.01 })).toThrow(
      'captured',
    );
    expect(request).toBeDefined();
    expect(exactClusterSelector(request!)).toBeUndefined();
    expect(engine.processRequest).not.toHaveBeenCalled();
    const control = vi.fn(() => new TextEncoder().encode('{}'));
    const canonicalize = vi.fn((bytes: Uint8Array<ArrayBuffer>) => bytes);
    expect(
      withCandidate({
        request: request!,
        evaluate: () => 'mesh local result',
        engine: { processRequest: control },
        canonicalize,
        enabled: true,
      }),
    ).toBe('mesh local result');
    expect(control).not.toHaveBeenCalled();
    expect(canonicalize).not.toHaveBeenCalled();
  });

  it('should export one candidate after a local authored STEP subjectHash claim', () => {
    const subjectHash = 'a'.repeat(64);
    let request: Uint8Array<ArrayBuffer> | undefined;
    const engine = {
      processRequest: vi.fn(() => new Uint8Array()),
      evaluateClaim: (bytes: Uint8Array<ArrayBuffer>) => {
        request = bytes;
        throw new Error('captured');
      },
    };
    const client = createGeoSpecAssertionClient({ engine, workUnitLimit: 8_000_000 });
    expect(() => client.expectGeo({ subjectHash }).toHaveConnectedComponents({ count: 1, toleranceMm: 0.01 })).toThrow(
      'captured',
    );
    expect(request).toBeDefined();
    expect(exactClusterSelector(request!)).toEqual({ subjectHash, toleranceMm: 0.01 });
    const candidate = { address: { actionSha256: 'b'.repeat(64) } };
    const enabledControl = vi.fn(() => new TextEncoder().encode(JSON.stringify({ candidate })));
    const eventLog: string[] = [];
    const evaluate = vi.fn(() => {
      eventLog.push('local');
      return 'STEP local result';
    });
    const control = vi.fn(() => {
      eventLog.push('private');
      return enabledControl();
    });
    const canonicalize = vi.fn((bytes: Uint8Array<ArrayBuffer>) => bytes);
    expect(
      withCandidate({
        request: request!,
        evaluate: () => 'STEP local result',
        engine: { processRequest: control },
        canonicalize,
        enabled: false,
      }),
    ).toBe('STEP local result');
    expect(control).not.toHaveBeenCalled();
    expect(canonicalize).not.toHaveBeenCalled();
    expect(eventLog).toEqual([]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        withCandidate({
          request: request!,
          evaluate,
          engine: { processRequest: control },
          canonicalize,
          enabled: true,
        }),
      ).toBe('STEP local result');
    }
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(enabledControl).toHaveBeenCalledTimes(1);
    expect(eventLog).toEqual(['local', 'private', 'local']);
  });
});
