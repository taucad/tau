import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKillReporter } from '#components/memory-kill-reporter.js';
import { createMemoryKillSignal } from '#lib/memory-kill-signal.js';
import { readLastMemorySample, resetMemorySampler, takeMemorySample } from '@taucad/ui-core/lib/memory-sampler';
import { reportDetectedKill } from '#lib/tab-kill-reporting.js';
import type { KillReportConsent } from '#components/memory-kill-reporter.js';
import { createKillMemory } from '#lib/kill-memory.js';
import type { ReportingConsent } from '@taucad/telemetry/client';

vi.mock('#lib/tab-kill-reporting.js', () => ({
  reportDetectedKill: vi.fn(async () => true),
}));

/** A consent source the test moves by hand. */
const consentSource = (
  initial: ReportingConsent,
): KillReportConsent & {
  set: (next: ReportingConsent) => void;
  count: ReturnType<typeof vi.fn<KillReportConsent['count']>>;
} => {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => current,
    count: vi.fn<KillReportConsent['count']>(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      current = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

/** A previous page that died during a render, and this load's signal over the same storage. */
const killedPage = (): ReturnType<typeof createMemoryKillSignal> => {
  const storage = globalThis.sessionStorage;
  const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'standard' });
  previous.takeDetectedKills();
  previous.breadcrumb('render');
  return createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'standard' });
};

const pendingInMarker = (): unknown[] =>
  (JSON.parse(globalThis.sessionStorage.getItem('tau:alive') ?? '{}') as { pending?: unknown[] }).pending ?? [];

afterEach(() => {
  resetMemorySampler();
  globalThis.sessionStorage.clear();
  vi.mocked(reportDetectedKill).mockClear();
});

