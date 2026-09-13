import { seemsBinary } from '#content-metadata.js';
import { ImmutableRevisionTree } from '#revision-tree.js';

/** Conflicting additions of different bytes at the same absent base path. @public */
export type AddAddConflict = Readonly<{
  type: 'add-add';
  path: string;
  ours: Uint8Array<ArrayBuffer>;
  theirs: Uint8Array<ArrayBuffer>;
}>;

/** One side modified a base file while the other deleted it. @public */
export type ModifyDeleteConflict = Readonly<{
  type: 'modify-delete';
  path: string;
  modifiedBy: 'ours' | 'theirs';
  base: Uint8Array<ArrayBuffer>;
  modified: Uint8Array<ArrayBuffer>;
}>;

/** Both sides changed binary content differently. @public */
export type BinaryConflict = Readonly<{
  type: 'binary';
  path: string;
  base: Uint8Array<ArrayBuffer>;
  ours: Uint8Array<ArrayBuffer>;
  theirs: Uint8Array<ArrayBuffer>;
}>;

/** Overlapping text edits that cannot be combined without choosing a side. @public */
export type TextConflict = Readonly<{
  type: 'text';
  path: string;
  reason: 'overlap' | 'analysis-limit';
  base: string;
  ours: string;
  theirs: string;
}>;

/**
 * One side kept a file where the other grew a directory over the same name.
 *
 * Git cannot represent `a` beside `a/b.txt` and {@link ImmutableRevisionTree}
 * refuses it at construction, so this used to surface as a `TypeError` thrown
 * out of an otherwise successful merge (W3a re-review). It is a conflict like
 * any other: neither path settles, and a person chooses which shape survives.
 *
 * @public
 */
export type FileDirectoryConflict = Readonly<{
  type: 'file-directory';
  /** The path held as a file. */
  path: string;
  /** One path held under it as a directory; the first in lexical order. */
  directoryPath: string;
  /** Which side holds {@link FileDirectoryConflict.path} as a file. */
  fileSide: 'ours' | 'theirs';
}>;

/** Typed structural conflicts returned by a three-way tree merge. @public */
export type RevisionTreeConflict =
  | AddAddConflict
  | ModifyDeleteConflict
  | BinaryConflict
  | TextConflict
  | FileDirectoryConflict;

/** Deterministic result of a three-way revision-tree merge. @public */
export type RevisionTreeMergeResult =
  | Readonly<{ status: 'merged'; tree: ImmutableRevisionTree }>
  | Readonly<{
      status: 'conflicted';
      conflicts: readonly RevisionTreeConflict[];
      /**
       * Everything that *did* settle, as a tree of its own.
       *
       * Resolution is then "this tree plus one chosen side per conflicted
       * path" — the alternative is re-running the whole merge once the person
       * has chosen, which is the same computation done twice and a second
       * chance for the two runs to disagree (W10).
       */
      merged: ImmutableRevisionTree;
    }>;

/** The two sides of one materialized conflict, in the words a reader sees. @public */
export type ConflictMarkerLabels = Readonly<{ ours: string; theirs: string }>;

/** One file's three terms, for {@link renderConflictMarkers}. @public */
export type ConflictMarkerInput = Readonly<{
  /** Absent when the path was added on both sides. */
  base: Uint8Array<ArrayBuffer> | undefined;
  /** Absent when this side deleted the path. */
  ours: Uint8Array<ArrayBuffer> | undefined;
  /** Absent when that side deleted the path. */
  theirs: Uint8Array<ArrayBuffer> | undefined;
  labels: ConflictMarkerLabels;
}>;

type TextHunk = Readonly<{
  start: number;
  end: number;
  replacement: readonly string[];
}>;

type TextMergeResult =
  | Readonly<{ status: 'merged'; text: string }>
  | Readonly<{ status: 'conflicted'; reason: TextConflict['reason'] }>;

type StructuralMergeInput = Readonly<{
  path: string;
  base: Uint8Array<ArrayBuffer> | undefined;
  ours: Uint8Array<ArrayBuffer> | undefined;
  theirs: Uint8Array<ArrayBuffer> | undefined;
}>;

