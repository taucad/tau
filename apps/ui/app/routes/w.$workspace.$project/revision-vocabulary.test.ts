import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import {
  arrivedSentence,
  backupCopy,
  cloudUnavailableSentence,
  entryReference,
  entryTime,
  restoredSentence,
  revisionAccessibleName,
  revisionTitle,
  revisionTriggerLabel,
  selectRevisionFacts,
  selectStripVerbs,
  startFact,
  switchedSentence,
  switchRefusedSentence,
  syncCopy,
  undidRestoreSentence,
  undidSentence,
  undoLabel,
  versionOf,
  versionPhrase,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionCard } from '#hooks/use-revisions.js';

/**
 * A2: who made an entry is a name or nothing. The label that described an
 * account it could not name is gone from every file of the app, tests
 * included, so no surface can bring it back.
 */
describe('the who line', () => {
  const appRoot = join(import.meta.dirname, '../../..');
  const generated = new Set(['node_modules', 'build', 'dist', '.react-router', '.netlify', 'coverage']);
  const filesUnder = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return generated.has(entry.name) ? [] : filesUnder(path);
      }
      return /\.(?:[cm]?[jt]sx?|json|mdx?|html|css)$/u.test(entry.name) ? [path] : [];
    });

  it('never says an entry is by an account it cannot name', () => {
    const label = ['Another', 'account'].join(' ');
    const files = filesUnder(appRoot);
    /* The walk reached the app's sources, this file among them. */
    expect(files).toContain(join(appRoot, 'app/routes/w.$workspace.$project/revision-vocabulary.ts'));
    expect(files.filter((path) => readFileSync(path, 'utf8').includes(label))).toEqual([]);
  });
});

/**
 * D17 on the strip: a storage refusal's *Upgrade* belongs to the owner whose
 * plan has a larger one, exactly as on the Sync row — never to a collaborator
 * and never to an owner already on the top tier.
 */
describe('selectStripVerbs', () => {
  const refused = {
    ...revisionStatusHarness.status,
    sync: { ...revisionStatusHarness.status.sync, state: 'failed', pendingCount: 1, reason: 'quota' },
  } as const;
  const where = { branch: 'main', head: 3, isDirty: false } as const;

  it('should offer Upgrade for a storage refusal to a viewer who can grow the plan', () => {
    expect(selectStripVerbs({ status: refused, where, undoable: false, canWrite: true }).primary).toBe('Upgrade');
  });

  /* RV-W8 F2: D20's ceiling is the same on every plan, so the strip offers no Upgrade for it. */
  it('should offer no plan verb for the repository ceiling, even to an owner who can upgrade', () => {
    const ceiling = {
      ...refused,
      sync: { ...refused.sync, error: 'Tau: repository size limit exceeded — this push needs 12 bytes more.' },
    } as const;
    expect(selectStripVerbs({ status: ceiling, where, undoable: false, canWrite: true }).primary).toBeUndefined();
  });

  it('should offer no plan verb to a collaborator or a top-tier owner', () => {
    expect(
      selectStripVerbs({ status: refused, where, undoable: false, canWrite: true, canUpgrade: false }).primary,
    ).toBeUndefined();
  });
});

/**
 * D100: signed out of Tau, this device withholds its GitHub credential, so the
 * refusal is Tau's sign-in to fix and GitHub refused nothing.
 */
describe('a GitHub remote while signed out of Tau', () => {
  const refused = {
    ...revisionStatusHarness.status,
    remote: {
      ...revisionStatusHarness.status.remote,
      kind: 'git',
      phase: 'connected',
      url: 'https://github.com/o/r.git',
      provider: 'github',
    },
    sync: { ...revisionStatusHarness.status.sync, state: 'failed', pendingCount: 0, reason: 'unauthorized' },
  } as const;
  const where = { branch: 'main', head: 3, isDirty: false } as const;

  it('should offer Sign in on the strip when signed out', () => {
    expect(
      selectStripVerbs({ status: refused, where: { ...where, isSignedOut: true }, undoable: false, canWrite: true })
        .primary,
    ).toBe('Sign in');
  });

  it('should leave the strip to the Sync row when signed in', () => {
    expect(selectStripVerbs({ status: refused, where, undoable: false, canWrite: true }).primary).toBeUndefined();
  });

  it('should say Backed up without a refusal when signed out with nothing waiting', () => {
    expect(backupCopy(refused.sync, { isSignedOut: true }, refused.remote)).toBe('Backed up');
  });

  it('should still count the changes waiting when signed out', () => {
    expect(backupCopy({ ...refused.sync, pendingCount: 1 }, { isSignedOut: true }, refused.remote)).toBe(
      'Not backed up · 1 change',
    );
  });

  it('should keep GitHub’s refusal when signed in (D68)', () => {
    expect(backupCopy(refused.sync, {}, refused.remote)).toBe('Backed up · GitHub refused access');
  });
});