describe('MemoryKillReporter (B-01, SB3)', () => {
  it('reports the detected kill once, and settles it so no later load reports it again', async () => {
    const storage = globalThis.sessionStorage;
    const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'constrained' });
    previous.takeDetectedKills();
    previous.setCounts({ liveProjectCount: 1, chatCount: 3 });
    previous.breadcrumb('export');

    const signal = createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'constrained' });
    const consent = consentSource('granted');
    const { rerender } = render(
      <MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={consent} />,
    );
    rerender(<MemoryKillReporter signal={signal} liveProjectCount={1} chatCount={1} consent={consent} />);

    expect(reportDetectedKill).toHaveBeenCalledTimes(1);
    expect(reportDetectedKill).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'foreground',
        deviceClass: 'constrained',
        liveProjectCount: 1,
        chatCount: 3,
        lastActivity: 'export',
        consecutiveKills: 1,
      }),
    );

    /* The report landed, so the kill leaves the marker and no later load carries it again. */
    await vi.waitFor(() => {
      expect(JSON.parse(storage.getItem('tau:alive') ?? '{}')).toMatchObject({ pending: [] });
    });
  });

  it('keeps a kill whose report never landed, so the load after a kill loop still reports it', async () => {
    vi.mocked(reportDetectedKill).mockResolvedValueOnce(false);
    const storage = globalThis.sessionStorage;
    const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'standard' });
    previous.takeDetectedKills();
    previous.breadcrumb('render');

    const signal = createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'standard' });
    render(
      <MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={consentSource('granted')} />,
    );

    await vi.waitFor(() => {
      expect(reportDetectedKill).toHaveBeenCalledTimes(1);
    });
    /* Killed again while reporting: the undelivered kill comes back on the next load (G17). */
    const next = createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'standard' });
    const carried = next.takeDetectedKills();

    expect(carried).toHaveLength(2);
    expect(carried[0]).toMatchObject({ classification: 'foreground', lastActivity: 'render' });
  });

  it('gives SB2’s sampler the live project count while it is mounted, and takes it back on unmount', () => {
    const signal = createMemoryKillSignal({
      storage: globalThis.sessionStorage,
      navigationType: 'navigate',
      deviceClass: 'standard',
    });
    const { unmount } = render(
      <MemoryKillReporter signal={signal} liveProjectCount={3} chatCount={0} consent={consentSource('granted')} />,
    );

    takeMemorySample();
    expect(readLastMemorySample()?.liveProjects).toBe(3);

    unmount();
    takeMemorySample();
    expect(readLastMemorySample()).not.toHaveProperty('liveProjects');
  });

  describe('consent (crash capture blueprint: the telemetry switch decides)', () => {
    it('sends nothing on denied, and drops the kill from the marker at once', async () => {
      const signal = killedPage();
      render(
        <MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={consentSource('denied')} />,
      );

      await vi.waitFor(() => {
        expect(pendingInMarker()).toEqual([]);
      });
      expect(reportDetectedKill).not.toHaveBeenCalled();
    });

    it('counts a delivered kill once in runtime telemetry, by kernel and phase, and never on denied', async () => {
      const storage = globalThis.sessionStorage;
      const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'standard' });
      previous.takeDetectedKills();
      previous.work({ kernel: 'replicad', phase: 'mesh' });
      const signal = createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'standard' });
      const granted = consentSource('granted');
      render(<MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={granted} />);

      await vi.waitFor(() => {
        expect(granted.count).toHaveBeenCalledTimes(1);
      });
      const [counted] = granted.count.mock.calls[0] ?? [];
      expect(counted?.classification).toBe('foreground');
      expect(counted?.work).toMatchObject({ kernel: 'replicad', phase: 'mesh' });

      const denied = consentSource('denied');
      render(<MemoryKillReporter signal={killedPage()} liveProjectCount={0} chatCount={0} consent={denied} />);
      await vi.waitFor(() => {
        expect(pendingInMarker()).toEqual([]);
      });
      expect(denied.count).not.toHaveBeenCalled();
    });

    it('holds the kill while consent is unknown and sends it once it resolves to granted', async () => {
      const signal = killedPage();
      const consent = consentSource('unknown');
      render(<MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={consent} />);

      await Promise.resolve();
      expect(reportDetectedKill).not.toHaveBeenCalled();
      expect(pendingInMarker()).toHaveLength(1);

      consent.set('granted');
      await vi.waitFor(() => {
        expect(reportDetectedKill).toHaveBeenCalledTimes(1);
      });
      await vi.waitFor(() => {
        expect(pendingInMarker()).toEqual([]);
      });
    });

    it('holds the kill while consent is unknown and drops it once it resolves to denied', async () => {
      const signal = killedPage();
      const consent = consentSource('unknown');
      render(<MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={consent} />);

      consent.set('denied');
      await vi.waitFor(() => {
        expect(pendingInMarker()).toEqual([]);
      });
      expect(reportDetectedKill).not.toHaveBeenCalled();
    });

    it('offers nothing after a delivered kill: no prompt, only the report', async () => {
      const signal = killedPage();
      const { container } = render(
        <MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} consent={consentSource('granted')} />,
      );

      await vi.waitFor(() => {
        expect(reportDetectedKill).toHaveBeenCalledTimes(1);
      });
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('kill memory (paused model)', () => {
    const killedWhile = (phase: string): ReturnType<typeof createMemoryKillSignal> => {
      const storage = globalThis.sessionStorage;
      const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'standard' });
      previous.takeDetectedKills();
      previous.work({ model: 'abcd1234', phase });
      return createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'standard' });
    };

    it('remembers a model that stopped the page while rendering, even with telemetry off', () => {
      const values = new Map<string, string>();
      const memory = createKillMemory({
        storage: () =>
          ({
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
          }) as unknown as Storage,
      });
      render(
        <MemoryKillReporter
          signal={killedWhile('gpu-upload')}
          liveProjectCount={0}
          chatCount={0}
          consent={consentSource('denied')}
          memory={memory}
        />,
      );

      expect(memory.entries()).toEqual([expect.objectContaining({ model: 'abcd1234', kills: 1 })]);
    });

    it('does not pause a model for a kill while idle', () => {
      const memory = createKillMemory({ storage: () => undefined });
      const record = vi.spyOn(memory, 'record');
      render(
        <MemoryKillReporter
          signal={killedWhile('idle')}
          liveProjectCount={0}
          chatCount={0}
          consent={consentSource('granted')}
          memory={memory}
        />,
      );

      expect(record).not.toHaveBeenCalled();
    });
  });
});
