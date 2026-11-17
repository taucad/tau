import { describe, expect, it } from 'vitest';
import type {
  RevisionActor,
  RevisionIdentity,
  RevisionProvenance,
  RevisionTrigger,
  RevisionUserActor,
  RevisionVia,
} from '#revision-authority.js';
import {
  parseRevisionCommitMessage,
  parseRevisionTagMessage,
  revisionAuthorSignature,
  revisionCommitMessage,
  revisionCommitterSignature,
  revisionTagMessage,
  taggerSignature,
  tagTrailerPrefix,
  tauNoreplyAccountOf,
  unrecordedAuthorOf,
} from '#revision-headers.js';
import type { RevisionCommitAuthor, RevisionTrailer } from '#revision-headers.js';

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

/*
 * I3 by construction (audit N4): no address of a person enters a Tau identity
 * record. The type has no field for one, the readers refuse a record that
 * carries one (I7: no reader for that shape), the writers copy only the fields
 * a record has, and a linked forge's no-reply address reaches the git author
 * line alone, as its own input.
 */
describe('no address enters an identity record (I3)', () => {
  const linked: RevisionCommitAuthor = { name: 'octo', email: '42+octo@users.noreply.github.com' };
  const withAddress = { kind: 'user', id: 'usr_ada', name: 'Ada Lovelace', email: 'ada@example.com' };

  it('has no field to type an address into a person, an agent’s person or a version’s actor', () => {
    // @ts-expect-error -- I3: a person has no address field, written out or spread in.
    const spread: RevisionUserActor = { kind: 'user', id: 'usr_ada', ...linked };
    // @ts-expect-error -- I3: a person has no address field.
    const literal: RevisionUserActor = { kind: 'user', id: 'usr_ada', email: 'ada@example.com' };
    const agent: RevisionIdentity = {
      kind: 'agent',
      id: 'agent',
      runId: 'run-1',
      // @ts-expect-error -- I3: the person an agent ran for has no address field either.
      onBehalfOf: { kind: 'user', id: 'usr_ada', ...linked },
    };
    // @ts-expect-error -- I3: a version's actor is a person or an agent, neither with an address.
    const tagged: RevisionActor = { kind: 'user', id: 'usr_ada', ...linked };

    expect([spread, literal, agent, tagged]).toHaveLength(4);
  });

  it('reads a commit whose person carries an address as one Tau did not record', () => {
    const record = written();
    const provenance = { ...(record['provenance'] as Record<string, unknown>), actor: withAddress };

    expect(parseRevisionCommitMessage(messageWith({ ...record, provenance }))).toBeUndefined();
  });

  it('reads a commit whose agent ran for a person with an address as one Tau did not record', () => {
    const record = written();
    const provenance = {
      ...(record['provenance'] as Record<string, unknown>),
      source: 'agent',
      actor: { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: withAddress },
    };

    expect(parseRevisionCommitMessage(messageWith({ ...record, provenance }))).toBeUndefined();
  });

  it('reads no version from a tag whose actor carries an address', () => {
    const id = '0123456789abcdef0123456789abcdef';
    const message = `Lid\n\n${tagTrailerPrefix}${JSON.stringify({ version: 2, id, name: 'Lid', actor: withAddress })}\n`;

    expect(parseRevisionTagMessage(message)).toBeUndefined();
  });

  it('writes no address an untyped caller hands it into a commit trailer or a tag trailer', () => {
    /* A JavaScript caller, or a structured clone from another context, is not held to the type. */
    const smuggled = withAddress as unknown as RevisionUserActor;
    const commit = revisionCommitMessage(
      trailerOf({
        source: 'agent',
        actor: { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: smuggled },
        capture: 'turn',
        via: 'browser',
        runId: 'run-1',
        createdAt,
      }),
    );
    const tag = revisionTagMessage({
      id: '0123456789abcdef0123456789abcdef',
      name: 'Lid',
      note: undefined,
      actor: smuggled,
    });

    expect(commit).not.toContain('example.com');
    expect(tag).not.toContain('example.com');
    expect(parseRevisionCommitMessage(commit)?.provenance.actor).toStrictEqual({
      kind: 'agent',
      id: 'agent',
      runId: 'run-1',
      onBehalfOf: person,
    });
    expect(parseRevisionTagMessage(tag)?.actor).toStrictEqual(person);
  });

  it('authors a person under a linked forge’s no-reply address, given as its own input', () => {
    const provenance: RevisionProvenance = {
      source: 'user',
      actor: person,
      capture: 'save',
      via: 'browser',
      createdAt,
    };

    expect(revisionAuthorSignature(provenance, linked)).toStrictEqual({
      name: 'octo',
      email: '42+octo@users.noreply.github.com',
      seconds: createdAt / 1000,
      offsetMinutes: 0,
    });
    /* The record is the same either way: the address is the author line's alone. */
    expect(revisionCommitMessage(trailerOf(provenance))).not.toContain('noreply.github.com');
  });

  it('authors nobody under an address that is not a forge’s no-reply address', () => {
    const provenance: RevisionProvenance = {
      source: 'user',
      actor: person,
      capture: 'save',
      via: 'browser',
      createdAt,
    };

    for (const email of ['ada@example.com', 'octo@users.noreply.github.com.example.com', 'noreply@tau.new']) {
      expect(revisionAuthorSignature(provenance, { name: 'octo', email }), email).toMatchObject({
        name: 'Ada Lovelace',
        email: 'usr_ada@users.noreply.tau.new',
      });
    }
  });

  it('never authors an anonymous person under a forge address', () => {
    const provenance: RevisionProvenance = {
      source: 'agent',
      actor: { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: anonymous },
      capture: 'turn',
      via: 'browser',
      createdAt,
    };

    expect(revisionAuthorSignature(provenance, linked)).toMatchObject({
      name: 'Anonymous',
      email: 'anon:3fa9c1d2@users.noreply.tau.new',
    });
  });

  it('tags as the person under the Tau no-reply address, whatever an untyped caller hands it', () => {
    expect(taggerSignature(withAddress as unknown as RevisionUserActor, createdAt)).toMatchObject({
      name: 'Ada Lovelace',
      email: 'usr_ada@users.noreply.tau.new',
    });
  });
});