type StructuralMergeResult =
  | Readonly<{ status: 'resolved'; content: Uint8Array<ArrayBuffer> | undefined }>
  | Readonly<{ status: 'conflicted'; conflict: AddAddConflict | ModifyDeleteConflict }>
  | Readonly<{
      status: 'both-modified';
      base: Uint8Array<ArrayBuffer>;
      ours: Uint8Array<ArrayBuffer>;
      theirs: Uint8Array<ArrayBuffer>;
    }>;

type ChangedFileMergeResult =
  | Readonly<{ status: 'merged'; content: Uint8Array<ArrayBuffer> }>
  | Readonly<{ status: 'conflicted'; conflict: BinaryConflict | TextConflict }>;

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();
const maxDiffCells = 4_000_000;

const bytesEqual = (left: Uint8Array<ArrayBuffer> | undefined, right: Uint8Array<ArrayBuffer> | undefined): boolean => {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.byteLength !== right.byteLength) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
};

const own = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);
const comparePath = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const splitLines = (text: string): string[] => {
  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\n') {
      lines.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < text.length || text.length === 0) {
    lines.push(text.slice(start));
  }
  return lines;
};

const hunkEqual = (left: TextHunk, right: TextHunk): boolean =>
  left.start === right.start &&
  left.end === right.end &&
  left.replacement.length === right.replacement.length &&
  left.replacement.every((line, index) => line === right.replacement[index]);

const hunksOverlap = (left: TextHunk, right: TextHunk): boolean => {
  if (left.start === left.end && right.start === right.end) {
    return left.start === right.start;
  }
  if (left.start === left.end) {
    return left.start > right.start && left.start < right.end;
  }
  if (right.start === right.end) {
    return right.start > left.start && right.start < left.end;
  }
  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
};

const diffHunks = (base: readonly string[], target: readonly string[]): readonly TextHunk[] | undefined => {
  const columns = target.length + 1;
  const cells = (base.length + 1) * columns;
  if (cells > maxDiffCells) {
    return undefined;
  }

  const lengths = new Uint32Array(cells);
  for (let baseIndex = base.length - 1; baseIndex >= 0; baseIndex--) {
    for (let targetIndex = target.length - 1; targetIndex >= 0; targetIndex--) {
      const offset = baseIndex * columns + targetIndex;
      lengths[offset] =
        base[baseIndex] === target[targetIndex]
          ? lengths[(baseIndex + 1) * columns + targetIndex + 1]! + 1
          : Math.max(lengths[(baseIndex + 1) * columns + targetIndex]!, lengths[offset + 1]!);
    }
  }

  const hunks: TextHunk[] = [];
  let baseIndex = 0;
  let targetIndex = 0;
  while (baseIndex < base.length || targetIndex < target.length) {
    if (base[baseIndex] === target[targetIndex]) {
      baseIndex++;
      targetIndex++;
      continue;
    }

    const start = baseIndex;
    const replacement: string[] = [];
    while ((baseIndex < base.length || targetIndex < target.length) && base[baseIndex] !== target[targetIndex]) {
      const insertScore = targetIndex < target.length ? lengths[baseIndex * columns + targetIndex + 1]! : -1;
      const deleteScore = baseIndex < base.length ? lengths[(baseIndex + 1) * columns + targetIndex]! : -1;
      if (targetIndex < target.length && (baseIndex === base.length || insertScore >= deleteScore)) {
        replacement.push(target[targetIndex]!);
        targetIndex++;
      } else {
        baseIndex++;
      }
    }
    hunks.push({ start, end: baseIndex, replacement });
  }
  return hunks;
};

const mergeText = (base: string, ours: string, theirs: string): TextMergeResult => {
  const baseLines = splitLines(base);
  const oursHunks = diffHunks(baseLines, splitLines(ours));
  const theirsHunks = diffHunks(baseLines, splitLines(theirs));
  if (oursHunks === undefined || theirsHunks === undefined) {
    return { status: 'conflicted', reason: 'analysis-limit' };
  }

  for (const oursHunk of oursHunks) {
    for (const theirsHunk of theirsHunks) {
      if (hunksOverlap(oursHunk, theirsHunk) && !hunkEqual(oursHunk, theirsHunk)) {
        return { status: 'conflicted', reason: 'overlap' };
      }
    }
  }

  const hunks = [...oursHunks];
  for (const hunk of theirsHunks) {
    if (!hunks.some((candidate) => hunkEqual(candidate, hunk))) {
      hunks.push(hunk);
    }
  }
  hunks.sort((left, right) => right.start - left.start || right.end - left.end);
  const merged = [...baseLines];
  for (const hunk of hunks) {
    merged.splice(hunk.start, hunk.end - hunk.start, ...hunk.replacement);
  }
  return { status: 'merged', text: merged.join('') };
};

