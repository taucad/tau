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

describe('the version tag trailer (B6)', () => {
  const actor = { kind: 'user', id: 'user_1', name: 'Ada' } as const;

  it('records the number beside the note and the actor, and reads it back', () => {
    const message = revisionTagMessage({ name: 'lid-fit', note: 'Lid fit', actor, number: 5 });
    expect(message).toBe(
      `Lid fit\n\n${tagTrailerPrefix}{"version":1,"note":"Lid fit","actor":{"kind":"user","id":"user_1","name":"Ada"},"number":5}\n`,
    );
    expect(parseRevisionTagMessage(message)).toStrictEqual({ note: 'Lid fit', actor, number: 5 });
  });

  it('reads a tag written before numbers with no number, so it is numbered when read', () => {
    const message = `Lid fit\n\n${tagTrailerPrefix}{"version":1,"note":"Lid fit"}\n`;
    expect(parseRevisionTagMessage(message)).toStrictEqual({ note: 'Lid fit', actor: undefined, number: undefined });
  });

  it('reads nothing from a tag Tau did not write, or a lightweight tag', () => {
    const empty = { note: undefined, actor: undefined, number: undefined };
    expect(parseRevisionTagMessage('v1.0.0\n')).toStrictEqual(empty);
    expect(parseRevisionTagMessage(undefined)).toStrictEqual(empty);
  });

  it.each([
    ['V1, which the Start entry holds', 1],
    ['a number that is not whole', 2.5],
    ['a number below one', 0],
    ['a number spelled as text', '3'],
  ])('refuses a trailer whose number is %s', (_label, number) => {
    const message = `Lid fit\n\n${tagTrailerPrefix}${JSON.stringify({ version: 1, note: 'Lid fit', number })}\n`;
    expect(parseRevisionTagMessage(message)).toStrictEqual({ note: undefined, actor: undefined, number: undefined });
  });

  it('reads the last Tau-Tag line, as the server does', () => {
    const message = `Lid fit\n\n${tagTrailerPrefix}{"version":1,"number":4}\n${tagTrailerPrefix}{"version":1,"number":7}\n`;
    expect(parseRevisionTagMessage(message).number).toBe(7);
  });
});
