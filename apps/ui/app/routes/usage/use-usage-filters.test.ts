/* oxlint-disable typescript/no-restricted-types -- The billing wire returns explicit JSON nulls; a fixture has to be able to say so. */
import { describe, expect, it } from 'vitest';
import { wireUsageSnapshotSchema } from '@taucad/billing';
import { unresolvedProjectsOption, usageFilterOptions } from '#routes/usage/use-usage-filters.js';
import type { ProjectNames } from '#routes/usage/activity-names.js';

const timestamp = '2026-09-12T00:00:00.000Z';

const row = (operationId: string, projectHint: string | null): unknown => ({
  schemaVersion: 1,
  environment: 'development',
  ownerId: 'user',
  subjectId: 'account',
  operationId,
  baseTransactionId: `txn_${operationId}`,
  terminalRevision: '7',
  policyVersion: 'policy_1',
  activationId: 'activation_1',
  meterContractId: 'meter_1',
  category: 'llm',
  model: { id: 'openai-gpt-5.6-luna', displayName: 'Luna', providerId: 'openai' },
  activity: { kind: 'agent', projectHint, chatHint: null, parentAttemptKey: null },
  historyVersion: 1,
  admittedAt: timestamp,
  dispatchIntentAt: timestamp,
  usageOccurredAt: timestamp,
  evidenceOccurredAt: timestamp,
  timingStatus: 'dispatch_intent',
  kind: 'base',
  resolvedAt: timestamp,
  executionStatus: 'succeeded',
  customerState: 'settled',
  authorizedMaxCreditAtoms: '20000',
  chargedCreditAtoms: '12345',
  accountDeltaCreditAtoms: '-12345',
  meteringStatus: 'complete',
  meterItems: [],
  tokens: {
    status: 'complete',
    uncachedInput: '1000',
    cacheRead: '0',
    cacheWrite: '0',
    inputTotal: '1000',
    output: '50',
    reasoning: '10',
  },
});

const snapshotWith = (hints: ReadonlyArray<string | null>): ReturnType<typeof wireUsageSnapshotSchema.parse> =>
  wireUsageSnapshotSchema.parse({
    schemaVersion: 1,
    environment: 'development',
    ownerId: 'user',
    subjectId: 'account',
    snapshotRevision: '7',
    asOf: timestamp,
    query: {
      preset: 'all_time',
      fromDate: null,
      toDate: null,
      timeZone: 'UTC',
      models: [],
      activities: [],
      projects: [],
    },
    coverage: {
      historyStart: null,
      legacyBefore: null,
      complete: true,
      detailComplete: true,
      excludedUnknownTimeCount: '0',
    },
    availability: { state: 'available', reason: null },
    totals: { accountDeltaCreditAtoms: '-12345', netUsedCreditAtoms: '12345', eventCount: String(hints.length) },
    rows: { items: hints.map((hint, index) => row(`op_${String(index)}`, hint)), nextCursor: null, complete: true },
  });

const noFilters = { dateRange: undefined, models: [], activities: [], projects: [] };

describe('usageFilterOptions', () => {
  it('offers a named project under its own name', () => {
    const options = usageFilterOptions(snapshotWith(['proj_a']), noFilters, new Map([['proj_a', 'Gearbox']]));

    expect(options.projects).toEqual([{ id: 'proj_a', label: 'Gearbox', ids: ['proj_a'] }]);
  });

  /*
   * Two rows that cannot be named used to become two identically labelled
   * checkboxes, each filtering to a different project — indistinguishable to a
   * reader, and no way to say "everything I cannot name".
   */
  it('collapses every project it cannot name into one option covering all of them', () => {
    const options = usageFilterOptions(
      snapshotWith(['proj_a', 'proj_x', 'proj_y', null]),
      noFilters,
      new Map([['proj_a', 'Gearbox']]),
    );

    expect(options.projects).toEqual([
      { id: 'proj_a', label: 'Gearbox', ids: ['proj_a'] },
      { id: unresolvedProjectsOption, label: 'Project not available', ids: ['proj_x', 'proj_y'] },
    ]);
  });

  it('keeps a selected project offered so it can be cleared once its usage is out of range', () => {
    const options = usageFilterOptions(snapshotWith([]), { ...noFilters, projects: ['proj_a'] }, new Map());

    expect(options.projects).toEqual([
      { id: unresolvedProjectsOption, label: 'Project not available', ids: ['proj_a'] },
    ]);
  });

  it('offers no project option at all when nothing carried a project', () => {
    expect(usageFilterOptions(snapshotWith([null]), noFilters, new Map()).projects).toEqual([]);
  });

  /*
   * Offering the collapsed option before the listing answered lets one click
   * filter by every project at once — and when the names land those boxes are
   * all checked, a selection the reader never made.
   */
  it.each([{ names: 'asking' }, { names: 'unavailable' }] satisfies Array<{ names: ProjectNames }>)(
    'offers no project filter while names are $names',
    ({ names }) => {
      expect(usageFilterOptions(snapshotWith(['proj_a', 'proj_x']), noFilters, names).projects).toEqual([]);
    },
  );

  /*
   * The read wire is `z.string().min(1).max(256)` with no charset, so a hint
   * equal to the synthetic key is only impossible by an invariant enforced one
   * service away. Collapsing it keeps option ids unique whatever arrives.
   */
  it('keeps option ids unique even when a hint is the synthetic key itself', () => {
    const options = usageFilterOptions(
      snapshotWith(['proj_a', unresolvedProjectsOption]),
      noFilters,
      new Map([
        ['proj_a', 'Gearbox'],
        [unresolvedProjectsOption, 'Impostor'],
      ]),
    );

    expect(options.projects).toEqual([
      { id: 'proj_a', label: 'Gearbox', ids: ['proj_a'] },
      { id: unresolvedProjectsOption, label: 'Project not available', ids: [unresolvedProjectsOption] },
    ]);
    expect(new Set(options.projects.map((option) => option.id)).size).toBe(options.projects.length);
  });
});
