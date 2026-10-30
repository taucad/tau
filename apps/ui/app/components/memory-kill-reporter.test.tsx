import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKillReporter } from '#components/memory-kill-reporter.js';
import { AnalyticsContextProvider } from '#hooks/use-analytics.js';
import { createMemoryKillSignal } from '#lib/memory-kill-signal.js';
import { readLastMemorySample, resetMemorySampler, takeMemorySample } from '#lib/memory-sampler.js';

afterEach(() => {
  resetMemorySampler();
});

describe('MemoryKillReporter (B-01)', () => {
  it('reports a suspected memory kill through the app analytics path once', () => {
    const storage = globalThis.sessionStorage;
    const previous = createMemoryKillSignal({ storage, navigationType: 'navigate', deviceClass: 'constrained' });
    previous.takeSuspectedKill();
    previous.setCounts({ liveProjectCount: 1, chatCount: 3 });
    previous.breadcrumb('export');

    const signal = createMemoryKillSignal({ storage, navigationType: 'reload', deviceClass: 'constrained' });
    const capture = vi.fn();
    const analytics = { capture };
    const { rerender } = render(
      <AnalyticsContextProvider analytics={analytics}>
        <MemoryKillReporter signal={signal} liveProjectCount={0} chatCount={0} />
      </AnalyticsContextProvider>,
    );
    rerender(
      <AnalyticsContextProvider analytics={analytics}>
        <MemoryKillReporter signal={signal} liveProjectCount={1} chatCount={1} />
      </AnalyticsContextProvider>,
    );

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(
      'memory.suspected_kill',
      expect.objectContaining({
        deviceClass: 'constrained',
        liveProjectCount: 1,
        chatCount: 3,
        lastBreadcrumb: 'export',
      }),
    );
  });

  it('gives SB2\u2019s sampler the live project count while it is mounted, and takes it back on unmount', () => {
    const signal = createMemoryKillSignal({
      storage: globalThis.sessionStorage,
      navigationType: 'navigate',
      deviceClass: 'standard',
    });
    const analytics = { capture: vi.fn() };
    const { unmount } = render(
      <AnalyticsContextProvider analytics={analytics}>
        <MemoryKillReporter signal={signal} liveProjectCount={3} chatCount={0} />
      </AnalyticsContextProvider>,
    );

    takeMemorySample();
    expect(readLastMemorySample()?.liveProjects).toBe(3);

    unmount();
    takeMemorySample();
    expect(readLastMemorySample()).not.toHaveProperty('liveProjects');
  });
});
