// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render, renderHook, waitFor } from '@testing-library/react';
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
const { mockToast } = vi.hoisted(() => ({
  mockToast:
    vi.fn<
      (message: string, options: { description?: string; action: { label: string; onClick: () => void } }) => void
    >(),
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: mockToast }));

const {
  backupByDefaultNotice,
  fetchCloudProjects,
  materializeOnSignIn,
  materializedCloudProjects,
  nextTauCloudStep,
  tauCloudIntent,
  useTauCloudIntent,
  useTauCloudIntentConnection,
} = await import('#hooks/use-cloud-projects.js');
type Eligibility = Parameters<typeof nextTauCloudStep>[1];
type TauCloudIntent = NonNullable<Parameters<typeof nextTauCloudStep>[0]>;

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
const status = (
  headRevisionId: string | undefined,
  kind: RemoteFacet['kind'] = 'none',
  phase: RemoteFacet['phase'] = 'none',
): RevisionStatusProjection => {
  const read: Pick<RevisionStatusProjection, 'headRevisionId' | 'remote'> = {
    headRevisionId,
    remote: remote(kind, phase),
  };
  return read as RevisionStatusProjection;
};

const entitled: Eligibility = { auth: 'authed', isResolved: true, canSyncFiles: true };
/* W8/D23: a Free account while the free-tier gate is closed. */
const gateClosedFree: Eligibility = { auth: 'authed', isResolved: true, canSyncFiles: false };

describe('nextTauCloudStep', () => {
  // ── D19: backup by default, announced before commitment ──────────────────
  it('should announce backup by default before anything else, even before the first revision', () => {
    expect(nextTauCloudStep('default', entitled, status(undefined))).toBe('announce');
    expect(nextTauCloudStep('default', entitled, status('rev-1'))).toBe('announce');
  });

  it('should connect a noticed project on an entitled account once its first revision exists', () => {
    expect(nextTauCloudStep('noticed', entitled, status('rev-1'))).toBe('connect');
  });

  it('should wait for the first revision before anything leaves the device', () => {
    expect(nextTauCloudStep('noticed', entitled, status(undefined))).toBe('wait');
  });

  it('should forget the intent for a Free account while the free-tier gate is closed', () => {
    expect(nextTauCloudStep('default', gateClosedFree, status('rev-1'))).toBe('forget');
    expect(nextTauCloudStep('noticed', gateClosedFree, status('rev-1'))).toBe('forget');
  });

  it('should wait for a signed-out account, so the project backs up once its person signs in', () => {
    expect(nextTauCloudStep('default', { ...entitled, auth: 'anonymous' }, status('rev-1'))).toBe('wait');
    expect(nextTauCloudStep('noticed', { ...entitled, auth: 'anonymous' }, status('rev-1'))).toBe('wait');
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
    expect(nextTauCloudStep('connected', entitled, status('rev-1'))).toBe('wait');
    expect(nextTauCloudStep(undefined, entitled, status('rev-1'))).toBe('wait');
  });

  // ── D20: materialized projects ───────────────────────────────────────────
  it('should connect a materialized project on its first open, before any revision', () => {
    expect(nextTauCloudStep('open', gateClosedFree, status(undefined))).toBe('connect');
  });

  it('should keep a materialized project owed until a person is signed in', () => {
    expect(nextTauCloudStep('open', { ...entitled, auth: 'anonymous' }, status(undefined))).toBe('wait');
    expect(nextTauCloudStep('open', { ...entitled, auth: 'indeterminate' }, status(undefined))).toBe('wait');
  });

  it('should keep a materialized project owed until Tau Cloud is connected', () => {
    expect(nextTauCloudStep('open', entitled, status(undefined, 'tau', 'connecting'))).toBe('wait');
    expect(nextTauCloudStep('open', entitled, status(undefined, 'tau', 'failed'))).toBe('wait');
    expect(nextTauCloudStep('open', entitled, status(undefined, 'tau', 'connected'))).toBe('forget');
  });
});

