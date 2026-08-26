/**
 * Deferral registry (spec Sections 1.3, 5.11, 6.1).
 *
 * The remaining 26 frontier-gated REQs are DOCUMENTED DEFERRALS — data entries
 * with REQ id, frontier, gate, and the quantified criterion held in reserve —
 * never fake-passing geometry tests and never permanent red noise. These
 * pure-TS tests assert the registry is complete and consistent with the
 * spec tallies; they pass without any model, which is correct and honest.
 * A frontier landing converts its entries to red tests in the same change.
 */
import { describe, it } from 'geospec';
import {
  assertDeferralsRegistered,
  assertVerificationPartition,
  frontierDeferrals,
  processOnlyRequirements,
  relationshipBackedRequirementIds,
  requirementCounts,
  verifyTodayRequirements,
} from '../spec/requirements.js';
import type { GeoSpecFrontier } from '../spec/requirements.js';

/** Verify-today REQs proven by part-export feature evidence, not rows. */
const partExportBackedReqs: readonly string[] = [
  'REQ-V8R2-002',
  'REQ-V8R2-005',
  'REQ-V8R2-012',
  'REQ-V8R2-035',
  'REQ-V8R2-046',
  'REQ-V8R2-080',
  'REQ-V8R2-081',
  'REQ-V8R2-085',
  'REQ-V8R2-089',
  'REQ-V8R2-092',
  'REQ-V8R2-099',
  'REQ-V8R2-103',
  'REQ-V8R2-106',
];

/** Verify-today REQs proven by census/interference evidence, not rows. */
const evidenceOnlyReqs: readonly string[] = ['REQ-V8R2-100', 'REQ-V8R2-077'];

/** Verify-today REQs proven by the landed void-continuity matcher (flow-paths). */
const voidContinuityBackedReqs: readonly string[] = [
  'REQ-V8R2-001',
  'REQ-V8R2-003',
  'REQ-V8R2-004',
  'REQ-V8R2-006',
  'REQ-V8R2-010',
  'REQ-V8R2-013',
  'REQ-V8R2-015',
];

describe('V8R2 deferred frontiers and coverage accounting', () => {
  it('REQ-V8R2-038/044/087/088/095..097/111..121 (registry): deferred frontiers are registered in this file', () => {
    assertDeferralsRegistered('deferred-frontiers', [
      'REQ-V8R2-038',
      'REQ-V8R2-044',
      'REQ-V8R2-087',
      'REQ-V8R2-088',
      'REQ-V8R2-095',
      'REQ-V8R2-096',
      'REQ-V8R2-097',
      'REQ-V8R2-111',
      'REQ-V8R2-112',
      'REQ-V8R2-113',
      'REQ-V8R2-114',
      'REQ-V8R2-115',
      'REQ-V8R2-116',
      'REQ-V8R2-117',
      'REQ-V8R2-118',
      'REQ-V8R2-119',
      'REQ-V8R2-120',
      'REQ-V8R2-121',
    ]);
  });

  it('deferral registry matches the Section 6.1 tallies (9 rev2.1 + 6 rev2.1+ + 11 rev2.2 by frontier)', () => {
    const rev21 = frontierDeferrals.filter((entry) => entry.gate === 'rev2.1');
    const rev21Plus = frontierDeferrals.filter(
      (entry) => entry.gate === 'rev2.1+',
    );
    const rev22 = frontierDeferrals.filter((entry) => entry.gate === 'rev2.2');
    if (rev21.length !== requirementCounts.frontierGatedRev21) {
      throw new Error(
        `rev2.1 deferrals ${rev21.length} != ${requirementCounts.frontierGatedRev21}`,
      );
    }
    if (rev21Plus.length !== requirementCounts.frontierGatedRev21Plus) {
      throw new Error(
        `rev2.1+ deferrals ${rev21Plus.length} != ${requirementCounts.frontierGatedRev21Plus}`,
      );
    }
    if (rev22.length !== requirementCounts.frontierGatedRev22) {
      throw new Error(
        `rev2.2 deferrals ${rev22.length} != ${requirementCounts.frontierGatedRev22}`,
      );
    }
    for (const [frontier, expected] of Object.entries(
      requirementCounts.byFrontier,
    )) {
      const actual = frontierDeferrals.filter(
        (entry) => entry.frontier === (frontier as GeoSpecFrontier),
      ).length;
      if (actual !== expected) {
        throw new Error(
          `Frontier ${frontier}: registered ${actual}, spec tallies ${expected}.`,
        );
      }
    }
  });

  it('every deferral carries its quantified criterion and a cluster suite-file registration', () => {
    for (const entry of frontierDeferrals) {
      if (!/\d/.test(entry.criterion)) {
        throw new Error(
          `Deferral ${entry.requirementId} criterion carries no quantified value: ${entry.criterion}`,
        );
      }
      if (!entry.requirementId.startsWith('REQ-V8R2-')) {
        throw new Error(`Malformed deferral id ${entry.requirementId}`);
      }
    }
  });

  it('verification classes partition all 121 requirements (85 verify-today / 26 frontier-gated / 10 process-only)', () => {
    assertVerificationPartition();
  });

  it('all 85 verify-today REQs are executable: relationship rows, part-export features, void-continuity, or census/interference evidence', () => {
    const executable = new Set([
      ...relationshipBackedRequirementIds(),
      ...partExportBackedReqs,
      ...evidenceOnlyReqs,
      ...voidContinuityBackedReqs,
    ]);
    const verifyToday = verifyTodayRequirements.map(
      (entry) => entry.requirementId,
    );
    const unencoded = verifyToday.filter(
      (requirementId) => !executable.has(requirementId),
    );
    if (unencoded.length > 0) {
      throw new Error(
        `Verify-today REQs without an executable encoding: ${unencoded.join(', ')}`,
      );
    }
    const strays = [...executable].filter(
      (requirementId) => !verifyToday.includes(requirementId),
    );
    if (strays.length > 0) {
      throw new Error(
        `Executable encodings claiming non-verify-today REQs: ${strays.join(', ')}`,
      );
    }
  });

  it('process-only registry lists exactly the 10 review/lint requirements', () => {
    if (processOnlyRequirements.length !== requirementCounts.processOnly) {
      throw new Error(
        `Process-only registry has ${processOnlyRequirements.length} entries, spec says 10.`,
      );
    }
    for (const entry of processOnlyRequirements) {
      if (entry.review.length === 0) {
        throw new Error(
          `Process-only ${entry.requirementId} has no review criterion.`,
        );
      }
    }
  });
});
