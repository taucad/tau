// @vitest-environment jsdom
/**
 * The early open's real cloud-open port (STO-25 SP6 review): `continueOpen` sends `connectRemote` for the project's
 * Tau remote through the client's command surface and holds the open (`holdCloudOpen`) until the gesture's end aborts
 * it, after which the hold, and the open in flight, are let go.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import type { RevisionClient } from '@taucad/revisions-ui/types/revision-client.types';

vi.mock('#environment.config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  /* eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names. */
  ENV: { TAU_API_URL: 'https://api.test' },
  requireClientEnvironmentUrl: () => 'https://api.test',
}));

const { setRevisionSessionUser } = await import('@taucad/revisions-ui/lib/revision-actor');
const { tauCloudIntent } = await import('#lib/tau-cloud-intent.js');
const { cloudOpenContinuationTestApi, continueCloudOpen } = await import('#hooks/use-cloud-projects.js');
const { revisionClientTestApi } = await import('#hooks/use-revision-status.js');
const { createSessionRevisionsAheadPorts } = await import('#runtime/session-revisions.js');

const projectId = 'prj_aheadport0000000000000';
const worker = { name: 'shared-worker' } as unknown as Worker;

beforeEach(() => {
  setRevisionSessionUser({ id: 'usr_ada', name: 'Ada' });
  tauCloudIntent.set(projectId, 'open');
});

afterEach(() => {
  tauCloudIntent.set(projectId, undefined);
  setRevisionSessionUser(undefined);
  revisionClientTestApi.reset();
  cloudOpenContinuationTestApi.reset();
});

describe('the early open’s cloud-open port (STO-25 SP6)', () => {
  it('connects the Tau remote, holds the open, and lets it go when the gesture’s end aborts it', async () => {
    const sent: Array<Readonly<{ command: string; kind?: string; url?: string }>> = [];
    const listeners = new Set<() => void>();
    /* Opened, with the root's first answer: the early open continues only from there. */
    let status: RevisionStatusProjection | undefined = {
      remote: { kind: 'none', phase: 'none' },
      sync: { state: 'checking' },
    } as unknown as RevisionStatusProjection;
    const client = {
      status: () => status,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      send: (command: Readonly<{ command: string; kind?: string; url?: string }>) => {
        sent.push(command);
        /* The root takes the remote and starts fetching: the open is under way, not landed. */
        status = {
          remote: { kind: 'tau', phase: 'connecting' },
          sync: { state: 'checking', pullPhase: 'fetching' },
        } as unknown as RevisionStatusProjection;
        for (const listener of listeners) {
          listener();
        }
      },
      remoteCredential: () => undefined,
    } as unknown as RevisionClient;
    revisionClientTestApi.adopt(projectId, worker, client);
    const { continueOpen } = createSessionRevisionsAheadPorts((error) => {
      throw error;
    }).cloudOpen;
    const ended = new AbortController();

    const held = continueOpen!({ projectId, account: 'usr_ada', client, asserted: true, signal: ended.signal });
    await vi.waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]).toMatchObject({ command: 'connectRemote', kind: 'tau' });
    expect(sent[0]?.url).toContain(projectId);
    /* Held until the open lands; the gesture's end lets it go first. */
    const pending = Symbol('pending');
    expect(await Promise.race([held, Promise.resolve(pending)])).toBe(pending);
    ended.abort();
    await held;

    /* Nothing is held any more: the next caller opens at once. It stands down only for an open still in flight. */
    const connect = vi.fn(async () => {
      status = {
        remote: { kind: 'tau', phase: 'connected' },
        sync: { hasAppliedRemote: true },
      } as unknown as RevisionStatusProjection;
    });
    expect(await continueCloudOpen({ projectId, account: 'usr_ada', connect, asserted: true })).toBe(true);
    expect(connect).toHaveBeenCalledOnce();
  });
});