/* A6, Q8: the first entry is the Start version, V1, whatever its commit says. */
describe('the Start version', () => {
  const card = (over: Partial<RevisionCard> & Pick<RevisionCard, 'revisionId'>): RevisionCard => ({
    n: undefined,
    createdAt: 1,
    summary: 'Agent turn t1',
    actor: 'You',
    turnId: undefined,
    conflicted: false,
    capture: undefined,
    ...over,
  });

  it('is titled Start, and a restore of it is Restored V1', () => {
    const start = card({ revisionId: 'r1', n: 1, start: 'created' });
    const restore = card({ revisionId: 'r3', n: 3, capture: 'restore', restoredFrom: 'r1' });

    expect(revisionTitle(start, [restore, start])).toBe('Start');
    expect(revisionTitle(restore, [restore, start])).toBe('Restored V1');
  });

  it.each([
    ['created', 'Version · project created'],
    ['github', 'Version · imported from GitHub'],
    ['folder', 'Version · imported from a folder'],
    ['zip', 'Version · imported from a zip'],
  ] as const)('says %s as “%s”', (start, fact) => {
    expect(startFact(start)).toBe(fact);
  });
});

/*
 * C8, M11: the blueprint's copy table is the fixture. Each row below is the
 * table's proposed column, read from the function that says it; a row whose
 * old words were deleted is asserted absent.
 */
