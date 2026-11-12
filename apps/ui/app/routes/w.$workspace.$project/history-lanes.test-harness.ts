/**
 * The review canvas's branch-graph projects as graph reads (History D2): `main`
 * with a branch, four lanes, a branch just created, one from an older entry, and
 * a merge that landed. Times are relative to now so day labels read as they do
 * on the canvas.
 *
 * @see docs/research/revisions-history-versions-blueprint.md, "One History, with a lane per branch"
 */
import type { RevisionGraph, RevisionGraphRow, RevisionRow } from '@taucad/revisions';

const minute = 60_000;
const day = 86_400_000;

/* The canvas's clock: its newest entry is at 16:02 and "now" is 16:10. */
const canvasNow = 16 * 60 + 10;

/** A canvas time, `daysAgo` days back, kept the same distance before now as on the canvas. */
const at = (daysAgo: number, hours: number, minutes: number): number =>
  Date.now() - (canvasNow - (hours * 60 + minutes)) * minute - daysAgo * day;

type Seed = Partial<RevisionRow> & Pick<RevisionRow, 'revisionId' | 'createdAt' | 'summary'>;

const entry = (seed: Seed): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${seed.revisionId}`,
  who: { kind: 'recorded', identity: { kind: 'user', id: 'usr_me' } },
  source: 'user',
  conflicted: false,
  turnId: undefined,
  tags: [],
  capture: 'save',
  treeId: seed.revisionId.padEnd(40, '0'),
  ...seed,
});

const agent = (seed: Seed): RevisionRow =>
  entry({ source: 'agent', capture: 'turn', turnId: `t-${seed.revisionId}`, turnCut: 'result', ...seed });

/** Oldest first: each entry follows the one before it, the first follows `from`. */
const line = (from: string | undefined, ...seeds: readonly RevisionRow[]): RevisionRow[] => {
  let parent = from;
  return seeds.map((row) => {
    const next = parent === undefined ? row : { ...row, parent };
    parent = row.revisionId;
    return next;
  });
};

const olderMain = line(
  undefined,
  entry({
    revisionId: 'c10c2e1',
    createdAt: at(4, 9, 2),
    summary: 'Project created',
    capture: 'create',
    start: 'created',
  }),
  entry({ revisionId: 'c2f81b3', createdAt: at(3, 14, 20), summary: 'Draft the enclosure base' }),
  agent({
    revisionId: 'c3c94d7',
    createdAt: at(1, 10, 5),
    summary: 'Add the PCB standoffs',
    tags: ['Fit check'],
    versions: [{ name: 'Fit check', number: 2 }],
  }),
);
const mainRows = line(
  'c3c94d7',
  agent({ revisionId: 'c4bosses', createdAt: at(0, 11, 52), summary: 'Add mounting bosses' }),
  entry({ revisionId: 'c5induct', createdAt: at(0, 12, 44), summary: 'Pick a 15 µH inductor' }),
  agent({ revisionId: 'c6traces', createdAt: at(0, 13, 30), summary: 'Route the feedback trace' }),
  entry({ revisionId: 'c7bom000', createdAt: at(0, 14, 40), summary: 'Update BOM' }),
);
const enclosureRows = line(
  'c4bosses',
  entry({ revisionId: 'd1start0', createdAt: at(0, 12, 10), summary: 'Start enclosure v2' }),
  agent({ revisionId: 'd2walls0', createdAt: at(0, 15, 10), summary: 'Thicker walls for the lid' }),
);
const inductorRows = line(
  'c5induct',
  entry({ revisionId: 'e1induct', createdAt: at(0, 13, 58), summary: 'Try a 22 µH inductor' }),
);
const thermalRows = line(
  'c6traces',
  agent({ revisionId: 'f1vias00', createdAt: at(0, 16, 2), summary: 'Add thermal vias' }),
);
const mergeRow = entry({
  revisionId: 'c8merged',
  createdAt: at(0, 15, 31),
  summary: 'Merged enclosure-v2',
  capture: 'merge',
  parent: 'c7bom000',
  otherParents: ['d2walls0'],
});

/** One canvas scenario: the graph read, where the files are, and the selected line's own log. */
export type LanesScenario = Readonly<{
  id: string;
  graph: RevisionGraph;
  /** The branch the files are on. */
  current: string;
  head: string;
  /** The selected branch's own history, newest first, as `readRevisionLog` answers it. */
  rows: readonly RevisionRow[];
  /** Show every branch rather than this one. */
  isAll?: boolean;
  /** How many lanes History draws. */
  lanes: number;
}>;

const newestFirst = (rows: readonly RevisionRow[]): RevisionRow[] =>
  rows.toSorted((left, right) => right.createdAt - left.createdAt);

/** The rows reachable from `head`, newest first. */
const historyOf = (rows: readonly RevisionRow[], head: string): RevisionRow[] => {
  const byId = new Map(rows.map((row) => [row.revisionId, row] as const));
  const seen = new Set<string>();
  const queue = [head];
  while (queue.length > 0) {
    const row = byId.get(queue.pop()!);
    if (row === undefined || seen.has(row.revisionId)) {
      continue;
    }
    seen.add(row.revisionId);
    queue.push(...(row.parent === undefined ? [] : [row.parent]), ...(row.otherParents ?? []));
  }
  return newestFirst(rows.filter((row) => seen.has(row.revisionId)));
};

/** A graph read: each branch claims its first-parent chain in order, `main` first. */
const graphOf = (rows: readonly RevisionRow[], branches: ReadonlyArray<readonly [string, string]>): RevisionGraph => {
  const byId = new Map(rows.map((row) => [row.revisionId, row] as const));
  const owner = new Map<string, string>();
  for (const [name, head] of branches) {
    let cursor = byId.get(head);
    while (cursor !== undefined && !owner.has(cursor.revisionId)) {
      owner.set(cursor.revisionId, name);
      cursor = cursor.parent === undefined ? undefined : byId.get(cursor.parent);
    }
  }
  return {
    branches: branches.map(([name, head]) => ({ name, head })),
    rows: newestFirst(rows).map(
      (row): RevisionGraphRow => ({
        ...row,
        line: owner.get(row.revisionId) ?? 'main',
        branch: owner.get(row.revisionId),
      }),
    ),
  };
};

const bench = [...olderMain, ...mainRows, ...enclosureRows];

export const lanesScenarios: readonly LanesScenario[] = [
  {
    id: 'graph-two-branches',
    graph: graphOf(bench, [
      ['main', 'c7bom000'],
      ['enclosure-v2', 'd2walls0'],
    ]),
    current: 'enclosure-v2',
    head: 'd2walls0',
    rows: historyOf(bench, 'd2walls0'),
    lanes: 2,
  },
  {
    id: 'graph-four-lanes',
    graph: graphOf(
      [...bench, ...inductorRows, ...thermalRows],
      [
        ['main', 'c7bom000'],
        ['enclosure-v2', 'd2walls0'],
        ['alt-inductor', 'e1induct'],
        ['thermal-test', 'f1vias00'],
      ],
    ),
    current: 'main',
    head: 'c7bom000',
    rows: historyOf(bench, 'c7bom000'),
    isAll: true,
    lanes: 4,
  },
  {
    id: 'branch-just-created',
    graph: graphOf(
      [...olderMain, ...mainRows],
      [
        ['main', 'c7bom000'],
        ['enclosure-v2', 'c7bom000'],
      ],
    ),
    current: 'enclosure-v2',
    head: 'c7bom000',
    rows: historyOf([...olderMain, ...mainRows], 'c7bom000'),
    lanes: 2,
  },
  {
    id: 'branch-from-older',
    graph: graphOf(
      [...olderMain, ...mainRows],
      [
        ['main', 'c7bom000'],
        ['retry-layout', 'c4bosses'],
      ],
    ),
    current: 'retry-layout',
    head: 'c4bosses',
    rows: historyOf([...olderMain, ...mainRows], 'c4bosses'),
    lanes: 2,
  },
  {
    id: 'branch-merged',
    graph: graphOf(
      [...bench, mergeRow],
      [
        ['main', 'c8merged'],
        ['enclosure-v2', 'd2walls0'],
      ],
    ),
    current: 'main',
    head: 'c8merged',
    rows: historyOf([...bench, mergeRow], 'c8merged'),
    lanes: 2,
  },
  {
    /* This branch on main with an unmerged branch: no fork in view, so one lane, exactly the one-branch list. */
    id: 'this-branch-main-alone',
    graph: graphOf(bench, [
      ['main', 'c7bom000'],
      ['enclosure-v2', 'd2walls0'],
    ]),
    current: 'main',
    head: 'c7bom000',
    rows: historyOf(bench, 'c7bom000'),
    lanes: 1,
  },
];

/** The one-branch project: `main` alone, as C3 renders it. */
export const oneBranchRows: readonly RevisionRow[] = historyOf(bench, 'c7bom000');
