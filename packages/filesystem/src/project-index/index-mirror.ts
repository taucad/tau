/**
 * The read-only mirror of a Project Index a language service or agent host
 * keeps in its own worker (charter D5, D13), so `fileExists`,
 * `directoryExists`, `getDirectories` and an mtime version are answered
 * synchronously without crossing to the authority or reading content (I3).
 *
 * Declared here with the index it mirrors; wired to the LSP and agent hosts in
 * W9, fed by the authority's change sets.
 *
 * @module
 */

import type { IndexEntry } from '#project-index/project-index.js';

/** One change a mirror applies, in the change set's own vocabulary. @public */
export type IndexMirrorChange = Readonly<{
  op: 'created' | 'written' | 'deleted' | 'moved' | 'metadata' | 'facts';
  path: string;
  oldPath?: string;
  entry?: IndexEntry;
}>;

/** A synchronous, read-only mirror of one root's index. @public */
export type IndexMirror = Readonly<{
  /** Apply one committed change set, in order. */
  apply(changes: readonly IndexMirrorChange[]): void;
  entry(path: string): IndexEntry | undefined;
  /** One directory level, sorted by name. */
  children(path: string): readonly IndexEntry[];
  /** A version string that changes whenever the entry's `(size, mtimeMs)` or generation does. */
  version(path: string): string;
}>;
