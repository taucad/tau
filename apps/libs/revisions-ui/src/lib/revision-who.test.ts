/**
 * Who made a revision entry, as History, the chat marker, the agent's tool card
 * and the arrival sentence show it (I2, A3, B2, Q2, Q3), and the resolver's view
 * of a joined push store.
 */

import { describe, expect, it } from 'vitest';
import type { RevisionRowWho } from '@taucad/revisions';
import { revisionPushRecordOf, revisionWho } from '#lib/revision-who.js';
import type { RevisionPushRecord, RevisionWhoContext, RevisionWhoEntry } from '#lib/revision-who.js';
import type { PushEntry, PushRecordSnapshot } from '#types/revision-push.types.js';

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
    expect(revisionWho(git(ada.id), shared())).toEqual({ line: 'You · made with git', isYou: true, isAgent: false });
    /* The push record unread: the address claims no account yet, so the git author's name. */
    expect(revisionWho(git(ada.id), solo)).toEqual({
      line: 'Ada Lovelace · made with git',
      isYou: false,
      isAgent: false,
    });
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
    /* A host device pushed it: the placement stays beside the mark. */
    expect(
      revisionWho(
        git('user-maya'),
        shared(() => ({ kind: 'account', accountId: 'user-maya', name: 'Maya', viaDevice: true })),
      ).line,
    ).toBe('Maya · made with git · by a cloud agent');
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
    expect(revisionWho(entry('tau-host'), shared(viaHost)).line).toBe('Maya · by a cloud agent');
    expect(
      revisionWho(
        entry(pseudonym('anon:1')),
        shared(() => ({ kind: 'anonymous', viaDevice: true })),
      ).line,
    ).toBe('Anonymous · by a cloud agent');
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

describe('revisionPushRecordOf', () => {
  const push = (pusher: PushEntry['pusher'], extra: Partial<PushEntry> = {}): PushEntry => ({
    generation: 1,
    pusher,
    viaDevice: false,
    tips: [],
    ...extra,
  });
  const snapshot = (pushes: ReadonlyMap<string, PushEntry>): PushRecordSnapshot => ({
    pushOf: (revisionId) => pushes.get(revisionId),
    nameOf: (accountId) => (accountId === 'user-maya' ? 'Maya' : undefined),
    isNamed: (accountId) => accountId === 'user-maya',
    memberCount: 2,
  });

  it('names the pusher by the record, then the directory, then not at all', () => {
    const record = revisionPushRecordOf(
      snapshot(
        new Map([
          ['rev-named', push({ kind: 'account', accountId: 'user-bea', name: 'Bea' })],
          ['rev-directory', push({ kind: 'account', accountId: 'user-maya' })],
          ['rev-unnamed', push({ kind: 'account', accountId: 'user-sam' })],
        ]),
      ),
    );

    expect(record.pushedBy('rev-named')).toStrictEqual({ kind: 'account', accountId: 'user-bea', name: 'Bea' });
    expect(record.pushedBy('rev-directory')).toStrictEqual({ kind: 'account', accountId: 'user-maya', name: 'Maya' });
    expect(record.pushedBy('rev-unnamed')).toStrictEqual({ kind: 'account', accountId: 'user-sam', name: '' });
    expect(record.pushedBy('rev-never-pushed')).toBeUndefined();
  });

  it('carries the anonymous mark and a host device push, and withholds an anonymous pusher', () => {
    const record = revisionPushRecordOf(
      snapshot(
        new Map([
          ['rev-owner', push({ kind: 'account', accountId: 'user-maya' }, { anonymous: true, viaDevice: true })],
          ['rev-member', push({ kind: 'anonymous' }, { viaDevice: true })],
          ['rev-plain', push({ kind: 'anonymous' })],
        ]),
      ),
    );

    expect(record.pushedBy('rev-owner')).toStrictEqual({
      kind: 'account',
      accountId: 'user-maya',
      name: 'Maya',
      recordedAnonymous: true,
      viaDevice: true,
    });
    expect(record.pushedBy('rev-member')).toStrictEqual({ kind: 'anonymous', viaDevice: true });
    expect(record.pushedBy('rev-plain')).toStrictEqual({ kind: 'anonymous' });
  });

  it('reads member names and the member count from the snapshot', () => {
    const record = revisionPushRecordOf(snapshot(new Map()));

    expect(record.memberName('user-maya')).toBe('Maya');
    expect(record.memberName('user-sam')).toBeUndefined();
    expect(record.memberCount).toBe(2);
  });
});
