import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKillReporter } from '#components/memory-kill-reporter.js';
import { createMemoryKillSignal } from '#lib/memory-kill-signal.js';
import { readLastMemorySample, resetMemorySampler, takeMemorySample } from '#lib/memory-sampler.js';
import { reportDetectedKill } from '#lib/tab-kill-reporting.js';

vi.mock('#lib/tab-kill-reporting.js', () => ({
  reportDetectedKill: vi.fn(async () => ({ delivered: true, eventId: 'event-1' })),
}));

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
    const { rerender } = render(<MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} />);
    rerender(<MemoryKillReporter signal={signal} liveProjectCount={1} chatCount={1} />);

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
    vi.mocked(reportDetectedKill).mockResolvedValueOnce({ delivered: false, eventId: undefined });
    const storage = globalThis.sessionStorage;
    const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'standard' });
    previous.takeDetectedKills();
    previous.breadcrumb('render');

    const signal = createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'standard' });
    render(<MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} />);

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
    const { unmount } = render(<MemoryKillReporter signal={signal} liveProjectCount={3} chatCount={0} />);

    takeMemorySample();
    expect(readLastMemorySample()?.liveProjects).toBe(3);

    unmount();
    takeMemorySample();
    expect(readLastMemorySample()).not.toHaveProperty('liveProjects');
  });
});
