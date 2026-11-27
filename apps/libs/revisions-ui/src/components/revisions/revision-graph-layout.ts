/**
 * The History branch graph's topology (History D1): display rows in, a lane per
 * marker and the edges between them out.
 *
 * Pure and deterministic: no DOM, no React, no pixels beyond each row's nominal
 * height, which only compares lane orders. The renderer (D2) measures the rows
 * and turns this into rails and S-bends. The rules are the blueprint's
 * (invariant I10), lifted from the review canvas's `graph-layout.ts`:
 *
 * - `main` is lane 0. Other lines follow the order given, unless another order
 *   lets a bend avoid running across another line's marker.
 * - A solid line ends on a marker or on the end of a bend, never in mid-air.
 *   Dashed lines may end freely: the fade above Show older, a pending merge.
 * - A line's rail ends at its newest marker. A name chip draws no rail.
 * - A fork travels up from the entry the line starts from; a merge travels down
 *   from the merge's marker to the side it brought in; a pending merge is the
 *   same shape, dashed.
 * - A branch with no entries yet ends at its open end, and the fork ends on it.
 *
 * The rows come from the History graph read (`readRevisionGraph`): a row's
 * `line` is the node's `branch` here, so a side no branch names takes a lane like
 * any other. {@link graphGeometry} turns a layout and the measured rows into
 * pixels (D2).
 */

/** Geometry in CSS px, for comparing lane orders. Lane spacing and origin are the timeline's 1rem gutter at `pl-2`. */
export const graphMetrics = {
  /** Distance between two lanes' centres. */
  laneStep: 16,
  /** Centre of lane 0, from the list's left edge. */
  laneOrigin: 16,
  /** A bend is as tall as its sideways distance plus this. */
  bendPad: 12,
  /** Rail and bend stroke width. */
  stroke: 2,
} as const;

/** {@link graphMetrics}, or another geometry of the same shape. */
export type GraphMetrics = Readonly<Record<keyof typeof graphMetrics, number>>;

/**
 * What a marker stands for.
 *
 * - `entry`: a history entry, an 8 px solid dot.
 * - `version`: a version, a 12 px solid dot.
 * - `current`: the entry the files are at, a 14 px ring.
 * - `fold`: folded autosaves or older entries, a 12 px dashed grey circle.
 * - `setup`: Tau's own setup changes, a 6 px hollow grey circle.
 * - `conflict`: a merge waiting on a decision, a 14 px amber diamond.
 * - `open`: a branch's open end (no entries yet, or the agent still working), a 10 px dashed circle.
 */
export type MarkerKind = 'entry' | 'version' | 'current' | 'fold' | 'setup' | 'conflict' | 'open';

/** How a rail or bend is stroked. */
export type LineStyle = 'solid' | 'dashed';

/** The marker a display row carries, and what it hangs from. */
export type GraphNode = Readonly<{
  /** The line whose lane the marker sits on: a branch name, or a nameless side's key. */
  branch: string;
  marker: MarkerKind;
  /** The entries the marker stands for, newest first: one for an entry, several for a fold, none for pending work. */
  ids: readonly string[];
  /** First parent of the oldest entry in `ids`. */
  parent?: string | undefined;
  /** A merge's other parents (`RevisionRow.otherParents`). */
  otherParents?: readonly string[] | undefined;
  /** Not an entry yet: the agent's work in progress, or a merge waiting on a decision about `from`. */
  pending?: Readonly<{ kind: 'working' } | { kind: 'merge'; from: string }> | undefined;
  /** An empty branch's open end: the entry the branch starts from. */
  startsFrom?: string | undefined;
}>;

/** One display row of the History list, newest first. */
export type GraphRow = Readonly<{
  key: string;
  /** Absent on rows with no marker: day labels, name chips of branches that have entries, the backup boundary. */
  node?: GraphNode | undefined;
  /** `older` is the Show older row, where a rail that continues below fades out. */
  role?: 'older' | undefined;
  /** Distance from the row's top to the centre of its first line, where its marker sits. */
  anchor: number;
  /** Nominal height, used only to compare lane orders before the page has measured its rows. */
  height: number;
}>;

