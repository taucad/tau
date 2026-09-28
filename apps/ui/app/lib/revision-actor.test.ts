/**
 * Who a revision is attributed to, and the pseudonym it hides behind (P29, A26,
 * EQ8, EQ10 option (a)).
 *
 * The pseudonym has to be stable for one person in one workspace on every
 * device, different in every other workspace, and different for two signed-out
 * devices — and it must derive from a salt nothing in the history records, so
 * that the workspace and every user id a clone can read recompute nothing
 * (L6-F10). A second device is a second host state, which is what clearing
 * `localStorage` stands in for.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deviceId } from '#lib/device-id.js';
import { githubNoreplyAuthor } from '#lib/github-project-binding.js';
import { revisionUserActor, useRevisionSalt } from '#lib/revision-actor.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- ENV/TAU_API_URL mirror the SCREAMING_SNAKE_CASE keys exported by the real environment.config module
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test.local/' } }));

/** A second device: a fresh host state, nothing shared with the first. */
const onAnotherDevice = (): void => {
  globalThis.localStorage.clear();
};

describe('revisionUserActor', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('gives two signed-out devices in one workspace two identities', () => {
    const first = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });
    onAnotherDevice();
    const second = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });

    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe('Anonymous');
    expect(first.anonymous).toBe(true);
    /* No mailbox: the identifying half is what an anonymous actor never carries. */
    expect(first.email).toBeUndefined();
  });

  it('keeps one device one identity in a workspace, and a different one in another', () => {
    const studio = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });
    const again = revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false });
    const other = revisionUserActor({ workspace: 'other', user: undefined, anonymous: false });

    expect(again.id).toBe(studio.id);
    expect(other.id).not.toBe(studio.id);
  });

  it('hides a signed-in person behind one pseudonym on every device and another in another workspace', () => {
    const person = { id: 'user-1', name: 'Lane Person' };
    /* What `GET /v1/revisions/salt` answers this account, per workspace. */
    const studioSalt = 'a'.repeat(64);
    const workshopSalt = 'b'.repeat(64);
    const first = revisionUserActor({ workspace: 'studio', user: person, anonymous: true, salt: studioSalt });
    onAnotherDevice();
    const second = revisionUserActor({ workspace: 'studio', user: person, anonymous: true, salt: studioSalt });
    const elsewhere = revisionUserActor({ workspace: 'workshop', user: person, anonymous: true, salt: workshopSalt });

    /* Anonymity hides *who*, not *where from*: one person is one Anonymous in a
     * workspace however many devices they record from. */
    expect(first.id).toBe(second.id);
    expect(elsewhere.id).not.toBe(first.id);
    expect(first.id).not.toBe(revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false }).id);
  });

  /* L6-F10: the pseudonym used to be a pure function of the workspace and the
   * user id, both of which a clone can read. It now moves with a salt the
   * history never records, so the same readable pair gives no fixed answer. */
  it('derives the pseudonym from the salt, not from anything a revision records', () => {
    const person = { id: 'user-1', name: 'Lane Person' };
    const actor = revisionUserActor({ workspace: 'studio', user: person, anonymous: true, salt: 'c'.repeat(64) });
    const otherSalt = revisionUserActor({ workspace: 'studio', user: person, anonymous: true, salt: 'd'.repeat(64) });

    expect(otherSalt.id).not.toBe(actor.id);
    expect(actor).toStrictEqual({ kind: 'user', id: actor.id, name: 'Anonymous', anonymous: true });
    expect(JSON.stringify(actor)).not.toContain('user-1');
  });

  it('stands in with this device’s own salt until the account’s salt arrives, never the device id', () => {
    const person = { id: 'user-1', name: 'Lane Person' };
    const waiting = revisionUserActor({ workspace: 'studio', user: person, anonymous: true });

    expect(waiting.id).toBe(revisionUserActor({ workspace: 'studio', user: undefined, anonymous: false }).id);
    expect(globalThis.localStorage.getItem('tau-revision-salt:studio')).not.toContain(deviceId());
  });

  it('records the signed-in person, without an account address, when anonymity is off (D33)', () => {
    const actor = revisionUserActor({
      workspace: 'studio',
      user: { id: 'user-1', name: 'Lane Person' },
      anonymous: false,
    });

    /* The git author falls back to `user-1@users.noreply.tau.new`. */
    expect(actor).toStrictEqual({ kind: 'user', id: 'user-1', name: 'Lane Person' });
  });

  it('authors a GitHub-linked project with the no-reply identity and keeps the Tau user id (D33)', () => {
    const person = { id: 'user-1', name: 'Lane Person' };
    const commitIdentity = githubNoreplyAuthor(42, 'lane');

    expect(revisionUserActor({ workspace: 'studio', user: person, anonymous: false, commitIdentity })).toStrictEqual({
      kind: 'user',
      id: 'user-1',
      name: 'lane',
      email: '42+lane@users.noreply.github.com',
    });
    /* Anonymity still wins: no address of any kind is recorded. */
    expect(
      revisionUserActor({ workspace: 'studio', user: person, anonymous: true, commitIdentity }).email,
    ).toBeUndefined();
  });

  it('keeps one device id across reads', () => {
    const first = deviceId();
    expect(deviceId()).toBe(first);
  });
});

describe('useRevisionSalt', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalThis.localStorage.clear();
    fetchMock = vi.fn(async () => Response.json({ salt: 'e'.repeat(64) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches the account’s salt once, with the session, and keeps it in host state', async () => {
    const { result } = renderHook(() => useRevisionSalt({ workspace: 'my studio', userId: 'user-1' }));

    await waitFor(() => {
      expect(result.current).toBe('e'.repeat(64));
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test.local/v1/revisions/salt?workspace=my%20studio');
    expect(init.credentials).toBe('include');

    /* A later mount reads host state rather than asking again. */
    const again = renderHook(() => useRevisionSalt({ workspace: 'my studio', userId: 'user-1' }));
    expect(again.result.current).toBe('e'.repeat(64));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /* Coordinator ruling (EQ10): fetched on sign-in, not when anonymity is
     turned on, so the first anonymous revision already has it. */
  it('fetches as soon as a signed-in document opens a workspace, and asks nothing signed out', async () => {
    renderHook(() => useRevisionSalt({ workspace: 'quiet', userId: undefined }));
    expect(fetchMock).not.toHaveBeenCalled();

    const { result } = renderHook(() => useRevisionSalt({ workspace: 'quiet', userId: 'user-1' }));
    await waitFor(() => {
      expect(result.current).toBe('e'.repeat(64));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
