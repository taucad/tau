import { seemsBinary, headSniffByteLength } from '@taucad/filesystem';
import { equalBytes } from '#object-hash.js';
import { revisionTreeFiles } from '#algorithms/revision-tree.js';
import type { ImmutableRevisionTree, RevisionTreeEntry } from '#algorithms/revision-tree.js';

/** How one path changed between two revisions. @public */
export type RevisionDiffKind = 'added' | 'modified' | 'deleted';

/** One changed path as `diff` reports it. Tree-free by contract: paths, never content. @public */
export type RevisionDiffEntry = Readonly<{
  path: string;
  kind: RevisionDiffKind;
}>;

/** Non-line changes a text diff cannot explain. @public */
export type RevisionComparisonNotice =
  | 'empty-added'
  | 'empty-deleted'
  | 'encoding'
  | 'executable-added'
  | 'executable-removed'
  | 'line-endings'
  | 'final-newline';

/** Exact file change and its safely decoded presentation on either host. @public */
export type RevisionFileComparison = Readonly<{
  original: string;
  modified: string;
  kind: 'text' | 'binary' | 'unsupported';
  change: RevisionDiffEntry['kind'] | 'unchanged';
  notices: readonly RevisionComparisonNotice[];
}>;

type File = Pick<RevisionTreeEntry, 'content' | 'mode'>;

const sameFile = (original: File | undefined, modified: File | undefined): boolean =>
  original === undefined || modified === undefined
    ? original === modified
    : original.mode === modified.mode && equalBytes(original.content, modified.content);

const startsWith = (bytes: Uint8Array<ArrayBuffer>, prefix: readonly number[]): boolean =>
  prefix.every((byte, index) => bytes[index] === byte);

const decode = (
  file: File | undefined,
): Readonly<{
  kind: RevisionFileComparison['kind'];
  text: string;
  encoding: string;
}> => {
  if (file === undefined) {
    return { kind: 'text', text: '', encoding: 'utf8' };
  }
  const bytes = file.content;
  if (startsWith(bytes, [0, 0, 0xfe, 0xff]) || startsWith(bytes, [0xff, 0xfe, 0, 0])) {
    return { kind: 'unsupported', text: '', encoding: 'utf-32' };
  }
  const encoding = startsWith(bytes, [0xff, 0xfe]) ? 'utf-16le' : startsWith(bytes, [0xfe, 0xff]) ? 'utf-16be' : 'utf8';
  if (seemsBinary(bytes.subarray(0, headSniffByteLength))) {
    return { kind: 'binary', text: '', encoding: 'binary' };
  }
  try {
    return {
      kind: 'text',
      text: new TextDecoder(encoding, { fatal: true }).decode(bytes),
      encoding: startsWith(bytes, [0xef, 0xbb, 0xbf]) ? 'utf8-bom' : encoding,
    };
  } catch {
    return { kind: 'unsupported', text: '', encoding };
  }
};

const lineEndings = (text: string): string => [...new Set(text.match(/\r\n|\r|\n/gu) ?? [])].sort().join(',');
const finalNewline = (text: string): boolean => /[\r\n]$/u.test(text);

/**
 * Compare exact presence, bytes and modes before decoding supported text.
 *
 * @param input - The two file entries; absence is distinct from an empty file.
 * @returns Text or an honest unsupported/binary result, with non-line changes.
 * @public
 */
export const compareRevisionFile = (input: Readonly<{ original?: File; modified?: File }>): RevisionFileComparison => {
  const { original, modified } = input;
  const change = sameFile(original, modified)
    ? 'unchanged'
    : original === undefined
      ? 'added'
      : modified === undefined
        ? 'deleted'
        : 'modified';
  const before = decode(original);
  const after = decode(modified);
  const kind =
    before.kind === 'unsupported' || after.kind === 'unsupported'
      ? 'unsupported'
      : before.kind === 'binary' || after.kind === 'binary'
        ? 'binary'
        : 'text';
  const notices: RevisionComparisonNotice[] = [];
  if (change === 'added' && kind === 'text' && after.text === '') {
    notices.push('empty-added');
  }
  if (change === 'deleted' && kind === 'text' && before.text === '') {
    notices.push('empty-deleted');
  }
  if (original !== undefined && modified !== undefined) {
    if (before.encoding !== after.encoding) {
      notices.push('encoding');
    }
    if (original.mode !== modified.mode) {
      notices.push(modified.mode === '100755' ? 'executable-added' : 'executable-removed');
    }
    if (kind === 'text') {
      const beforeEndings = lineEndings(before.text);
      const afterEndings = lineEndings(after.text);
      const normalizedBefore = before.text.replaceAll(/\r\n|\r/gu, '\n');
      const normalizedAfter = after.text.replaceAll(/\r\n|\r/gu, '\n');
      if (
        (beforeEndings.length > 0 && afterEndings.length > 0 && beforeEndings !== afterEndings) ||
        (before.text !== after.text && normalizedBefore === normalizedAfter)
      ) {
        notices.push('line-endings');
      }
      if (finalNewline(before.text) !== finalNewline(after.text)) {
        notices.push('final-newline');
      }
    }
  }
  return { original: before.text, modified: after.text, kind, change, notices };
};

/**
 * List exact changed paths between a recorded tree and a captured checkout.
 *
 * @param input - The same trees that define the file comparisons.
 * @returns Sorted file changes including empty files and mode-only changes.
 * @public
 */
export const diffRevisionTrees = (
  input: Readonly<{
    original: ImmutableRevisionTree;
    modified: ImmutableRevisionTree;
  }>,
): readonly RevisionDiffEntry[] => {
  const before = revisionTreeFiles(input.original);
  const after = revisionTreeFiles(input.modified);
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((path): RevisionDiffEntry[] => {
    const original = before.get(path);
    const modified = after.get(path);
    return sameFile(original, modified)
      ? []
      : [{ path, kind: original === undefined ? 'added' : modified === undefined ? 'deleted' : 'modified' }];
  });
};