/** Where one end of a rail is. */
export type RailEnd =
  | Readonly<{ at: 'node'; row: number }>
  | Readonly<{ at: 'bend'; bend: number }>
  | Readonly<{ at: 'fade'; row: number }>;

/** A marker, by row and lane. */
export type LayoutNode = Readonly<{ row: number; lane: number; branch: string; marker: MarkerKind }>;

/** A vertical run on one lane, from its upper end to its lower end. */
export type LayoutRail = Readonly<{ lane: number; branch: string; upper: RailEnd; lower: RailEnd; style: LineStyle }>;

/**
 * An S between two lanes. It starts on the marker of `originRow` and travels
 * `direction` to `lane`, never past the marker of `limitRow`.
 *
 * - `fork`: a line leaving the entry it starts from; travels up.
 * - `merge`: a merge's marker reaching down to the side it brought in.
 * - `link`: the same shape, dashed, for a merge that has not landed.
 */
export type LayoutBend = Readonly<{
  kind: 'fork' | 'merge' | 'link';
  /** The line whose colour the bend takes: the line that forks, or the one merged in. */
  branch: string;
  originRow: number;
  originLane: number;
  lane: number;
  limitRow: number;
  direction: 'up' | 'down';
  style: LineStyle;
}>;

/** Lanes, markers and the edges between them, by row index and lane index. */
export type GraphLayout = Readonly<{
  /** The line on each lane; lane 0 first. */
  lanes: readonly string[];
  nodes: readonly LayoutNode[];
  rails: readonly LayoutRail[];
  bends: readonly LayoutBend[];
}>;

type Draft = { nodes: LayoutNode[]; rails: LayoutRail[]; bends: LayoutBend[] };

type NodeRow = Readonly<{ row: number; node: GraphNode }>;

const emptyLayout: GraphLayout = { lanes: [], nodes: [], rails: [], bends: [] };

const nodeRowsOf = (rows: readonly GraphRow[]): NodeRow[] =>
  rows.flatMap((entry, row) => (entry.node === undefined ? [] : [{ row, node: entry.node }]));

/** What every drafting step reads for one lane order, and the draft it writes. */
type Drafting = Readonly<{
  rows: readonly GraphRow[];
  lanes: readonly string[];
  nodeRows: readonly NodeRow[];
  laneOf: ReadonlyMap<string, number>;
  rowOfId: ReadonlyMap<string, number>;
  laneAt: (row: number) => number;
  newestOn: (branch: string) => NodeRow | undefined;
  draft: Draft;
}>;

/** A marker's row and lane, for the edges that leave it. */
type Origin = Readonly<{ row: number; lane: number }>;

/**
 * Each line's own rails, and the fork that joins its oldest marker to the entry it starts from.
 *
 * @param drafting - The lane order being drafted.
 */
const draftLines = ({ rows, lanes, nodeRows, rowOfId, laneAt, draft }: Drafting): void => {
  const olderRow = rows.findIndex((row) => row.role === 'older');
  for (const [lane, branch] of lanes.entries()) {
    const own = nodeRows.filter((entry) => entry.node.branch === branch);
    // Consecutive markers of one line are one rail; pending work hangs by dashes.
    for (const [index, upper] of own.entries()) {
      const lower = own[index + 1];
      if (lower !== undefined) {
        draft.rails.push({
          lane,
          branch,
          upper: { at: 'node', row: upper.row },
          lower: { at: 'node', row: lower.row },
          style: upper.node.pending === undefined ? 'solid' : 'dashed',
        });
      }
    }

    const oldest = own.at(-1);
    if (oldest === undefined) {
      continue;
    }
    const origin = oldest.node.startsFrom ?? oldest.node.parent;
    const originRow = origin === undefined ? undefined : rowOfId.get(origin);
    if (originRow !== undefined && laneAt(originRow) !== lane) {
      // The line leaves another lane: one bend up from the entry it starts from, then its own rail.
      const bend = draft.bends.length;
      draft.bends.push({
        kind: 'fork',
        branch,
        originRow,
        originLane: laneAt(originRow),
        lane,
        limitRow: oldest.row,
        direction: 'up',
        style: 'solid',
      });
      draft.rails.push({
        lane,
        branch,
        upper: { at: 'node', row: oldest.row },
        lower: { at: 'bend', bend },
        style: oldest.node.pending === undefined ? 'solid' : 'dashed',
      });
    } else if (origin !== undefined && originRow === undefined && olderRow > oldest.row) {
      // The line continues below what is shown.
      draft.rails.push({
        lane,
        branch,
        upper: { at: 'node', row: oldest.row },
        lower: { at: 'fade', row: olderRow },
        style: 'solid',
      });
    }
  }
};

