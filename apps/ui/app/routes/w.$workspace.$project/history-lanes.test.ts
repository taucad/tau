import { describe, expect, it } from 'vitest';
import type { RevisionConflictFacet, RevisionGraph } from '@taucad/revisions';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { conflictLinesOf, historyLanesOf } from '#routes/w.$workspace.$project/history-lanes.js';
import type { HistoryFilter, HistoryLanes } from '#routes/w.$workspace.$project/history-lanes.js';
import { conflictLine, lanesScenarios, lidConflict } from '#routes/w.$workspace.$project/history-lanes.test-harness.js';

const scenario = (id: string) => lanesScenarios.find((entry) => entry.id === id)!;

const lanesOf = (
  graph: RevisionGraph,
  current: string,
  options: Readonly<{
    filter?: HistoryFilter;
    overrides?: ReadonlyMap<string, Partial<RevisionCard>>;
    conflicts?: readonly RevisionConflictFacet[];
  }> = {},
): HistoryLanes =>
  historyLanesOf({
    branches: graph.branches,
    revisions: graph.rows.map(
      (row): RevisionCard => ({
        revisionId: row.revisionId,
        n: undefined,
        createdAt: row.createdAt,
        summary: row.summary,
        actor: '',
        turnId: row.turnId,
        conflicted: row.conflicted,
        capture: row.capture,
        ...(row.parent === undefined ? {} : { parent: row.parent }),
        ...(row.otherParents === undefined ? {} : { otherParents: row.otherParents }),
        ...options.overrides?.get(row.revisionId),
      }),
    ),
    lineOf: new Map(graph.rows.map((row) => [row.revisionId, row.line] as const)),
    current,
    filter: options.filter ?? 'this',
    ...(options.conflicts === undefined ? {} : { conflicts: options.conflicts }),
  });

describe('historyLanesOf', () => {
  it('should draw main and the branch you are on, with a chip each and counts against main', () => {
    const lanes = lanesOf(scenario('graph-two-branches').graph, 'enclosure-v2');

    expect(lanes.hasLanes).toBe(true);
    expect(lanes.lanePreference).toEqual(['main', 'enclosure-v2']);
    expect(new Set(lanes.chips)).toEqual(new Set(['main', 'enclosure-v2']));
    expect(lanes.notes.get('enclosure-v2')).toBe('2 ahead · 3 behind main');
    expect(lanes.notes.get('main')).toBe('');
    expect(lanes.slots.get('main')).toBe(0);
    expect(lanes.slots.get('enclosure-v2')).not.toBe(0);
  });

  it('should leave an unmerged branch out of This branch on main, so one lane renders as one branch does', () => {
    const { graph } = scenario('this-branch-main-alone');

    const lanes = lanesOf(graph, 'main');

    expect(lanes.hasLanes).toBe(false);
    expect(lanes.chips.size).toBe(0);
    expect(lanes.revisions.map((revision) => revision.revisionId)).not.toContain('d2walls0');
    expect(lanesOf(graph, 'main', { filter: 'all' }).hasLanes).toBe(true);
  });

  it('should order four lanes by the age of their fork and give each its own slot', () => {
    const lanes = lanesOf(scenario('graph-four-lanes').graph, 'main', { filter: 'all' });

    expect(lanes.lanePreference).toEqual(['main', 'enclosure-v2', 'alt-inductor', 'thermal-test']);
    expect(new Set(lanes.slots.values()).size).toBe(4);
  });

  it('should put a branch with no entries yet at the entry it starts from, saying so', () => {
    const lanes = lanesOf(scenario('branch-just-created').graph, 'enclosure-v2');

    expect(lanes.hasLanes).toBe(true);
    expect(lanes.emptyAt.get('c7bom000')).toEqual(['enclosure-v2']);
    expect(lanes.notes.get('enclosure-v2')).toBe('No changes yet');
  });

  it('should keep a merged branch on its lane without a chip, so its rows name it', () => {
    const lanes = lanesOf(scenario('branch-merged').graph, 'main');

    expect(lanes.hasLanes).toBe(true);
    expect([...lanes.merged]).toEqual(['enclosure-v2']);
    expect([...lanes.chips]).toEqual(['main']);
  });

  it('should never make a lane of Tau setup changes alone (A4)', () => {
    const { graph } = scenario('graph-two-branches');
    const setupOnly = new Map<string, Partial<RevisionCard>>([
      ['d1start0', { isSetup: true }],
      ['d2walls0', { isSetup: true }],
    ]);

    const lanes = lanesOf(graph, 'main', { filter: 'all', overrides: setupOnly });

    expect(lanes.hasLanes).toBe(false);
    expect(lanes.revisions.map((revision) => revision.revisionId)).not.toContain('d2walls0');
    /* The branch you are on keeps its lane whatever it holds. */
    expect(lanesOf(graph, 'enclosure-v2', { overrides: setupOnly }).hasLanes).toBe(true);
  });

  /* D3: a conflict line is a decision in flight, never a branch. */
  it('should give a conflict line no lane and no chip, and draw its merge as one pending node on main', () => {
    const lanes = lanesOf(scenario('branch-conflict').graph, 'main', { conflicts: [lidConflict] });

    expect(lanes.lanePreference).toEqual(['main', 'enclosure-v2']);
    expect(lanes.chips.has(conflictLine)).toBe(false);
    expect(lanes.notes.has(conflictLine)).toBe(false);
    expect(lanes.revisions.map((revision) => revision.revisionId)).not.toContain('c8confl0');
    /* The branch the merge brings in is in view on This branch, so its link has a lane to reach. */
    expect(lanes.pending).toEqual([{ revisionId: 'c8confl0', into: 'main', from: 'enclosure-v2' }]);
  });

  it('should read the branch a merge brings in from its other parent when the labels are not read yet', () => {
    const lanes = lanesOf(scenario('branch-conflict').graph, 'main', {
      conflicts: [{ ...lidConflict, labels: undefined }],
    });

    expect(lanes.pending[0]?.from).toBe('enclosure-v2');
  });

  it('should name no conflict line for a conflict recorded on the branch it lands on', () => {
    expect([...conflictLinesOf([lidConflict, { ...lidConflict, branch: 'main' }])]).toEqual([conflictLine]);
  });
});
