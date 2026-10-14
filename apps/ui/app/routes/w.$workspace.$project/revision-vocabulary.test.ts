import { describe, expect, it } from 'vitest';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { backupCopy, selectStripVerbs } from '#routes/w.$workspace.$project/revision-vocabulary.js';

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
