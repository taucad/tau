import { describe, expect, it } from 'vitest';
import type { RevisionIdentity, RevisionProvenance, RevisionTrigger, RevisionVia } from '#revision-authority.js';
import {
  parseRevisionCommitMessage,
  parseRevisionTagMessage,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  tagTrailerPrefix,
  tauNoreplyAccountOf,
  unrecordedAuthorOf,
} from '#revision-headers.js';
import type { RevisionTrailer } from '#revision-headers.js';

const createdAt = Date.UTC(2026, 10, 11, 9, 30, 0);
const person = { kind: 'user', id: 'usr_ada', name: 'Ada Lovelace' } as const;
const anonymous = { kind: 'user', id: 'anon:3fa9c1d2', name: 'Anonymous', anonymous: true } as const;

/* Every identity kind a capture can record (B1): a person, an anonymous person, and an agent for each. */
const identities: ReadonlyArray<readonly [string, RevisionIdentity]> = [
  ['a person', person],
  ['an anonymous person', anonymous],
  ['an agent for a person', { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: person }],
  ['an agent for an anonymous person', { kind: 'agent', id: 'agent', runId: 'run-2', onBehalfOf: anonymous }],
];

const captures: readonly RevisionTrigger[] = [
  'turn',
  'save',
  'idle',
  'hidden',
  'close',
  'merge',
  'restore',
  'switch',
  'create',
  'import',
];
const legs: readonly RevisionVia[] = ['browser', 'desktop', 'cli', 'serve', 'cloud'];

const trailerOf = (provenance: RevisionProvenance): RevisionTrailer => ({
  parents: ['a'.repeat(40)],
  provenance,
  summary: { generated: 'Saved changes' },
});

/** The JSON a commit message carries on its last `Tau-Metadata` line. */
const recordOf = (message: string): unknown =>
  JSON.parse(
    message
      .split('\n')
      .findLast((line) => line.startsWith('Tau-Metadata: '))!
      .slice('Tau-Metadata: '.length),
  );

/** A message whose record is replaced, to read what a writer other than this one left. */
const messageWith = (record: unknown): string => `Saved changes\n\nTau-Metadata: ${JSON.stringify(record)}\n`;

const written = (): Record<string, unknown> =>
  recordOf(
    revisionCommitMessage(trailerOf({ source: 'user', actor: person, capture: 'save', via: 'browser', createdAt })),
  ) as Record<string, unknown>;

describe('the commit trailer, version 2 (B1)', () => {
  describe.each(identities)('round-trips %s', (_label, actor) => {
    it.each(captures)('under the %s capture', (capture) => {
      const provenance: RevisionProvenance = {
        source: actor.kind === 'agent' ? 'agent' : 'user',
        actor,
        capture,
        via: 'browser',
        ...(actor.kind === 'agent' ? { runId: actor.runId, attempt: 0, turnCut: 'result', turnId: 'turn-1' } : {}),
        createdAt,
      };

      const message = revisionCommitMessage(trailerOf(provenance));

      expect(parseRevisionCommitMessage(message)).toStrictEqual(trailerOf(provenance));
      expect(recordOf(message)).toMatchObject({ version: 2, provenance: { actor, capture, via: 'browser' } });
    });
  });

  it.each(legs)('round-trips the %s leg', (via) => {
    const provenance: RevisionProvenance = { source: 'user', actor: person, capture: 'save', via, createdAt };

    expect(parseRevisionCommitMessage(revisionCommitMessage(trailerOf(provenance)))?.provenance.via).toBe(via);
  });

  it('round-trips a restore and the leases a cut held', () => {
    const provenance: RevisionProvenance = {
      source: 'restore',
      actor: person,
      capture: 'restore',
      via: 'desktop',
      heldRunIds: ['run-a', 'run-b'],
      restoredFrom: 'b'.repeat(40),
      createdAt,
    };

    expect(parseRevisionCommitMessage(revisionCommitMessage(trailerOf(provenance)))).toStrictEqual(
      trailerOf(provenance),
    );
  });

  it('writes the same bytes for one identity whatever order its object was built in', () => {
    const reordered = { name: 'Ada Lovelace', id: 'usr_ada', kind: 'user' } as const;
    const left = revisionCommitMessage(
      trailerOf({ source: 'user', actor: person, capture: 'save', via: 'browser', createdAt }),
    );
    const right = revisionCommitMessage(
      trailerOf({ createdAt, via: 'browser', capture: 'save', actor: reordered, source: 'user' }),
    );

    expect(right).toBe(left);
  });

  it('writes no actor id of its own beside the identity', () => {
    const { provenance } = written() as { provenance: Record<string, unknown> };

    expect(Object.keys(provenance)).toStrictEqual(['source', 'actor', 'capture', 'via', 'createdAt']);
  });

  it('names who and why in the readable trailers stock git log shows', () => {
    const agent = { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: person } as const;
    const message = revisionCommitMessage(
      trailerOf({ source: 'agent', actor: agent, capture: 'turn', via: 'cloud', runId: 'run-1', createdAt }),
    );

    expect(message).toContain('\nTau-Actor: agent agent run run-1 for Ada Lovelace\n');
    expect(message).toContain('\nTau-Trigger: turn\n');
  });

  describe('reads nothing but version 2 (I7)', () => {
    it('reads a version 1 record as a commit Tau did not record', () => {
      const legacy = {
        version: 1,
        parents: [],
        provenance: { source: 'user', actorId: 'usr_ada', actor: person, trigger: 'save', createdAt },
        summary: { generated: 'Saved changes' },
      };

      expect(parseRevisionCommitMessage(messageWith(legacy))).toBeUndefined();
    });

    it.each(['actor', 'capture', 'via'])('reads a record with no %s as a commit Tau did not record', (field) => {
      const record = written();
      const provenance = Object.fromEntries(
        Object.entries(record['provenance'] as Record<string, unknown>).filter(([key]) => key !== field),
      );

      expect(parseRevisionCommitMessage(messageWith({ ...record, provenance }))).toBeUndefined();
    });

    it('reads an agent that names no person as a commit Tau did not record', () => {
      const record = written();
      const provenance = {
        ...(record['provenance'] as Record<string, unknown>),
        actor: { kind: 'agent', id: 'agent', runId: 'run-1' },
      };

      expect(parseRevisionCommitMessage(messageWith({ ...record, provenance }))).toBeUndefined();
    });

    it('reads an identity with an empty id as a commit Tau did not record', () => {
      const record = written();
      const provenance = { ...(record['provenance'] as Record<string, unknown>), actor: { kind: 'user', id: '' } };

      expect(parseRevisionCommitMessage(messageWith({ ...record, provenance }))).toBeUndefined();
    });

    it('reads a commit with no trailer as one Tau did not record', () => {
      expect(parseRevisionCommitMessage('Initial commit\n')).toBeUndefined();
    });
  });
});

