// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createGeoSpecAssertionClient } from 'geospec/assertion-client';
import { exactClusterSelector, withCandidate } from '#workers/geospec-runner.impl.js';

describe('exact cluster candidate selector', () => {
  it('recognizes the actual authored evaluateClaim request and its contentHash alias', async () => {
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
    await expect(
      client.expectGeo({ contentHash: subjectHash }).toHaveConnectedComponents({ count: 1, toleranceMm: 0.01 }),
    ).rejects.toThrow('captured');
    expect(request).toBeDefined();
    expect(exactClusterSelector(request!)).toEqual({ subjectHash, toleranceMm: 0.01 });
    expect(engine.processRequest).not.toHaveBeenCalled();
    const control = vi.fn(() => new TextEncoder().encode('{}'));
    const canonicalize = vi.fn((bytes: Uint8Array<ArrayBuffer>) => bytes);
    expect(
      withCandidate({
        request: request!,
        evaluate: () => 'local result',
        engine: { processRequest: control },
        canonicalize,
        enabled: false,
      }),
    ).toBe('local result');
    expect(control).not.toHaveBeenCalled();
    expect(canonicalize).not.toHaveBeenCalled();

    const candidate = { address: { actionSha256: 'b'.repeat(64) } };
    const enabledControl = vi.fn(() => new TextEncoder().encode(JSON.stringify({ candidate })));
    const evaluate = vi.fn(() => 'local result');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        withCandidate({
          request: request!,
          evaluate,
          engine: { processRequest: enabledControl },
          canonicalize,
          enabled: true,
        }),
      ).toBe('local result');
    }
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(enabledControl).toHaveBeenCalledTimes(1);
  });
});
