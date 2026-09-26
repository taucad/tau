// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteFacet, RevisionStatusProjection } from '@taucad/revisions';

/* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));
/* The account behind the session hook, scripted per row. */
const { account } = vi.hoisted(() => ({
  account: {
    auth: 'authed' as 'authed' | 'anonymous' | 'indeterminate',
    isResolved: true,
    canSyncFiles: true,
  },
}));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => account.auth }));
vi.mock('#cloud/commercial-features.js', () => ({
  useCommercialFeatures: () => ({ isResolved: account.isResolved, canSyncFiles: account.canSyncFiles }),
}));

const {
  backupByDefaultNotice,
  fetchCloudProjects,
  materializeOnSignIn,
  nextTauCloudStep,
  tauCloudIntent,
  useTauCloudIntentConnection,
} = await import('#hooks/use-cloud-projects.js');
type Eligibility = Parameters<typeof nextTauCloudStep>[1];

const remote = (kind: RemoteFacet['kind'], phase: RemoteFacet['phase'] = 'none'): RemoteFacet => ({
  kind,
  url: undefined,
  phase,
  storage: undefined,
  overQuota: [],
  quota: undefined,
  error: undefined,
  reason: undefined,
  fetchOnly: false,
  provider: undefined,
  repositoryId: undefined,
});

/* Only the two fields the decision reads; the rest of the projection is not its business. */
const status = (headRevisionId: string | undefined, kind: RemoteFacet['kind'] = 'none'): RevisionStatusProjection => {
  const read: Pick<RevisionStatusProjection, 'headRevisionId' | 'remote'> = { headRevisionId, remote: remote(kind) };
  return read as RevisionStatusProjection;
};

const entitled: Eligibility = { auth: 'authed', isResolved: true, canSyncFiles: true };
/* W8/D23: a Free account while the free-tier gate is closed. */
const gateClosedFree: Eligibility = { auth: 'authed', isResolved: true, canSyncFiles: false };

describe('nextTauCloudStep', () => {
  // ── D19: backup by default ────────────────────────────────────────────────
  it('should connect a new project on an entitled account once its first revision exists', () => {
    expect(nextTauCloudStep('default', entitled, status('rev-1'))).toBe('connect');
  });

  it('should wait for the first revision before anything leaves the device', () => {
    expect(nextTauCloudStep('default', entitled, status(undefined))).toBe('wait');
  });

  it('should forget the intent for a Free account while the free-tier gate is closed', () => {
    expect(nextTauCloudStep('default', gateClosedFree, status('rev-1'))).toBe('forget');
  });

  it('should forget the intent for a signed-out account', () => {
    expect(nextTauCloudStep('default', { ...entitled, auth: 'anonymous' }, status('rev-1'))).toBe('forget');
  });

  it('should wait while the session or the plan is still unknown', () => {
    expect(nextTauCloudStep('default', { ...entitled, auth: 'indeterminate' }, status('rev-1'))).toBe('wait');
    expect(nextTauCloudStep('default', { ...entitled, isResolved: false }, status('rev-1'))).toBe('wait');
  });

  it('should forget the intent once a remote was chosen by hand', () => {
    expect(nextTauCloudStep('default', entitled, status('rev-1', 'git'))).toBe('forget');
  });

  it('should wait before the revision root has answered', () => {
    expect(nextTauCloudStep('default', entitled, undefined)).toBe('wait');
  });

  it('should never connect again once the default connection is made', () => {
    expect(nextTauCloudStep('notice', entitled, status('rev-1'))).toBe('wait');
    expect(nextTauCloudStep(undefined, entitled, status('rev-1'))).toBe('wait');
  });

  // ── D20: materialized projects ───────────────────────────────────────────
  it('should connect a materialized project on its first open, before any revision', () => {
    expect(nextTauCloudStep('open', gateClosedFree, status(undefined))).toBe('connect');
  });
});

describe('backupByDefaultNotice', () => {
  it('should offer the opt-out before the first revision to an entitled account', () => {
    expect(backupByDefaultNotice('default', entitled, remote('none'))).toBe('pending');
  });

  it('should say nothing to an account that is not entitled', () => {
    expect(backupByDefaultNotice('default', gateClosedFree, remote('none'))).toBeUndefined();
  });

  it('should say the project is backed up once the default connection landed', () => {
    expect(backupByDefaultNotice('notice', entitled, remote('tau', 'connected'))).toBe('on');
  });

  it('should drop the line once the project was disconnected', () => {
    expect(backupByDefaultNotice('notice', entitled, remote('none'))).toBeUndefined();
    expect(backupByDefaultNotice('notice', entitled, remote('tau', 'disconnecting'))).toBeUndefined();
  });
});

