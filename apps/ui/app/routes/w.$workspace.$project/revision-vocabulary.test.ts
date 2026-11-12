import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import {
  backupCopy,
  revisionTitle,
  selectStripVerbs,
  startFact,
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

  it('should still count the revisions waiting when signed out', () => {
    expect(backupCopy({ ...refused.sync, pendingCount: 1 }, { isSignedOut: true }, refused.remote)).toBe(
      'Not backed up · 1 revision',
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
