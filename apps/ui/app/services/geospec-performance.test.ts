import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { desktopBridge } from '#filesystem/desktop-bridge.js';
import type { DesktopBridge } from '#filesystem/desktop-bridge.js';
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

vi.mock('#filesystem/desktop-bridge.js', () => ({ desktopBridge: vi.fn(() => undefined) }));

const cellInput = (cache: 'cold' | 'warm', engine: 'combined-wasm' | 'native-desktop' = 'combined-wasm') => {
  const fixture = performanceLabFixtures.find(({ id }) => id === 'box-step')!;
  return runInput({
    engine,
    fixture,
    bytes: new Uint8Array([1]),
    cases: casesForFixture(fixture.id).slice(0, 1),
    repeats: 1,
    cache,
  });
};

const silentPort = (): MessagePort =>
  Object.assign(new EventTarget(), {
    onmessage: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
  }) as MessagePort;

describe('GeoSpec performance route adapter', () => {
  it('should time out an unanswered cold worker and terminate it', async () => {
    const terminate = vi.fn();
    class SilentWorker extends EventTarget {
      public postMessage(): void {
        /* Deliberately no reply. */
      }
      public terminate(): void {
        terminate();
      }
    }
    vi.useFakeTimers();
    vi.stubGlobal('Worker', SilentWorker);
    const service = new GeoSpecPerformanceService();
    try {
      const pending = service.run(cellInput('cold'));
      const rejected = expect(pending).rejects.toThrow('Performance lab infrastructure timeout after 300000 ms.');
      await vi.advanceTimersByTimeAsync(300_000);
      await rejected;
      expect(terminate).toHaveBeenCalledOnce();
    } finally {
      service.close();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('should retire an unanswered warm worker before its next cell', async () => {
    const terminated: number[] = [];
    const caches: string[] = [];
    let nextWorker = 0;
    class WorkerWithFirstReplyMissing extends EventTarget {
      public readonly id = nextWorker++;
      public postMessage(request: { id: number; input: { cache: string } }): void {
        caches.push(request.input.cache);
        if (this.id > 0) {
          this.dispatchEvent(new MessageEvent('message', { data: { id: request.id, type: 'result', result: {} } }));
        }
      }
      public terminate(): void {
        terminated.push(this.id);
      }
    }
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerWithFirstReplyMissing);
    const service = new GeoSpecPerformanceService();
    try {
      const pending = service.run(cellInput('warm'));
      const rejected = expect(pending).rejects.toThrow('Performance lab infrastructure timeout after 300000 ms.');
      await vi.advanceTimersByTimeAsync(300_000);
      await rejected;
      await service.run(cellInput('warm'));
      expect(caches).toEqual(['cold', 'cold']);
      expect(terminated).toEqual([0]);
    } finally {
      service.close();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
    expect(terminated).toEqual([0, 1]);
  });

  it('should settle and terminate unanswered cold and warm workers on close', async () => {
    const terminated: number[] = [];
    let nextWorker = 0;
    class SilentWorker extends EventTarget {
      public readonly id = nextWorker++;
      public postMessage(): void {
        /* Deliberately no reply. */
      }
      public terminate(): void {
        terminated.push(this.id);
      }
    }
    vi.stubGlobal('Worker', SilentWorker);
    const service = new GeoSpecPerformanceService();
    try {
      const cold = service.run(cellInput('cold'));
      const warm = service.run(cellInput('warm'));
      const coldRejected = expect(cold).rejects.toThrow('Performance lab is closed.');
      const warmRejected = expect(warm).rejects.toThrow('Performance lab is closed.');
      service.close();
      await Promise.all([coldRejected, warmRejected]);
      expect(terminated.toSorted((left, right) => left - right)).toEqual([0, 1]);
    } finally {
      service.close();
      vi.unstubAllGlobals();
    }
    expect(terminated.toSorted((left, right) => left - right)).toEqual([0, 1]);
  });

  it('should settle an unanswered native port and close it on service close', async () => {
    const port = silentPort();
    vi.mocked(desktopBridge).mockReturnValue(
      mock<DesktopBridge>({ geoSpecPerformance: { connect: async () => port } }),
    );
    const service = new GeoSpecPerformanceService();
    try {
      const pending = service.run(cellInput('cold', 'native-desktop'));
      const rejected = expect(pending).rejects.toThrow('Performance lab is closed.');
      await vi.waitFor(() => {
        expect(port.postMessage).toHaveBeenCalledOnce();
      });
      service.close();
      await rejected;
      expect(port.close).toHaveBeenCalledOnce();
    } finally {
      service.close();
      vi.mocked(desktopBridge).mockReturnValue(undefined);
    }
  });

  it('should time out an unanswered native port and close it', async () => {
    const port = silentPort();
    vi.mocked(desktopBridge).mockReturnValue(
      mock<DesktopBridge>({ geoSpecPerformance: { connect: async () => port } }),
    );
    vi.useFakeTimers();
    const service = new GeoSpecPerformanceService();
    try {
      const pending = service.run(cellInput('cold', 'native-desktop'));
      const rejected = expect(pending).rejects.toThrow('Performance lab infrastructure timeout after 300000 ms.');
      await vi.advanceTimersByTimeAsync(300_000);
      await rejected;
      expect(port.close).toHaveBeenCalledOnce();
    } finally {
      service.close();
      vi.mocked(desktopBridge).mockReturnValue(undefined);
      vi.useRealTimers();
    }
  });

  it('should reject close during a native port connection and close a late port', async () => {
    let deliverPort: (port: MessagePort) => void = () => undefined;
    const connection = new Promise<MessagePort>((resolve) => {
      deliverPort = resolve;
    });
    const port = silentPort();
    vi.mocked(desktopBridge).mockReturnValue(
      mock<DesktopBridge>({ geoSpecPerformance: { connect: async () => connection } }),
    );
    const service = new GeoSpecPerformanceService();
    try {
      const pending = service.run(cellInput('cold', 'native-desktop'));
      const rejected = expect(pending).rejects.toThrow('Performance lab is closed.');
      service.close();
      await rejected;
      deliverPort(port);
      await vi.waitFor(() => {
        expect(port.close).toHaveBeenCalledOnce();
      });
      expect(port.postMessage).not.toHaveBeenCalled();
    } finally {
      service.close();
      vi.mocked(desktopBridge).mockReturnValue(undefined);
    }
  });

  it('keeps ST and each MT receipt in separate warm workers', async () => {
    const fixture = performanceLabFixtures.find(({ id }) => id === 'box-step')!;
    const calls: Array<{ worker: number; cache: string; variant: string }> = [];
    let nextWorker = 0;
    class InertWorker extends EventTarget {
      public readonly id = nextWorker++;
      public postMessage(request: { id: number; input: { cache: string; execution?: { variant: string } } }): void {
        calls.push({
          worker: this.id,
          cache: request.input.cache,
          variant: request.input.execution?.variant ?? 'default',
        });
        this.dispatchEvent(
          new MessageEvent('message', {
            data: { id: request.id, type: 'result', result: {} },
          }),
        );
      }
      public terminate(): void {
        /* Lifecycle is covered by the existing test. */
      }
    }
    vi.stubGlobal('Worker', InertWorker);
    const service = new GeoSpecPerformanceService();
    const base: Omit<Parameters<typeof runInput>[0], 'execution'> = {
      engine: 'combined-wasm',
      fixture,
      bytes: new Uint8Array([1]),
      cases: casesForFixture(fixture.id).slice(0, 1),
      repeats: 1,
      cache: 'warm',
    };
    try {
      await service.run(runInput({ ...base, execution: { variant: 'st' } }));
      await service.run(
        runInput({
          ...base,
          execution: {
            variant: 'mt',
            permits: 4,
            receipt: 'https://tau.example/a.json',
          },
        }),
      );
      await service.run(runInput({ ...base, execution: { variant: 'st' } }));
      await service.run(
        runInput({
          ...base,
          execution: {
            variant: 'mt',
            permits: 4,
            receipt: 'https://tau.example/b.json',
          },
        }),
      );
      expect(calls).toEqual([
        { worker: 0, cache: 'cold', variant: 'st' },
        { worker: 1, cache: 'cold', variant: 'mt' },
        { worker: 0, cache: 'warm', variant: 'st' },
        { worker: 2, cache: 'cold', variant: 'mt' },
      ]);
    } finally {
      service.close();
      vi.unstubAllGlobals();
    }
  });
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
    expect(casesForFixture('many-occurrences-4096-step')).toHaveLength(7);
    expect(catalogCasesForFixture('many-occurrences-4096-step', false)).toHaveLength(0);
    expect(catalogCasesForFixture('many-occurrences-4096-step', true)).toHaveLength(7);
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

  it('should preserve a combined ST warm worker when a combined MT worker fails', async () => {
    const fixture = performanceLabFixtures.find(({ id }) => id === 'box-step')!;
    const calls: Array<{ worker: number; variant: string; cache: string }> = [];
    const terminated: number[] = [];
    let nextWorker = 0;
    class InertWorker extends EventTarget {
      public readonly id = nextWorker++;
      public postMessage(request: { id: number; input: { execution?: { variant: string }; cache: string } }): void {
        const variant = request.input.execution?.variant ?? 'st';
        calls.push({
          worker: this.id,
          variant,
          cache: request.input.cache,
        });
        if (variant === 'mt') {
          this.dispatchEvent(new Event('error'));
          return;
        }
        this.dispatchEvent(
          new MessageEvent('message', {
            data: {
              id: request.id,
              type: 'result',
              result: { cache: request.input.cache },
            },
          }),
        );
      }
      public terminate(): void {
        terminated.push(this.id);
      }
    }
    vi.stubGlobal('Worker', InertWorker);
    const service = new GeoSpecPerformanceService();
    const input = (variant: 'st' | 'mt') =>
      runInput({
        engine: 'combined-wasm',
        fixture,
        bytes: new Uint8Array([1]),
        cases: casesForFixture(fixture.id).slice(0, 1),
        repeats: 1,
        cache: 'warm',
        execution:
          variant === 'mt'
            ? { variant, permits: 2, receipt: 'https://tau.example/geospec-mt/permits-2/geospec_engine_native.mt.json' }
            : { variant },
      });
    try {
      await service.run(input('st'));
      await expect(service.run(input('mt'))).rejects.toThrow('failed to start or execute');
      await service.run(input('st'));
      expect(calls).toEqual([
        { worker: 0, variant: 'st', cache: 'cold' },
        { worker: 1, variant: 'mt', cache: 'cold' },
        { worker: 0, variant: 'st', cache: 'warm' },
      ]);
      expect(terminated).toEqual([1]);
    } finally {
      service.close();
      vi.unstubAllGlobals();
    }
    expect(terminated).toEqual([1, 0]);
  });
});