describe('the copy table', () => {
  const card = (over: Partial<RevisionCard> & Pick<RevisionCard, 'revisionId'>): RevisionCard => ({
    n: undefined,
    createdAt: new Date('2026-07-09T10:31:00').getTime(),
    summary: 'Add vent slots',
    actor: 'You',
    turnId: undefined,
    conflicted: false,
    capture: undefined,
    ...over,
  });
  const base = revisionStatusHarness.status;
  const onMain = { branch: 'main', head: 12, isDirty: false } as const;
  const sync = (over: Partial<typeof base.sync>): typeof base.sync => ({ ...base.sync, ...over });
  const tau = { ...base.remote, kind: 'tau', phase: 'connected' } as const;
  const github = {
    ...base.remote,
    kind: 'git',
    phase: 'connected',
    url: 'https://github.com/o/r.git',
    provider: 'github',
  } as const;

  describe('names of things', () => {
    it('names a version V3 · its name, and the first entry V1 · Start', () => {
      const version = versionOf(card({ revisionId: 'v', versions: [{ number: 3, name: 'Ready for print' }] }));
      expect(version === undefined ? undefined : versionPhrase(version)).toBe('V3 · Ready for print');
      const start = versionOf(card({ revisionId: 's', start: 'created' }));
      expect(start === undefined ? undefined : versionPhrase(start)).toBe('V1 · Start');
    });

    it('refers to an entry by its version, its autosave time or its title, never by a number', () => {
      expect(entryReference(card({ revisionId: 'v', n: 12, versions: [{ number: 2, name: 'Fit check' }] }))).toBe('V2');
      expect(entryReference(card({ revisionId: 'a', n: 12, capture: 'idle' }))).toBe(
        `the ${entryTime(card({ revisionId: 'a' }).createdAt)} autosave`,
      );
      expect(entryReference(card({ revisionId: 't', n: 12 }))).toBe('“Add vent slots”');
    });
  });

  describe('status sentence', () => {
    it.each([
      ['Modified since Rev 4', base, { ...onMain, isDirty: true }, 'Unsaved changes'],
      ['Not saved yet', base, { ...onMain, head: undefined, isDirty: true }, 'Nothing saved yet'],
      ['Setting up history', { ...base, minting: true }, { ...onMain, branch: undefined }, 'Setting up…'],
      [
        'Restoring Rev 2…',
        { ...base, restore: { ...base.restore, busy: true, revisionNumber: 2 } },
        onMain,
        'Restoring…',
      ],
      [
        'Discarding x…',
        { ...base, branchVerb: { ...base.branchVerb, busy: true, operation: 'discard', branch: 'x' } },
        onMain,
        'Closing x…',
      ],
      ['Save not confirmed', { ...base, attention: 1 }, { ...onMain, isDirty: true }, 'Couldn’t confirm the save'],
      ['Backup failed', { ...base, sync: sync({ state: 'failed', reason: 'rejected' }) }, onMain, 'Couldn’t back up'],
      [
        'Not backed up · Sign in',
        { ...base, remote: tau, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }) },
        onMain,
        'Not backed up · Sign in to back up',
      ],
      [
        'Not backed up · Remote refused access',
        {
          ...base,
          remote: { ...github, provider: undefined, url: 'https://git.example.com/o/r.git' },
          sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 1 }),
        },
        onMain,
        'Not backed up · Your Git host refused access',
      ],
      [
        'Not backed up · Over your plan',
        { ...base, sync: sync({ state: 'failed', reason: 'quota', pendingCount: 1 }) },
        onMain,
        'Not backed up · Storage is full',
      ],
      [
        'Not backed up · Files too large for this remote',
        { ...base, remote: github, sync: sync({ state: 'failed', reason: 'largeFiles', pendingCount: 1 }) },
        onMain,
        'Not backed up · Some files are too large for GitHub',
      ],
      [
        'Backed up · Tau Cloud refused access',
        { ...base, remote: tau, sync: sync({ state: 'failed', reason: 'unauthorized', pendingCount: 0 }) },
        onMain,
        'Backed up · Sign in again to keep backing up',
      ],
    ] as const)('says “%s” as the table proposes', (...[, status, where, sentence]) => {
      expect(selectRevisionFacts(status, where).sentence).toBe(sentence);
    });

    it.each([
      ['Checking…', sync({ state: 'checking' }), 'Checking for changes…'],
      ['Backing up… 2 revisions', sync({ state: 'pending', pendingCount: 2 }), 'Backing up 2 changes…'],
      ['Not backed up · 2 revisions', sync({ state: 'queued', pendingCount: 2 }), 'Not backed up · 2 changes'],
      ['Saved locally · Push to GitHub when ready', sync({ state: 'manual' }), 'Saved · Not pushed to GitHub'],
    ] as const)('says the backup line “%s” as the table proposes', (_, facet, line) => {
      expect(syncCopy(facet, github)).toBe(line);
    });

    it('says the cloud copy is gone without “revision”', () => {
      expect(cloudUnavailableSentence).toBe(
        'The cloud copy was deleted or your access changed. Your history is still on this device.',
      );
    });

    it.each([
      [
        'Rev 5 arrived from a member on Tau Cloud',
        card({ revisionId: 'm', actor: 'Maya' }),
        'Changes from Maya are ready',
      ],
      [
        'Rev 5 arrived from another session',
        card({ revisionId: 'y', actor: '', isYours: true }),
        'Changes from your other device are ready',
      ],
      ['A new revision arrived', undefined, 'New changes are ready'],
    ] as const)('says “%s” as the table proposes', (_, arrived, sentence) => {
      expect(arrivedSentence(arrived)).toBe(sentence);
    });

    it('names the toolbar chip with no number', () => {
      expect(revisionAccessibleName({ ...onMain, isDirty: true }, 'Unsaved changes')).toBe(
        'Open History. You are on main. Unsaved changes.',
      );
      expect(revisionAccessibleName(onMain, 'Saved · Backed up')).toBe(
        'Open History. You are on main. Saved, Backed up.',
      );
    });
  });

  describe('header and toasts', () => {
    it('offers Save, not Save revision', () => {
      expect(
        selectStripVerbs({
          status: { ...base, dirty: true },
          where: { ...onMain, isDirty: true },
          undoable: false,
          canWrite: true,
        }).primary,
      ).toBe('Save');
      expect(revisionTriggerLabel('save')).toBe('Save');
    });

    it.each([
      [
        'Restored Rev 2 (a version)',
        card({ revisionId: 'v', versions: [{ number: 2, name: 'Fit check' }] }),
        'Restored V2',
      ],
      ['Restored Rev 1 (the Start version)', card({ revisionId: 's', start: 'created' }), 'Restored V1'],
      ['Restored Rev 2 (an entry)', card({ revisionId: 'e' }), 'Restored “Add vent slots”'],
      ['Restored an earlier revision', undefined, 'Restored an earlier point'],
    ] as const)('says “%s” as the table proposes', (_, target, sentence) => {
      expect(restoredSentence(target)).toBe(sentence);
    });

    it('says an Undo by the entry it undid', () => {
      expect(undidSentence(card({ revisionId: 'u', summary: 'Thicker walls for the lid' }))).toBe(
        'Undid “Thicker walls for the lid”',
      );
      expect(undidSentence(undefined)).toBe('Undid an earlier change');
      expect(undidSentence(card({ revisionId: 'r', summary: 'Restored V1', restoredFrom: 'v1' }))).toBe(
        'Undid the restore',
      );
    });

    it('says an Undo restore undid the restore, and every toast that acted at once offers Undo (I11)', () => {
      expect(undidRestoreSentence).toBe('Undid the restore');
      expect(undoLabel).toBe('Undo');
    });

    it('says where a switch saved first, and a refused switch in the branch menu’s words', () => {
      expect(switchedSentence('enclosure-v2', 'main', true)).toBe(
        'Saved your changes on main, then switched to enclosure-v2',
      );
      expect(switchedSentence('enclosure-v2', 'main', false)).toBe('Switched to enclosure-v2');
      expect(switchedSentence('enclosure-v2', undefined, true)).toBe('Switched to enclosure-v2');
      expect(switchRefusedSentence('enclosure-v2')).toBe('Couldn’t switch to enclosure-v2');
    });
  });
});