const decodeText = (bytes: Uint8Array<ArrayBuffer>): string | undefined => {
  try {
    return textDecoder.decode(bytes);
  } catch {
    return undefined;
  }
};

const resolveStructuralMerge = (input: StructuralMergeInput): StructuralMergeResult => {
  const { path, base, ours, theirs } = input;
  if (bytesEqual(ours, theirs)) {
    return { status: 'resolved', content: ours };
  }
  if (bytesEqual(base, ours)) {
    return { status: 'resolved', content: theirs };
  }
  if (bytesEqual(base, theirs)) {
    return { status: 'resolved', content: ours };
  }
  if (base === undefined) {
    if (ours === undefined || theirs === undefined) {
      throw new Error(`Unreachable add/add merge state for ${path}`);
    }
    return {
      status: 'conflicted',
      conflict: { type: 'add-add', path, ours: own(ours), theirs: own(theirs) },
    };
  }
  if (ours === undefined) {
    if (theirs === undefined) {
      throw new Error(`Unreachable modify/delete merge state for ${path}`);
    }
    return {
      status: 'conflicted',
      conflict: { type: 'modify-delete', path, modifiedBy: 'theirs', base: own(base), modified: own(theirs) },
    };
  }
  if (theirs === undefined) {
    return {
      status: 'conflicted',
      conflict: { type: 'modify-delete', path, modifiedBy: 'ours', base: own(base), modified: own(ours) },
    };
  }
  return { status: 'both-modified', base, ours, theirs };
};

const mergeChangedFile = (
  path: string,
  bytes: Readonly<{
    base: Uint8Array<ArrayBuffer>;
    ours: Uint8Array<ArrayBuffer>;
    theirs: Uint8Array<ArrayBuffer>;
  }>,
): ChangedFileMergeResult => {
  const baseText = seemsBinary(bytes.base) ? undefined : decodeText(bytes.base);
  const oursText = seemsBinary(bytes.ours) ? undefined : decodeText(bytes.ours);
  const theirsText = seemsBinary(bytes.theirs) ? undefined : decodeText(bytes.theirs);
  if (baseText === undefined || oursText === undefined || theirsText === undefined) {
    return {
      status: 'conflicted',
      conflict: {
        type: 'binary',
        path,
        base: own(bytes.base),
        ours: own(bytes.ours),
        theirs: own(bytes.theirs),
      },
    };
  }

  const textMerge = mergeText(baseText, oursText, theirsText);
  return textMerge.status === 'conflicted'
    ? {
        status: 'conflicted',
        conflict: {
          type: 'text',
          path,
          reason: textMerge.reason,
          base: baseText,
          ours: oursText,
          theirs: theirsText,
        },
      }
    : { status: 'merged', content: textEncoder.encode(textMerge.text) };
};

/**
 * Paths that survived the merge but cannot share one tree.
 *
 * `a` and `a/b.txt` are representable as two map entries and not as one Git
 * tree, so the collision is found here — once, over every path the result can
 * still carry — rather than discovered as an exception thrown by the
 * constructor.
 *
 * @param merged - Every path that settled, with its bytes.
 * @param conflicts - Every path still being argued about, which a resolution
 *   will put back into the tree and which therefore collides just as hard.
 * @param ours - First descendant tree, to attribute the file side.
 * @returns One conflict per colliding file, with the paths it withdraws.
 */