/**
 * A landed merge's bends down to each side it brought in.
 *
 * @param drafting - The lane order being drafted.
 * @param origin - The merge's row and lane.
 * @param otherParents - The sides it brought in.
 */
const draftMerge = (
  { rows, rowOfId, laneAt, newestOn, draft }: Drafting,
  { row, lane }: Origin,
  otherParents: readonly string[],
): void => {
  for (const other of otherParents) {
    const otherRow = rowOfId.get(other);
    if (otherRow === undefined || laneAt(otherRow) === lane) {
      continue;
    }
    const source = rows[otherRow]?.node?.branch ?? '';
    const bend = draft.bends.length;
    draft.bends.push({
      kind: 'merge',
      branch: source,
      originRow: row,
      originLane: lane,
      lane: laneAt(otherRow),
      limitRow: otherRow,
      direction: 'down',
      style: 'solid',
    });
    // When the merged line has nothing newer in view, its rail starts where the bend arrives.
    if (newestOn(source)?.row === otherRow) {
      draft.rails.push({
        lane: laneAt(otherRow),
        branch: source,
        upper: { at: 'bend', bend },
        lower: { at: 'node', row: otherRow },
        style: 'solid',
      });
    }
  }
};

/**
 * A pending merge's dashed link down to the line it waits on.
 *
 * @param drafting - The lane order being drafted.
 * @param origin - The pending merge's row and lane.
 * @param from - The line it waits on.
 */
const draftLink = ({ laneOf, newestOn, draft }: Drafting, { row, lane }: Origin, from: string): void => {
  const source = newestOn(from);
  const sourceLane = laneOf.get(from);
  if (source === undefined || sourceLane === undefined || sourceLane === lane) {
    return;
  }
  const bend = draft.bends.length;
  draft.bends.push({
    kind: 'link',
    branch: from,
    originRow: row,
    originLane: lane,
    lane: sourceLane,
    limitRow: source.row,
    direction: 'down',
    style: 'dashed',
  });
  draft.rails.push({
    lane: sourceLane,
    branch: from,
    upper: { at: 'bend', bend },
    lower: { at: 'node', row: source.row },
    style: 'dashed',
  });
};

/**
 * Markers, rails and bends for one lane order.
 *
 * @param rows - The display rows, newest first.
 * @param lanes - The line on each lane.
 * @returns The draft for that order.
 */
const drafted = (rows: readonly GraphRow[], lanes: readonly string[]): Draft => {
  const laneOf = new Map(lanes.map((branch, lane) => [branch, lane] as const));
  const nodeRows = nodeRowsOf(rows);
  const rowOfId = new Map<string, number>();
  for (const { row, node } of nodeRows) {
    for (const id of node.ids) {
      rowOfId.set(id, row);
    }
  }
  const drafting: Drafting = {
    rows,
    lanes,
    nodeRows,
    laneOf,
    rowOfId,
    laneAt: (row) => laneOf.get(rows[row]?.node?.branch ?? '') ?? 0,
    newestOn: (branch) => nodeRows.find((entry) => entry.node.branch === branch),
    draft: { nodes: [], rails: [], bends: [] },
  };

  for (const { row, node } of nodeRows) {
    drafting.draft.nodes.push({ row, lane: laneOf.get(node.branch) ?? 0, branch: node.branch, marker: node.marker });
  }
  draftLines(drafting);
  for (const { row, node } of nodeRows) {
    const origin = { row, lane: laneOf.get(node.branch) ?? 0 };
    draftMerge(drafting, origin, node.otherParents ?? []);
    if (node.pending?.kind === 'merge') {
      draftLink(drafting, origin, node.pending.from);
    }
  }
  return drafting.draft;
};