describe('the commit signatures', () => {
  it('authors a person by name under the Tau no-reply address, and commits as Tau', () => {
    const provenance: RevisionProvenance = {
      source: 'user',
      actor: person,
      capture: 'save',
      via: 'browser',
      createdAt,
    };

    expect(revisionAuthorSignature(provenance)).toStrictEqual({
      name: 'Ada Lovelace',
      email: 'usr_ada@users.noreply.tau.new',
      seconds: createdAt / 1000,
      offsetMinutes: 0,
    });
    expect(revisionCommitterSignature(provenance)).toMatchObject({ name: 'Tau', email: 'noreply@tau.new' });
  });

  it('authors an agent turn as the person it ran for, never the model', () => {
    const provenance: RevisionProvenance = {
      source: 'agent',
      actor: { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: anonymous },
      capture: 'turn',
      via: 'browser',
      createdAt,
    };

    expect(revisionAuthorSignature(provenance)).toMatchObject({
      name: 'Anonymous',
      email: 'anon:3fa9c1d2@users.noreply.tau.new',
    });
  });
});

describe('a commit made with git', () => {
  it('reads the account a Tau no-reply author address names, and nothing from any other address', () => {
    expect(tauNoreplyAccountOf('usr_ada@users.noreply.tau.new')).toBe('usr_ada');
    for (const email of [
      'ada@example.com',
      'noreply@tau.new',
      '@users.noreply.tau.new',
      'anon:3fa9c1d2@users.noreply.tau.new',
      'a@b@users.noreply.tau.new',
      'usr_ada@users.noreply.tau.new.example.com',
    ]) {
      expect(tauNoreplyAccountOf(email), email).toBeUndefined();
    }
  });

  it('names the git author, and the account only for a Tau no-reply address', () => {
    expect(unrecordedAuthorOf({ author: { name: 'Ada', email: 'usr_ada@users.noreply.tau.new' } })).toStrictEqual({
      authorName: 'Ada',
      authorAccountId: 'usr_ada',
    });
    expect(unrecordedAuthorOf({ author: { name: 'Octo', email: 'octo@example.com' } })).toStrictEqual({
      authorName: 'Octo',
    });
  });
});

describe('the version tag trailer (B6)', () => {
  const actor = { kind: 'user', id: 'user_1', name: 'Ada' } as const;
  const id = '0123456789abcdef0123456789abcdef';

  it('records the id and the free-text name beside the note and the actor, and reads them back', () => {
    const message = revisionTagMessage({ id, name: 'Ready for print', note: 'Lid fit', actor });
    expect(message).toBe(
      `Lid fit\n\n${tagTrailerPrefix}{"version":2,"id":"${id}","name":"Ready for print","note":"Lid fit","actor":{"kind":"user","id":"user_1","name":"Ada"}}\n`,
    );
    expect(parseRevisionTagMessage(message)).toStrictEqual({ id, name: 'Ready for print', note: 'Lid fit', actor });
  });

  it('titles a version with no note by its name, spaces and all', () => {
    const message = revisionTagMessage({ id, name: 'Ready for print', note: undefined, actor: undefined });
    expect(message.split('\n')[0]).toBe('Ready for print');
    expect(parseRevisionTagMessage(message)).toStrictEqual({
      id,
      name: 'Ready for print',
      note: undefined,
      actor: undefined,
    });
  });

  it.each([
    ['a tag Tau did not write', 'Release one\n\nNotes.\n'],
    ['a lightweight tag', undefined],
    ['a record without its id (I7)', `Lid\n\n${tagTrailerPrefix}{"version":2,"name":"Lid"}\n`],
    ['a record with a malformed id', `Lid\n\n${tagTrailerPrefix}{"version":2,"id":"ABC","name":"Lid"}\n`],
    ['a record with an empty name', `Lid\n\n${tagTrailerPrefix}{"version":2,"id":"${id}","name":""}\n`],
    ['a trailer of another version (I7)', `Lid fit\n\n${tagTrailerPrefix}{"version":1,"note":"Lid fit","number":3}\n`],
    ['a trailer that is not JSON', `Lid\n\n${tagTrailerPrefix}{version\n`],
  ])('reads no version from %s', (_label, message) => {
    expect(parseRevisionTagMessage(message)).toBeUndefined();
  });

  it('reads the last Tau-Tag line, as the server does', () => {
    const message = `Lid\n\n${tagTrailerPrefix}{"version":2,"id":"${id}","name":"A"}\n${tagTrailerPrefix}{"version":2,"id":"${id}","name":"B"}\n`;
    expect(parseRevisionTagMessage(message)?.name).toBe('B');
  });
});
