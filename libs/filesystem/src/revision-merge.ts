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

/** Typed structural conflicts returned by a three-way tree merge. @public */
export type RevisionTreeConflict = AddAddConflict | ModifyDeleteConflict | BinaryConflict | TextConflict;

/** Deterministic result of a three-way revision-tree merge. @public */
export type RevisionTreeMergeResult =
  | Readonly<{ status: 'merged'; tree: ImmutableRevisionTree }>
  | Readonly<{ status: 'conflicted'; conflicts: readonly RevisionTreeConflict[] }>;

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

  return conflicts.length === 0
    ? { status: 'merged', tree: new ImmutableRevisionTree(merged) }
    : { status: 'conflicted', conflicts };
};