/**
 * Markers of other lanes a bend would run across, then rails it crosses, then how far bends travel sideways.
 *
 * @param rows - The display rows, for their nominal heights.
 * @param draft - One lane order's draft.
 * @param metrics - Geometry.
 * @returns A cost; lower is better.
 */
const costOf = (rows: readonly GraphRow[], draft: Draft, metrics: GraphMetrics): number => {
  const tops: number[] = [];
  let offset = 0;
  for (const row of rows) {
    tops.push(offset);
    offset += row.height;
  }
  const yOf = (row: number): number => (tops[row] ?? 0) + (rows[row]?.anchor ?? 0);
  let collisions = 0;
  let crossings = 0;
  let travel = 0;
  for (const bend of draft.bends) {
    const start = yOf(bend.originRow);
    const height = Math.abs(bend.lane - bend.originLane) * metrics.laneStep + metrics.bendPad;
    const limit = yOf(bend.limitRow);
    const end = bend.direction === 'up' ? Math.max(start - height, limit) : Math.min(start + height, limit);
    const [top, bottom] = [Math.min(start, end), Math.max(start, end)];
    const [low, high] = [Math.min(bend.lane, bend.originLane), Math.max(bend.lane, bend.originLane)];
    travel += high - low;
    for (const node of draft.nodes) {
      if (node.lane > low && node.lane < high && yOf(node.row) >= top - 8 && yOf(node.row) <= bottom + 8) {
        collisions += 1;
      }
    }
    for (const rail of draft.rails) {
      const upper = rail.upper.at === 'node' ? yOf(rail.upper.row) : top;
      const lower = rail.lower.at === 'bend' ? bottom : yOf(rail.lower.row);
      if (rail.lane > low && rail.lane < high && upper < bottom && lower > top) {
        crossings += 1;
      }
    }
  }
  return collisions * 10_000 + crossings * 100 + travel;
};

const permutations = <T>(items: readonly T[]): T[][] =>
  items.length <= 1
    ? [[...items]]
    : items.flatMap((item, index) =>
        permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]),
      );

/**
 * Lay the History list out as a graph.
 *
 * @param rows - The display rows, newest first. A row's `node` names its line, marker and parents.
 * @param branches - The lines that may take a lane, in preference order; the first in view is lane 0
 *   (`main`). A line in the rows but not listed follows the listed ones, newest first. The rest keep
 *   this order unless another order lets a bend avoid running across a marker.
 * @param metrics - Geometry, for comparing lane orders.
 * @returns Lanes, markers, rails and bends, by row index and lane index. The same input always gives
 *   the same layout.
 */
export const layoutRevisionGraph = (
  rows: readonly GraphRow[],
  branches: readonly string[],
  metrics: GraphMetrics = graphMetrics,
): GraphLayout => {
  const present = [...new Set(nodeRowsOf(rows).map((entry) => entry.node.branch))];
  const inView = [
    ...branches.filter((branch) => present.includes(branch)),
    ...present.filter((branch) => !branches.includes(branch)),
  ];
  const [first, ...rest] = [...new Set(inView)];
  if (first === undefined) {
    return emptyLayout;
  }
  // ponytail: exhaustive up to five side lanes (120 orders); beyond that the preference order stands.
  const orders = rest.length <= 5 ? permutations(rest).map((order) => [first, ...order]) : [[first, ...rest]];
  let best: Readonly<{ lanes: readonly string[]; draft: Draft; cost: number }> | undefined;
  for (const lanes of orders) {
    const draft = drafted(rows, lanes);
    const cost = costOf(rows, draft, metrics);
    if (best === undefined || cost < best.cost) {
      best = { lanes, draft, cost };
    }
  }
  return best === undefined ? emptyLayout : { lanes: best.lanes, ...best.draft };
};

/** A row's measured place in the list, in the graph's coordinates. */
export type RowBox = Readonly<{ top: number; height: number }>;

/** A marker's centre. */
export type GeometryMarker = LayoutNode & Readonly<{ x: number; y: number }>;

/** One drawn rail segment. */
export type GeometryLine = Readonly<{
  lane: number;
  branch: string;
  x: number;
  y1: number;
  y2: number;
  /** `fade` is the dotted tail above Show older. */
  style: LineStyle | 'fade';
}>;