const prefixCollisions = (
  merged: ReadonlyArray<readonly [string, Uint8Array<ArrayBuffer>]>,
  conflicts: readonly RevisionTreeConflict[],
  ours: ImmutableRevisionTree,
): ReadonlyArray<Readonly<{ conflict: FileDirectoryConflict; paths: ReadonlySet<string> }>> => {
  /* Settled *and* conflicted: a path that is still being argued about is a path
     a resolution will put back into the tree, so it collides with a directory
     of the same name exactly as a settled one does (review R4). */
  const files = new Set([...merged.map(([path]) => path), ...conflicts.map(({ path }) => path)]);
  const found = new Map<string, Readonly<{ conflict: FileDirectoryConflict; paths: Set<string> }>>();
  for (const path of [...files].toSorted(comparePath)) {
    for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
      const prefix = path.slice(0, index);
      if (!files.has(prefix)) {
        continue;
      }
      const existing = found.get(prefix);
      if (existing === undefined) {
        found.set(prefix, {
          conflict: {
            type: 'file-directory',
            path: prefix,
            directoryPath: path,
            fileSide: ours.has(prefix) ? 'ours' : 'theirs',
          },
          paths: new Set([prefix, path]),
        });
        continue;
      }
      existing.paths.add(path);
    }
  }
  return [...found.values()];
};

/** One marker block, with the two sides labelled as the person named them. */
const markerBlock = (ours: string, theirs: string, labels: ConflictMarkerLabels): string =>
  `<<<<<<< ${labels.ours}\n${ours}${ours.endsWith('\n') || ours === '' ? '' : '\n'}=======\n${theirs}${
    theirs.endsWith('\n') || theirs === '' ? '' : '\n'
  }>>>>>>> ${labels.theirs}\n`;

/** One hunk with the side that made it. */
type HunkMember = Readonly<{ hunk: TextHunk; side: 'ours' | 'theirs' }>;

/** One span of base lines both sides may have rewritten. */
type HunkGroup = Readonly<{ start: number; end: number; ours: readonly TextHunk[]; theirs: readonly TextHunk[] }>;

/**
 * Collect each side's hunks into the spans of base lines they share.
 *
 * Transitive: two hunks that do not touch each other still belong together when
 * a third overlaps both, because the span they cover is one region a reader has
 * to read as a whole.
 *
 * @param ours - This side's hunks against the base.
 * @param theirs - That side's hunks against the base.
 * @returns The groups, in base order, each with the members from either side.
 */
const groupHunks = (ours: readonly TextHunk[], theirs: readonly TextHunk[]): readonly HunkGroup[] => {
  const member = (hunk: TextHunk, side: 'ours' | 'theirs'): HunkMember => ({ hunk, side });
  const members: readonly HunkMember[] = [
    ...ours.map((hunk) => member(hunk, 'ours')),
    ...theirs.map((hunk) => member(hunk, 'theirs')),
  ].toSorted((left, right) => left.hunk.start - right.hunk.start || left.hunk.end - right.hunk.end);

  const groups: Array<{ start: number; end: number; ours: TextHunk[]; theirs: TextHunk[] }> = [];
  for (const member of members) {
    const current = groups.at(-1);
    const touches =
      current !== undefined &&
      (member.hunk.start < current.end ||
        (member.hunk.start === current.start && member.hunk.end === current.end) ||
        [...current.ours, ...current.theirs].some((existing) => hunksOverlap(existing, member.hunk)));
    if (current === undefined || !touches) {
      groups.push({
        start: member.hunk.start,
        end: member.hunk.end,
        ours: member.side === 'ours' ? [member.hunk] : [],
        theirs: member.side === 'theirs' ? [member.hunk] : [],
      });
      continue;
    }
    current.end = Math.max(current.end, member.hunk.end);
    current[member.side].push(member.hunk);
  }
  return groups;
};

/**
 * One side's text for one group's span.
 *
 * @param baseLines - The common ancestor, split into lines.
 * @param span - First and one-past-last base line of the group.
 * @param hunks - That side's hunks inside the span.
 * @returns The span as this side rewrote it.
 */
const applyHunks = (
  baseLines: readonly string[],
  span: Readonly<{ start: number; end: number }>,
  hunks: readonly TextHunk[],
): readonly string[] => {
  const lines = baseLines.slice(span.start, span.end);
  for (const hunk of hunks.toSorted((left, right) => right.start - left.start || right.end - left.end)) {
    lines.splice(hunk.start - span.start, hunk.end - hunk.start, ...hunk.replacement);
  }
  return lines;
};

/**
 * Merge two immutable trees against their common base. Paths are processed in
 * lexical order, unchanged-side edits are adopted directly, non-overlapping
 * UTF-8 line edits are composed, and ambiguous cases are returned as typed
 * conflicts rather than conflict-marker bytes.
 *
 * @param base - Common immutable ancestor.
 * @param ours - First descendant tree.
 * @param theirs - Second descendant tree.
 * @returns A merged immutable tree or stable, path-sorted conflicts.
 * @public
 */
