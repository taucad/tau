/**
 * W9 R5: safe mode makes no Tau Cloud read, the History pane's push records included (`GET .../git/pushes`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Deployment environment keys.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { tau?: unknown }).tau;
});

describe('refreshPushRecords in safe mode (W9 R5)', () => {
  it('reads no push records when the desktop launched in safe mode', async () => {
    (globalThis as { tau?: unknown }).tau = { safeMode: { reason: 'requested' } };
    const fetchSpy = vi.fn(async () => Response.json({ pushes: [], members: [] }));
    vi.stubGlobal('fetch', fetchSpy);
    const { refreshPushRecords } = await import('#lib/revision-pushes.js');

    refreshPushRecords({ projectId: 'proj_1', accountId: 'user_1', token: undefined });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
