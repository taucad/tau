import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportUiError } from '#lib/error-reporting.js';
import { killLevel, reportDetectedKill, TabKilledError } from '#lib/tab-kill-reporting.js';
import type { DetectedMemoryKill } from '#lib/memory-kill-signal.js';

vi.mock('#lib/error-reporting.js', () => ({ reportUiError: vi.fn(async () => undefined) }));

const kill = (over: Partial<DetectedMemoryKill> = {}): DetectedMemoryKill => ({
  id: '1000-9000',
  classification: 'foreground',
  route: 'routes/w.$workspace.$project',
  path: '/w/a/b',
  buildId: '1793324757615',
  deviceClass: 'constrained',
  liveProjectCount: 2,
  chatCount: 5,
  lastActivity: 'render',
  aliveForMilliseconds: 8000,
  consecutiveKills: 1,
  highWaterWasmBytes: 512_000_000,
  sample: { at: 7500, liveProjects: 2 },
  trail: [
    { at: 1_793_324_757_000, name: 'open' },
    { at: 1_793_324_760_000, name: 'render' },
  ],
  ...over,
});

beforeEach(() => {
  vi.mocked(reportUiError).mockClear();
});

describe('tab kill reporting (SB3, A11)', () => {
  it('reports a synthetic TabKilledError grouped by classification and route, with the dead page’s trail', async () => {
    const reported = await reportDetectedKill(kill());

    expect(reported).toEqual({ delivered: true, eventId: undefined });
    const [error, details] = vi.mocked(reportUiError).mock.calls[0] ?? [];
    expect(error).toBeInstanceOf(TabKilledError);
    expect((error as Error).name).toBe('TabKilledError');
    expect(details).toMatchObject({
      fingerprint: ['tab-killed', 'foreground', 'routes/w.$workspace.$project'],
      level: 'warning',
      tags: {
        classification: 'foreground',
        route: 'routes/w.$workspace.$project',
        /* eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry tag names. */
        device_class: 'constrained',
        /* eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry tag names. */
        last_activity: 'render',
        /* eslint-disable-next-line @typescript-eslint/naming-convention -- Sentry tag names. */
        consecutive_kills: '1',
      },
    });
    expect(details?.contexts?.['tau.kill']).toMatchObject({
      path: '/w/a/b',
      uptimeSeconds: 8,
      consecutiveKills: 1,
      liveProjectCount: 2,
      chatCount: 5,
      highWaterWasmBytes: 512_000_000,
      memory: { at: 7500, liveProjects: 2 },
    });
    /* The trail is replayed with its own timestamps, in seconds, as Sentry reads them. */
    expect(details?.breadcrumbs).toEqual([
      { category: 'tau.activity', message: 'open', level: 'info', timestamp: 1_793_324_757 },
      { category: 'tau.activity', message: 'render', level: 'info', timestamp: 1_793_324_760 },
    ]);
  });

  it('leaves out what the device could not read, rather than reporting it as nothing', async () => {
    await reportDetectedKill(
      kill({ route: undefined, lastActivity: undefined, sample: undefined, highWaterWasmBytes: undefined }),
    );

    const [, details] = vi.mocked(reportUiError).mock.calls[0] ?? [];
    expect(details?.fingerprint).toEqual(['tab-killed', 'foreground', 'unknown']);
    expect(details?.tags).not.toHaveProperty('route');
    expect(details?.tags).not.toHaveProperty('last_activity');
    expect(details?.contexts?.['tau.kill']).not.toHaveProperty('memory');
    expect(details?.contexts?.['tau.kill']).not.toHaveProperty('highWaterWasmBytes');
  });

  it('raises a kill loop to error and keeps a background discard at info (D5, A11)', () => {
    expect(killLevel(kill())).toBe('warning');
    expect(killLevel(kill({ consecutiveKills: 2 }))).toBe('error');
    expect(killLevel(kill({ classification: 'background' }))).toBe('info');
    expect(killLevel(kill({ classification: 'unknown' }))).toBe('warning');
    /* A loop is the louder signal, whichever way its last kill is classified. */
    expect(killLevel(kill({ classification: 'background', consecutiveKills: 3 }))).toBe('error');
  });

  it('says the report did not land when the reporting path throws, so the kill stays pending', async () => {
    vi.mocked(reportUiError).mockRejectedValueOnce(new Error('no'));

    await expect(reportDetectedKill(kill())).resolves.toEqual({ delivered: false, eventId: undefined });
  });

  it('reports how long a background page had been hidden', async () => {
    await reportDetectedKill(kill({ classification: 'background', hiddenForMilliseconds: 61_000 }));

    const [, details] = vi.mocked(reportUiError).mock.calls[0] ?? [];
    expect(details?.contexts?.['tau.kill']).toMatchObject({ hiddenForSeconds: 61 });
  });
});