describe('tauCloudIntent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should keep a project’s intent in storage, so a reload reads it back', () => {
    tauCloudIntent.set('proj_aaaaaaaaaaaaaaaaaaaaa', 'default');

    expect(localStorage.getItem('tau:tau-cloud-intent:proj_aaaaaaaaaaaaaaaaaaaaa')).toBe('default');
    expect(tauCloudIntent.get('proj_aaaaaaaaaaaaaaaaaaaaa')).toBe('default');
  });

  it('should forget an intent that was turned off', () => {
    tauCloudIntent.set('proj_aaaaaaaaaaaaaaaaaaaaa', 'notice');
    tauCloudIntent.set('proj_aaaaaaaaaaaaaaaaaaaaa', undefined);

    expect(tauCloudIntent.get('proj_aaaaaaaaaaaaaaaaaaaaa')).toBeUndefined();
  });

  it('should read a value it did not write as nothing owed', () => {
    localStorage.setItem('tau:tau-cloud-intent:proj_aaaaaaaaaaaaaaaaaaaaa', 'always');

    expect(tauCloudIntent.get('proj_aaaaaaaaaaaaaaaaaaaaa')).toBeUndefined();
  });
});

describe('materializeOnSignIn', () => {
  it('should be off by default', () => {
    expect(materializeOnSignIn.get()).toBeUndefined();
  });

  it('should keep the chosen workspace in storage', () => {
    materializeOnSignIn.set({ kind: 'workspace', workspaceId: 'wsp_aaaaaaaaaaaaaaaaaaaaa' });

    expect(JSON.parse(localStorage.getItem('tau:materialize-cloud-projects') ?? 'null')).toEqual({
      kind: 'workspace',
      workspaceId: 'wsp_aaaaaaaaaaaaaaaaaaaaa',
    });
    materializeOnSignIn.set(undefined);
    expect(localStorage.getItem('tau:materialize-cloud-projects')).toBeNull();
  });
});

describe('fetchCloudProjects', () => {
  it('should carry each row’s update time for the library’s Last Updated sort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { id: 'proj_aaaaaaaaaaaaaaaaaaaaa', name: 'Gearbox', role: 'owner', updatedAt: '2026-09-13T01:00:00.000Z' },
          { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket', role: 'owner' },
        ],
      })),
    );

    await expect(fetchCloudProjects()).resolves.toEqual([
      {
        id: 'proj_aaaaaaaaaaaaaaaaaaaaa',
        name: 'Gearbox',
        role: 'owner',
        updatedAt: Date.parse('2026-09-13T01:00:00Z'),
      },
      { id: 'proj_bbbbbbbbbbbbbbbbbbbbb', name: 'Bracket', role: 'owner' },
    ]);
  });
});

describe('useTauCloudIntentConnection', () => {
  const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
  const connectRemote = vi.fn(async (_kind: 'tau') => undefined);

  beforeEach(() => {
    localStorage.clear();
    connectRemote.mockClear();
    Object.assign(account, { auth: 'authed', isResolved: true, canSyncFiles: true });
  });

  // ── Acceptance 1: no Connect step on an entitled account ────────────────
  it('should connect Tau Cloud once after the first revision and keep the notice owed', () => {
    tauCloudIntent.set(projectId, 'default');
    const { rerender } = renderHook(
      ({ head }: { head: string | undefined }) => {
        useTauCloudIntentConnection({ projectId, intent: 'default', status: status(head), connectRemote });
      },
      { initialProps: { head: undefined as string | undefined } },
    );
    expect(connectRemote).not.toHaveBeenCalled();

    rerender({ head: 'rev-1' });
    rerender({ head: 'rev-1' });

    expect(connectRemote).toHaveBeenCalledOnce();
    expect(connectRemote).toHaveBeenCalledWith('tau');
    expect(tauCloudIntent.get(projectId)).toBe('notice');
  });

  // ── Acceptance 1: gate closed ────────────────────────────────────────────
  it('should create nothing for a Free account while the D23 gate is closed', () => {
    account.canSyncFiles = false;
    tauCloudIntent.set(projectId, 'default');

    renderHook(() => {
      useTauCloudIntentConnection({ projectId, intent: 'default', status: status('rev-1'), connectRemote });
    });

    expect(connectRemote).not.toHaveBeenCalled();
    expect(tauCloudIntent.get(projectId)).toBeUndefined();
  });

  it('should connect a materialized project on open and owe nothing after', () => {
    tauCloudIntent.set(projectId, 'open');

    renderHook(() => {
      useTauCloudIntentConnection({ projectId, intent: 'open', status: status(undefined), connectRemote });
    });

    expect(connectRemote).toHaveBeenCalledWith('tau');
    expect(tauCloudIntent.get(projectId)).toBeUndefined();
  });
});