export const mergeRevisionTrees = (
  base: ImmutableRevisionTree,
  ours: ImmutableRevisionTree,
  theirs: ImmutableRevisionTree,
): RevisionTreeMergeResult => {
  const paths = new Set([
    ...base.entries().map(({ path }) => path),
    ...ours.entries().map(({ path }) => path),
    ...theirs.entries().map(({ path }) => path),
  ]);
  const merged: Array<readonly [string, Uint8Array<ArrayBuffer>]> = [];
  const conflicts: RevisionTreeConflict[] = [];

  for (const path of [...paths].sort(comparePath)) {
    const structural = resolveStructuralMerge({
      path,
      base: base.get(path),
      ours: ours.get(path),
      theirs: theirs.get(path),
    });
    if (structural.status === 'resolved') {
      if (structural.content !== undefined) {
        merged.push([path, structural.content]);
      }
      continue;
    }
    if (structural.status === 'conflicted') {
      conflicts.push(structural.conflict);
      continue;
    }
    const changed = mergeChangedFile(path, structural);
    if (changed.status === 'conflicted') {
      conflicts.push(changed.conflict);
      continue;
    }
    merged.push([path, changed.content]);
  }

  const collisions = prefixCollisions(merged, conflicts, ours);
  const collided = (path: string): boolean => collisions.some((entry) => entry.paths.has(path));
  const settled = merged.filter(([path]) => !collided(path));
  /* The shape wins: a path whose own name is a directory on the other side has
     no content question left to ask, so its content conflict is withdrawn in
     favour of the one typed conflict a person can actually answer. */
  const all = [
    ...conflicts.filter(({ path }) => !collided(path)),
    ...collisions.map(({ conflict }) => conflict),
  ].toSorted((left, right) => comparePath(left.path, right.path));

  return all.length === 0
    ? { status: 'merged', tree: new ImmutableRevisionTree(settled) }
    : { status: 'conflicted', conflicts: all, merged: new ImmutableRevisionTree(settled) };
};

/**
 * Render one conflicted file the way every merge tool in the world renders it.
 *
 * Per hunk, not per file: only the lines the two sides both touched carry
 * markers, so a three-line collision in a two-thousand-line part reads as three
 * lines. A side that deleted the path is an empty half rather than a missing
 * file — "one of us removed this" is a choice, and it has to be visible to be
 * made.
 *
 * @param input - The three terms and the two side labels.
 * @returns Marker text, or `undefined` when a side is not decodable UTF-8 text
 *   (binary and parametric files are choose-one only, A22).
 * @public
 */
export const renderConflictMarkers = (input: ConflictMarkerInput): string | undefined => {
  const decoded = [input.base, input.ours, input.theirs].map((side) =>
    side === undefined ? '' : seemsBinary(side) ? undefined : decodeText(side),
  );
  const [baseText, oursText, theirsText] = decoded;
  if (baseText === undefined || oursText === undefined || theirsText === undefined) {
    return undefined;
  }

  const baseLines = splitLines(baseText);
  const oursHunks = diffHunks(baseLines, splitLines(oursText));
  const theirsHunks = diffHunks(baseLines, splitLines(theirsText));
  if (oursHunks === undefined || theirsHunks === undefined) {
    /* The diff is too large to describe hunk by hunk (`analysis-limit`), so the
     * whole file is one conflict. Still a choice, just a coarser one. */
    return markerBlock(oursText, theirsText, input.labels);
  }

  const groups = groupHunks(oursHunks, theirsHunks);
  const rendered: string[] = [];
  let cursor = 0;
  for (const group of groups) {
    rendered.push(...baseLines.slice(cursor, group.start));
    const ourSide = applyHunks(baseLines, group, group.ours);
    const theirSide = applyHunks(baseLines, group, group.theirs);
    if (group.ours.length === 0 || group.theirs.length === 0 || ourSide.join('') === theirSide.join('')) {
      rendered.push(...(group.theirs.length === 0 ? ourSide : theirSide));
    } else {
      rendered.push(markerBlock(ourSide.join(''), theirSide.join(''), input.labels));
    }
    cursor = group.end;
  }
  rendered.push(...baseLines.slice(cursor));
  return rendered.join('');
};
