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

import { deviceId } from '@taucad/ui-core/lib/device-id';
import { githubNoreplyAuthor } from '@taucad/ui-core/lib/github-project-binding';
import { revisionUserActor, revisionWho, useRevisionSalt } from '#lib/revision-actor.js';
import type { RevisionRowWho } from '@taucad/revisions';
import type { RevisionPushRecord, RevisionWhoContext, RevisionWhoEntry } from '#lib/revision-actor.js';

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

describe('revisionWho', () => {
  const ada = { id: 'user-ada', name: 'Ada' };
  const solo: RevisionWhoContext = { session: ada, pushRecord: undefined, showAnonymousId: false };
  /* B2: a row's who is typed. A bare id is a person Tau recorded under it; a pseudonym says so by its flag, never its prefix. */
  const recorded = (id: string, anonymous?: true): RevisionRowWho => ({
    kind: 'recorded',
    identity: { kind: 'user', id, ...(anonymous === undefined ? {} : { anonymous }) },
  });
  const pseudonym = (id: string): RevisionRowWho => recorded(id, true);
  const entry = (who: RevisionRowWho | string, source = 'user'): RevisionWhoEntry => ({
    revisionId: 'rev-1',
    who: typeof who === 'string' ? recorded(who) : who,
    source,
  });
  /* A3's slot: the record names who pushed each entry. */
  const pushedBy =
    (accountId: string, name: string): RevisionPushRecord['pushedBy'] =>
    () => ({ kind: 'account', accountId, name });
  const directory = new Map([
    [ada.id, 'Ada'],
    ['user-maya', 'Maya'],
  ]);
  const shared = (pushes?: RevisionPushRecord['pushedBy']): RevisionWhoContext => ({
    ...solo,
    pushRecord: { pushedBy: pushes ?? (() => undefined), memberName: (id) => directory.get(id), memberCount: 2 },
  });

  it('names an agent result Agent, never the model id', () => {
    expect(revisionWho(entry('claude-opus-4', 'agent'), solo)).toEqual({ line: 'Agent', isYou: false, isAgent: true });
    expect(revisionWho(entry('claude-opus-4', 'agent'), shared()).line).toBe('Agent');
  });

  it('reads L1–L4 as the signed-in person or no name on a single-person project', () => {
    for (const actor of ['prj_1', 'tau-host', 'richard', 'maker@example.com']) {
      expect(revisionWho(entry(actor), solo)).toEqual({ line: '', isYou: false, isAgent: false });
    }
    /* What an older build wrote reads as a commit Tau did not record (B1), and names no one. */
    expect(revisionWho(entry({ kind: 'unrecorded' }), solo).line).toBe('');
    expect(revisionWho(entry(ada.id), solo)).toEqual({ line: '', isYou: true, isAgent: false });
  });

  /* B2: who is read by type. An agent's base cut is its person's; no id is matched against a known fallback. */
  it('reads the person an agent ran for, and matches no fallback id', () => {
    const forAda: RevisionRowWho = {
      kind: 'recorded',
      identity: { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: { kind: 'user', id: ada.id } },
    };
    expect(revisionWho(entry(forAda), shared())).toEqual({ line: 'You', isYou: true, isAgent: false });
    expect(revisionWho(entry('tau-host'), shared()).line).toBe('');
    expect(revisionWho(entry('prj_1'), shared()).line).toBe('');
  });

  it('shows no name for an entry made on this device while signed out', () => {
    expect(revisionWho(entry(ada.id), { ...solo, session: undefined })).toEqual({
      line: '',
      isYou: false,
      isAgent: false,
    });
  });

  it('names a shared project entry made here You, and guesses no name from a recorded id (Q2)', () => {
    expect(revisionWho(entry(ada.id), shared()).line).toBe('You');
    expect(revisionWho(entry('richard'), shared()).line).toBe('');
  });

  it('prefers the account that pushed an entry over whatever its trailer recorded (I2)', () => {
    expect(revisionWho(entry('richard'), shared(pushedBy('user-maya', 'Maya')))).toEqual({
      line: 'Maya',
      isYou: false,
      isAgent: false,
    });
    expect(revisionWho(entry('user-sam'), shared(pushedBy(ada.id, 'Ada'))).line).toBe('You');
    /* One member: the pushing account is you, and the row shows no who line. */
    expect(
      revisionWho(entry('richard'), {
        ...solo,
        pushRecord: { pushedBy: pushedBy(ada.id, 'Ada'), memberName: () => undefined, memberCount: 1 },
      }),
    ).toEqual({ line: '', isYou: true, isAgent: false });
  });

  it('reads a pseudonym as Anonymous, with its hash only behind the debug setting (Q3)', () => {
    expect(revisionWho(entry(pseudonym('anon:3fa9c1')), solo).line).toBe('Anonymous');
    expect(revisionWho(entry(pseudonym('anon:3fa9c1')), { ...solo, showAnonymousId: true }).line).toBe(
      'Anonymous · 3fa9c1',
    );
  });

  it('names a commit Tau did not write by its author, and nothing else by a guess', () => {
    expect(revisionWho(entry({ kind: 'unrecorded', authorName: 'octo-dev' }, 'import'), solo).line).toBe('octo-dev');
    expect(revisionWho(entry({ kind: 'unrecorded' }, 'import'), solo).line).toBe('');
    expect(revisionWho(entry('usr_another_account'), solo).line).toBe('');
    /* A pseudonym is told by its flag: an id that only looks like one is a person's id. */
    expect(revisionWho(entry('anon:3fa9c1'), solo).line).toBe('');
  });

  /* A commit made with git under a person's Tau no-reply address names that person, and says how it was made. */
  it('names a commit made with git under a Tau no-reply address as its person, made with git, on every project', () => {
    const git = (authorAccountId: string, authorName = 'Ada Lovelace'): RevisionWhoEntry =>
      entry({ kind: 'unrecorded', authorName, authorAccountId }, 'import');
    /* Unlike Tau's own entries, a single-person project still names its person beside the mark. */
    expect(revisionWho(git(ada.id), solo)).toEqual({ line: 'You · made with git', isYou: true, isAgent: false });
    expect(revisionWho(git(ada.id), shared()).line).toBe('You · made with git');
    /* Not backed up yet and not this session's: the directory's name, else the git author's. */
    expect(revisionWho(git('user-maya'), shared()).line).toBe('Maya · made with git');
    expect(revisionWho(git('user-sam', 'Sam'), solo)).toEqual({
      line: 'Sam · made with git',
      isYou: false,
      isAgent: false,
    });
    /* Backed up by the account it names: the server checked the address, so the pusher's name. */
    expect(revisionWho(git('user-maya'), shared(pushedBy('user-maya', 'Maya')))).toEqual({
      line: 'Maya · made with git',
      isYou: false,
      isAgent: false,
    });
    expect(revisionWho(git(ada.id), shared(pushedBy(ada.id, 'Ada'))).isYou).toBe(true);
  });

  it('does not take a pushed commit’s address over the account that pushed it', () => {
    const git: RevisionWhoEntry = entry(
      { kind: 'unrecorded', authorName: 'Maya', authorAccountId: 'user-maya' },
      'import',
    );
    /* A linked project takes commits without the address check: the pusher is who the server authenticated. */
    expect(revisionWho(git, shared(pushedBy('user-bea', 'Bea'))).line).toBe('Bea');
    expect(
      revisionWho(
        git,
        shared(() => ({ kind: 'anonymous' })),
      ).line,
    ).toBe('Anonymous');
    /* A commit with any other address still reads as its git author, unmarked. */
    expect(revisionWho(entry({ kind: 'unrecorded', authorName: 'octo-dev' }, 'import'), solo).line).toBe('octo-dev');
  });

  /* Blueprint A3 acceptance: on a one-member project every pushed entry is that member's, whatever its trailer says. */
  it('resolves root, prj_x, tau-host and a forged Tau-Actor on a one-member project to that member', () => {
    const one: RevisionWhoContext = {
      ...solo,
      pushRecord: {
        pushedBy: pushedBy(ada.id, 'Ada'),
        memberName: (id) => (id === ada.id ? 'Ada' : undefined),
        memberCount: 1,
      },
    };
    for (const actor of ['root', 'prj_x', 'tau-host', 'user-forged']) {
      expect(revisionWho(entry(actor), one), actor).toEqual({ line: '', isYou: true, isAgent: false });
    }
    /* Read by someone else signed in, the member is still the one named, never the trailer. */
    expect(revisionWho(entry('user-forged'), { ...one, session: { id: 'user-other' } }).isYou).toBe(false);
  });

  it('shows the account that pushed an entry recorded as another member, with recorded as beside it', () => {
    expect(revisionWho(entry('user-maya'), shared(pushedBy('user-bea', 'Bea')))).toEqual({
      line: 'Bea · recorded as Maya',
      isYou: false,
      isAgent: false,
    });
    expect(revisionWho(entry(ada.id), shared(pushedBy('user-maya', 'Maya'))).line).toBe('Maya · recorded as You');
    /* Never folded away on a single-person read either. */
    expect(
      revisionWho(entry('user-maya'), {
        ...solo,
        pushRecord: { pushedBy: pushedBy(ada.id, 'Ada'), memberName: (id) => directory.get(id), memberCount: 1 },
      }).line,
    ).toBe('You · recorded as Maya');
  });

  it('reads a push the server withholds as Anonymous, and the owner reads the account recorded as Anonymous (Q3)', () => {
    expect(
      revisionWho(
        entry(pseudonym('anon:3fa9c1')),
        shared(() => ({ kind: 'anonymous' })),
      ).line,
    ).toBe('Anonymous');
    expect(
      revisionWho(
        entry(pseudonym('anon:3fa9c1')),
        shared(() => ({ kind: 'account', accountId: 'user-maya', name: 'Maya', recordedAnonymous: true })),
      ),
    ).toEqual({ line: 'Maya · recorded as Anonymous', isYou: false, isAgent: false });
    /* A pseudonym the record did not mark for the owner stays a pseudonym. */
    expect(revisionWho(entry(pseudonym('anon:3fa9c1')), shared(pushedBy('user-maya', 'Maya'))).line).toBe('Anonymous');
  });

  it('says a host device pushed it, on a line that names someone', () => {
    const viaHost: RevisionPushRecord['pushedBy'] = () => ({
      kind: 'account',
      accountId: 'user-maya',
      name: 'Maya',
      viaDevice: true,
    });
    expect(revisionWho(entry('tau-host'), shared(viaHost)).line).toBe('Maya · by a cloud agent host');
    expect(
      revisionWho(
        entry(pseudonym('anon:1')),
        shared(() => ({ kind: 'anonymous', viaDevice: true })),
      ).line,
    ).toBe('Anonymous · by a cloud agent host');
    expect(
      revisionWho(entry('tau-host'), {
        ...solo,
        pushRecord: {
          pushedBy: () => ({ kind: 'account', accountId: ada.id, name: 'Ada', viaDevice: true }),
          memberName: () => undefined,
          memberCount: 1,
        },
      }).line,
    ).toBe('');
  });

  it('keeps an agent result Agent whoever pushed it', () => {
    expect(revisionWho(entry('claude-opus-4', 'agent'), shared(pushedBy('user-maya', 'Maya'))).line).toBe('Agent');
  });
});