/** One drawn bend: a single cubic, `M x0 y0 C x0 ym, x1 ym, x1 y1`. */
export type GeometryPath = Readonly<{
  kind: LayoutBend['kind'];
  branch: string;
  style: LineStyle;
  d: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}>;

/** Markers, rails and bends in pixels, ready to draw. */
export type GraphGeometry = Readonly<{
  /** Width the lanes need, from the list's left edge to the content column. */
  width: number;
  markers: readonly GeometryMarker[];
  lines: readonly GeometryLine[];
  paths: readonly GeometryPath[];
}>;

/**
 * The gutter's width for a number of lanes; the content column starts after it.
 *
 * @param laneCount - Lanes in view.
 * @param metrics - Geometry.
 * @returns The gutter column's width in px, without the row's left padding.
 */
export const gutterWidth = (laneCount: number, metrics: GraphMetrics = graphMetrics): number =>
  Math.max(1, laneCount) * metrics.laneStep;

/**
 * Turn a layout into pixels (D2).
 *
 * Each bend is one cubic whose control points sit at mid-height, one above its
 * start and one below its end, so both ends are vertical. It is as tall as its
 * sideways distance plus {@link graphMetrics}' `bendPad`, and ends sooner when
 * the marker it runs to is nearer. A rail that meets a bend ends exactly where
 * the bend does.
 *
 * @param layout - From {@link layoutRevisionGraph}.
 * @param rows - The same rows the layout was made from.
 * @param boxes - Each row's measured top and height, in the graph's coordinates.
 * @returns Marker centres, rail segments and bend paths, in {@link graphMetrics}' geometry.
 */
export const graphGeometry = (
  layout: GraphLayout,
  rows: readonly GraphRow[],
  boxes: readonly RowBox[],
): GraphGeometry => {
  const metrics = graphMetrics;
  const xOf = (lane: number): number => metrics.laneOrigin + lane * metrics.laneStep;
  const yOf = (row: number): number => (boxes[row]?.top ?? 0) + (rows[row]?.anchor ?? 0);

  const paths = layout.bends.map((bend): GeometryPath => {
    const [x0, x1, y0] = [xOf(bend.originLane), xOf(bend.lane), yOf(bend.originRow)];
    const height = Math.abs(x1 - x0) + metrics.bendPad;
    const limit = yOf(bend.limitRow);
    const y1 = bend.direction === 'up' ? Math.max(y0 - height, limit) : Math.min(y0 + height, limit);
    const middle = (y0 + y1) / 2;
    return {
      kind: bend.kind,
      branch: bend.branch,
      style: bend.style,
      d: `M${String(x0)} ${String(y0)}C${String(x0)} ${String(middle)} ${String(x1)} ${String(middle)} ${String(x1)} ${String(y1)}`,
      x0,
      y0,
      x1,
      y1,
    };
  });

  const lines: GeometryLine[] = [];
  for (const rail of layout.rails) {
    const x = xOf(rail.lane);
    const endY = (end: RailEnd): number => (end.at === 'bend' ? (paths[end.bend]?.y1 ?? 0) : yOf(end.row));
    const y1 = endY(rail.upper);
    if (rail.lower.at === 'fade') {
      // Solid to the top of the Show older row, then dotted to its centre line.
      const top = boxes[rail.lower.row]?.top ?? y1;
      if (top > y1) {
        lines.push({ lane: rail.lane, branch: rail.branch, x, y1, y2: top, style: rail.style });
      }
      lines.push({
        lane: rail.lane,
        branch: rail.branch,
        x,
        y1: Math.max(y1, top),
        y2: endY(rail.lower),
        style: 'fade',
      });
      continue;
    }
    const y2 = endY(rail.lower);
    if (y2 > y1) {
      lines.push({ lane: rail.lane, branch: rail.branch, x, y1, y2, style: rail.style });
    }
  }

  return {
    width: gutterWidth(layout.lanes.length, metrics),
    markers: layout.nodes.map((node) => ({ ...node, x: xOf(node.lane), y: yOf(node.row) })),
    lines,
    paths,
  };
};
