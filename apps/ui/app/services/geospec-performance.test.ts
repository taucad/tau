import { describe, expect, it, vi } from 'vitest';
import {
  casesForFixture,
  catalogCasesForFixture,
  GeoSpecPerformanceService,
  runInput,
} from '#services/geospec-performance.js';
/* oxlint-disable no-restricted-imports -- Debug-only private benchmark source import; deliberately no public package export. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- This debug adapter test uses the same private fixture catalog.
import { performanceLabFixtures } from '../../../../packages/geospec-engine-native/bench/performance-lab.js';
/* oxlint-enable no-restricted-imports */

describe('GeoSpec performance route adapter', () => {
  it('should map matcher and ancillary query rows to one fixture-only port request', () => {
    const fixture = performanceLabFixtures.find(({ id }) => id === 'm3-control-step');
    expect(fixture).toBeDefined();
    if (!fixture) {
      return;
    }
    const cases = casesForFixture(fixture.id);
    const mapped = runInput({
      engine: 'combined-wasm',
      fixture,
      bytes: new Uint8Array([1]),
      cases,
      repeats: 2,
      cache: 'warm',
    });
    expect(mapped.cases.some(({ kind, matcher }) => kind === 'matcher' && matcher === 'toHaveBoundingBox')).toBe(true);
    expect(mapped.cases.some(({ kind, matcher }) => kind === 'query' && matcher === 'analyzeMesh')).toBe(true);
    expect(mapped.cases.find(({ matcher }) => matcher === 'analyzeMesh')).toMatchObject({
      payload: null,
      workUnitBudget: 8_000_000,
      claimId: 'ancillary.analyzeMesh.positive',
    });
    expect(
      casesForFixture('m3-pmi-step').some((entry) => 'capability' in entry && entry.capability === 'queryPmi'),
    ).toBe(true);
    const pmiFixture = performanceLabFixtures.find(({ id }) => id === 'm3-pmi-step')!;
    const pmiCases = casesForFixture(pmiFixture.id);
    const pmiInput = runInput({
      engine: 'combined-wasm',
      fixture: pmiFixture,
      bytes: new Uint8Array([1]),
      cases: pmiCases,
      repeats: 1,
      cache: 'cold',
    });
    expect(pmiInput.cases.map(({ subjectSlot }) => subjectSlot)).toEqual(
      pmiCases.map(({ claim }) => claim.subjectSlots[0]),
    );
    expect(pmiInput.cases.some(({ subjectSlot }) => subjectSlot === 'part')).toBe(true);
    expect(casesForFixture('many-occurrences-4096-step')).toHaveLength(1);
    expect(catalogCasesForFixture('many-occurrences-4096-step', false)).toHaveLength(0);
    expect(catalogCasesForFixture('many-occurrences-4096-step', true)).toHaveLength(1);
    expect(mapped.fixture).toEqual({
      id: fixture.id,
      format: 'step',
      sourceUnit: 'auto',
      bytes: new Uint8Array([1]),
      sha256: fixture.sha256,
    });
    expect(Object.keys(mapped)).toEqual(['engine', 'fixture', 'cases', 'repeats', 'cache']);
  });

  it('should reject worker bootstrap errors and removes request listeners', async () => {
    const fixture = performanceLabFixtures.find(({ id }) => id === 'm3-control-step');
    expect(fixture).toBeDefined();
    if (!fixture) {
      return;
    }
    const removed: string[] = [];
    const terminate = vi.fn();
    class InertWorker extends EventTarget {
      public postMessage(): void {
        this.dispatchEvent(new Event('error'));
      }
      public terminate(): void {
        terminate();
      }
      public override removeEventListener(
        type: string,
        callback: Parameters<EventTarget['removeEventListener']>[1],
        options?: EventListenerOptions | boolean,
      ): void {
        removed.push(type);
        super.removeEventListener(type, callback, options);
      }
    }
    vi.stubGlobal('Worker', InertWorker);
    const service = new GeoSpecPerformanceService();
    try {
      await expect(
        service.run(
          runInput({
            engine: 'combined-wasm',
            fixture,
            bytes: new Uint8Array([1]),
            cases: casesForFixture(fixture.id).slice(0, 1),
            repeats: 1,
            cache: 'warm',
          }),
        ),
      ).rejects.toThrow('failed to start or execute');
      expect(removed).toEqual(['message', 'error', 'messageerror']);
      expect(terminate).toHaveBeenCalledTimes(1);
    } finally {
      service.close();
      vi.unstubAllGlobals();
    }
  });

  it('should preserve a combined warm worker when the legacy worker fails', async () => {
    const fixture = performanceLabFixtures.find(({ id }) => id === 'box-step')!;
    const calls: Array<{ worker: number; engine: string; cache: string }> = [];
    const terminated: number[] = [];
    let nextWorker = 0;
    class InertWorker extends EventTarget {
      public readonly id = nextWorker++;
      public postMessage(request: { id: number; input: { engine: string; cache: string } }): void {
        calls.push({ worker: this.id, engine: request.input.engine, cache: request.input.cache });
        if (request.input.engine === 'legacy-wasm') {
          this.dispatchEvent(new Event('error'));
          return;
        }
        this.dispatchEvent(
          new MessageEvent('message', {
            data: { id: request.id, type: 'result', result: { cache: request.input.cache } },
          }),
        );
      }
      public terminate(): void {
        terminated.push(this.id);
      }
    }
    vi.stubGlobal('Worker', InertWorker);
    const service = new GeoSpecPerformanceService();
    const input = (engine: 'combined-wasm' | 'legacy-wasm') =>
      runInput({
        engine,
        fixture,
        bytes: new Uint8Array([1]),
        cases: casesForFixture(fixture.id).slice(0, 1),
        repeats: 1,
        cache: 'warm',
      });
    try {
      await service.run(input('combined-wasm'));
      await expect(service.run(input('legacy-wasm'))).rejects.toThrow('failed to start or execute');
      await service.run(input('combined-wasm'));
      expect(calls).toEqual([
        { worker: 0, engine: 'combined-wasm', cache: 'cold' },
        { worker: 1, engine: 'legacy-wasm', cache: 'cold' },
        { worker: 0, engine: 'combined-wasm', cache: 'warm' },
      ]);
      expect(terminated).toEqual([1]);
    } finally {
      service.close();
      vi.unstubAllGlobals();
    }
    expect(terminated).toEqual([1, 0]);
  });
});