describe('backupByDefaultNotice', () => {
  it('should offer the opt-out before the first revision to an entitled account', () => {
    expect(backupByDefaultNotice('default', entitled, remote('none'))).toBe('pending');
    expect(backupByDefaultNotice('noticed', entitled, remote('none'))).toBe('pending');
  });

  it('should say nothing to an account that is not entitled', () => {
    expect(backupByDefaultNotice('default', gateClosedFree, remote('none'))).toBeUndefined();
  });

  it('should say the project is backed up once the default connection landed', () => {
    expect(backupByDefaultNotice('connected', entitled, remote('tau', 'connected'))).toBe('on');
  });

  it('should drop the line once the project was disconnected', () => {
    expect(backupByDefaultNotice('connected', entitled, remote('none'))).toBeUndefined();
    expect(backupByDefaultNotice('connected', entitled, remote('tau', 'disconnecting'))).toBeUndefined();
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

  it('should tell subscribers when another tab changes an intent', () => {
    const listener = vi.fn();
    const unsubscribe = tauCloudIntent.subscribe(listener);
    localStorage.setItem('tau:tau-cloud-intent:proj_aaaaaaaaaaaaaaaaaaaaa', 'connected');

    globalThis.dispatchEvent(
      new StorageEvent('storage', { key: 'tau:tau-cloud-intent:proj_aaaaaaaaaaaaaaaaaaaaa', newValue: 'connected' }),
    );

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('should forget an intent that was turned off', () => {
    tauCloudIntent.set('proj_aaaaaaaaaaaaaaaaaaaaa', 'connected');
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

describe('materializedCloudProjects', () => {
  it('should remember a project brought to this device, across a reload', () => {
    expect(materializedCloudProjects.has('proj_aaaaaaaaaaaaaaaaaaaaa')).toBe(false);

    materializedCloudProjects.add('proj_aaaaaaaaaaaaaaaaaaaaa');

    expect(materializedCloudProjects.has('proj_aaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(materializedCloudProjects.has('proj_bbbbbbbbbbbbbbbbbbbbb')).toBe(false);
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
  const disconnectRemote = vi.fn();
  const cancelRemote = vi.fn();
  const commands = { connectRemote, disconnectRemote, cancelRemote };
  const readRemote = (): RemoteFacet => remote('none');

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.assign(account, { auth: 'authed', isResolved: true, canSyncFiles: true });
  });

  function Connector({
    intent,
    head,
  }: {
    readonly intent: TauCloudIntent;
    readonly head: string | undefined;
  }): ReactNode {
    useTauCloudIntentConnection({ projectId, intent, status: status(head), readRemote, commands });
    return null;
  }

  /* As the project session does: the connector is mounted only while an intent is owed, read live. */
  function Session({ head }: { readonly head: string | undefined }): ReactNode {
    const intent = useTauCloudIntent(projectId);
    return intent === undefined || intent === 'connected' ? null : <Connector intent={intent} head={head} />;
  }

  const renderConnection = (head: string | undefined) => {
    const view = render(<Session head={head} />);
    return {
      rerender: ({ head: next }: { head: string | undefined }) => {
        view.rerender(<Session head={next} />);
      },
    };
  };

  // ── DESIGN: the opt-out is offered before commitment ─────────────────────
  it('should announce backup with a Turn off backup action when the project is first seen', async () => {
    tauCloudIntent.set(projectId, 'default');

    renderConnection(undefined);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledOnce();
    });
    const [message, options] = mockToast.mock.calls[0] ?? [];
    expect(message).toBe('Backs up to Tau Cloud automatically after your first save.');
    expect(options?.description).toBe('Stops backing up. The copy already on Tau Cloud stays.');
    expect(options?.action.label).toBe('Turn off backup');
    expect(tauCloudIntent.get(projectId)).toBe('noticed');
  });

  it('should never connect while the intent is default and unannounced', () => {
    tauCloudIntent.set(projectId, 'default');

    renderHook(() => {
      useTauCloudIntentConnection({ projectId, intent: 'default', status: status('rev-1'), readRemote, commands });
    });

    expect(connectRemote).not.toHaveBeenCalled();
    expect(tauCloudIntent.get(projectId)).toBe('noticed');
  });

  it('should connect nothing after Turn off backup is chosen from the toast', async () => {
    tauCloudIntent.set(projectId, 'default');
    const { rerender } = renderConnection(undefined);
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledOnce();
    });
    mockToast.mock.calls[0]?.[1].action.onClick();
    rerender({ head: 'rev-1' });

    expect(tauCloudIntent.get(projectId)).toBeUndefined();
    expect(connectRemote).not.toHaveBeenCalled();
    expect(disconnectRemote).not.toHaveBeenCalled();
  });

  // ── Acceptance 1: no Connect step on an entitled account ────────────────
  it('should connect Tau Cloud once after the first revision of a noticed project', () => {
    tauCloudIntent.set(projectId, 'noticed');
    const { rerender } = renderConnection(undefined);
    expect(connectRemote).not.toHaveBeenCalled();

    rerender({ head: 'rev-1' });
    rerender({ head: 'rev-1' });

    expect(connectRemote).toHaveBeenCalledOnce();
    expect(connectRemote).toHaveBeenCalledWith('tau');
    expect(tauCloudIntent.get(projectId)).toBe('connected');
  });

  it('should not repeat a step another tab already took', () => {
    tauCloudIntent.set(projectId, 'connected');

    renderHook(() => {
      useTauCloudIntentConnection({ projectId, intent: 'noticed', status: status('rev-1'), readRemote, commands });
    });

    expect(connectRemote).not.toHaveBeenCalled();
    expect(tauCloudIntent.get(projectId)).toBe('connected');
  });

  // ── Acceptance 1: gate closed ────────────────────────────────────────────
  it('should create nothing for a Free account while the D23 gate is closed', () => {
    account.canSyncFiles = false;
    tauCloudIntent.set(projectId, 'noticed');

    renderConnection('rev-1');

    expect(connectRemote).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    expect(tauCloudIntent.get(projectId)).toBeUndefined();
  });

  // ── D20: materialized projects ───────────────────────────────────────────
  it('should connect a materialized project on open and keep it owed until the connection lands', () => {
    tauCloudIntent.set(projectId, 'open');

    renderConnection(undefined);

    expect(connectRemote).toHaveBeenCalledWith('tau');
    expect(tauCloudIntent.get(projectId)).toBe('open');
  });

  it('should keep a materialized project owed, unconnected, while signed out', () => {
    account.auth = 'anonymous';
    tauCloudIntent.set(projectId, 'open');

    renderConnection(undefined);

    expect(connectRemote).not.toHaveBeenCalled();
    expect(tauCloudIntent.get(projectId)).toBe('open');
  });
});
