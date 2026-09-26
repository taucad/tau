import { describe, expect, it } from 'vitest';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { selectStripVerbs } from '#routes/w.$workspace.$project/revision-vocabulary.js';

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

  it('should offer no plan verb to a collaborator or a top-tier owner', () => {
    expect(
      selectStripVerbs({ status: refused, where, undoable: false, canWrite: true, canUpgrade: false }).primary,
    ).toBeUndefined();
  });
});
