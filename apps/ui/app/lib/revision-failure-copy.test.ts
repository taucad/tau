/**
 * The words a person reads when a revision verb refuses (P4, Rule 1).
 *
 * The machines and the port speak in diagnostics — "Branch x is unborn; a
 * checkout of it needs an explicit base revision." is a sentence for a log, not
 * for a person. The refusal crosses the worker boundary as a code, and this
 * table is the only place that turns one into copy.
 */

import { describe, it, expect } from 'vitest';
import { describeRevisionFailure, revisionFailureCopy } from '#lib/revision-failure-copy.js';

/** Revisions policy Rule 1's banned vocabulary, as the lint rule spells it. */
const banned = /\b(?:checkouts?|lease[sd]?|backends?|worktrees?|refs?)\b/iu;
const bannedHead = /\bHEAD\b/u;

describe('revisionFailureCopy', () => {
  it('says nothing in engineering vocabulary, anywhere in the table (Rule 1)', () => {
    const sentences = Object.values(revisionFailureCopy).flatMap((subject) => [
      subject.title,
      subject.fallback,
      ...subject.codes.values(),
    ]);

    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      expect(sentence, sentence).not.toMatch(banned);
      expect(sentence, sentence).not.toMatch(bannedHead);
    }
  });
});

describe('describeRevisionFailure', () => {
  it('phrases the refusal a fresh project answers *New branch* with', () => {
    expect(describeRevisionFailure('branch', 'BRANCH_NEEDS_REVISION')).toEqual({
      title: 'That branch change did not go through',
      description: 'There is nothing to branch from yet. Add a file, then try again.',
    });
  });

  it('says why the name conflicts is refused (D14)', () => {
    expect(describeRevisionFailure('branch', 'BRANCH_NAME_RESERVED').description).toBe(
      '“conflicts” is kept for decisions that travel between devices. Choose another name.',
    );
  });

  it('names the branch a person already has, when the refusal came with one', () => {
    expect(describeRevisionFailure('branch', 'CHECKOUT_CONFLICT', 'bracket-fillet').description).toBe(
      'bracket-fillet already exists. Pick another name.',
    );
    expect(describeRevisionFailure('branch', 'CHECKOUT_CONFLICT').description).toBe(
      'That branch already exists. Pick another name.',
    );
  });

  /* Minted by the registry when a *New branch* arrives with nothing selected
     to branch from — the project's rows have not settled yet. It used to be
     reported as a name collision, which is not what happened. */
  it('phrases a *New branch* asked of a project with nothing open yet', () => {
    expect(describeRevisionFailure('branch', 'CHECKOUT_UNKNOWN').description).toBe(
      'This project has nothing open to branch from yet. Wait a moment and try again.',
    );
  });

  /* The one sentence two layers refuse an unrooted placement with: the worker
     client one hop from the seam, and the authority above it (finding 8). */
  it('phrases a chat placed on files that are not there', () => {
    expect(describeRevisionFailure('turn', 'PLACEMENT_UNROOTED').description).toBe(
      'This chat’s files could not be found.',
    );
  });

  it('says the same thing about the engine whichever verb asked it', () => {
    expect(describeRevisionFailure('restore', 'ENGINE_UNAVAILABLE').description).toBe(
      describeRevisionFailure('save', 'ENGINE_UNAVAILABLE').description,
    );
    expect(describeRevisionFailure('restore', 'ENGINE_UNAVAILABLE').title).toBe('Restore failed');
  });

  /* The fourth subject is not a toast channel at all: a turn that recorded
   * nothing is announced by `turn.failed`, whose `reason` the machines author
   * — "The checkout did not settle the cut in time." (P4, W4 §D). */
  it('phrases a turn that recorded nothing, never in the machine’s own words', () => {
    expect(describeRevisionFailure('turn', 'CUT_TIMED_OUT')).toEqual({
      title: 'Nothing was saved for that change',
      description: 'Tau took too long to record that change. Try sending it again.',
    });
    expect(describeRevisionFailure('turn', 'LEASE_UNAVAILABLE').description).toContain('Another window');
    expect(describeRevisionFailure('turn', undefined).description).toBe(revisionFailureCopy.turn.fallback);
    /* A release is a category of its own: the turn was let go, not broken. */
    expect(describeRevisionFailure('turn', 'TURN_RELEASED').description).toBe(
      'The turn ended before it recorded a revision.',
    );
  });

  /* E5: a failure with no code is the common one — an engine `Error` such as
   * `Buffer is not defined`. A person cannot act on that sentence, so they get
   * the one thing they can do and a developer reads the console. */
  it('falls back per subject for a failure that carries no code at all', () => {
    expect(describeRevisionFailure('save', undefined)).toEqual({
      title: 'That change could not be saved',
      description: 'Tau could not record this change. Reload the page and try again.',
    });
    expect(describeRevisionFailure('branch', 'SOMETHING_NEW').description).toBe(revisionFailureCopy.branch.fallback);
  });
});

describe('a restore or save the line refused (D1, D3)', () => {
  it.each([
    ['restore', 'LEASE_UNAVAILABLE', 'An agent is working in this project’s files.'],
    ['restore', 'CAS_LOST', 'Something else changed this project first. Try again.'],
    ['restore', 'CHECKOUT_CONFLICT', 'These files changed while the restore was being prepared. Try again.'],
    [
      'restore',
      'RESTORE_UNRECORDED',
      'The earlier files are back, but something else changed this project at the same time, so this restore is not in History as its own revision. Your files are kept.',
    ],
    ['restore', 'UNDO_UNAVAILABLE', 'That restore was made on another branch. Open it there to undo it.'],
    ['save', 'CAS_LOST', 'Something else changed this project first. Your changes are still here; save again.'],
  ] as const)('phrases a %s refused with %s', (subject, code, description) => {
    expect(describeRevisionFailure(subject, code).description).toBe(description);
  });
});

/* I12: each new refusal class has one sentence a person can act on, and never the server's code. */
describe('a restore whose files are back but not recorded (W0 N1, M1)', () => {
  it('titles it by what happened, and offers no Try again', () => {
    const copy = describeRevisionFailure('restore', 'RESTORE_UNRECORDED');
    expect(copy.title).toBe('Files restored');
    expect(copy.description).not.toMatch(/try again/iu);
    expect(describeRevisionFailure('restore', 'UNDO_UNAVAILABLE').title).toBe('Nothing to undo here');
  });
});

describe('what the Hosted Remote answers (W2a, W9)', () => {
  it.each([
    ['backup', 'REMOTE_DAMAGED', /has to repair this project’s copy on Tau Cloud.*Nothing on this device is lost/u],
    ['removeName', 'GIT_RATE_LIMITED', /Wait a minute, then try again/u],
    ['removeName', 'GIT_LEASE_OWNER_BUSY', /Try again in a moment/u],
    ['removeName', 'GIT_HYDRATE_BUDGET_EXHAUSTED', /Try again tomorrow/u],
    ['backup', 'GIT_RATE_LIMITED', /Wait a minute, then try again/u],
    ['removeName', 'GIT_REF_REMOVAL_OWNER_ONLY', /Only the project’s owner/u],
  ] as const)('phrases %s refused with %s', (subject, code, sentence) => {
    const { description } = describeRevisionFailure(subject, code);
    expect(description).toMatch(sentence);
    expect(description).not.toContain(code);
  });
});
