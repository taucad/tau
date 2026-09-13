import type { MimeType } from '#types/mime-types.types.js';

/**
 * File content classification used by model-visible filesystem metadata.
 *
 * @public
 */
export type FileContentKind = 'text' | 'binary';

/**
 * Required metadata for text files.
 *
 * @public
 */
export type TextFileContentMetadata = {
  readonly contentKind: 'text';
  readonly lineCount: number;
};

/**
 * Required metadata for binary files.
 *
 * @public
 */
export type BinaryFileContentMetadata = {
  readonly contentKind: 'binary';
  readonly lineCount?: never;
};

/**
 * Required file content metadata.
 *
 * @public
 */
export type FileContentMetadata = TextFileContentMetadata | BinaryFileContentMetadata;

/**
 * Base file tree entry for API transfer and serialization.
 * Represents files and directories in a file tree snapshot.
 *
 * @public
 */
export type FileTreeEntry =
  | {
      path: string;
      name: string;
      type: 'dir';
      size: number;
    }
  | ({
      path: string;
      name: string;
      type: 'file';
      size: number;
    } & FileContentMetadata);

/**
 * File or directory entry in the filesystem with client-side loading state.
 * Extends {@link FileTreeEntry} for tree UIs and filesystem operations.
 *
 * @public
 */
export type FileEntry = FileTreeEntry & {
  isLoaded: boolean;
  mtimeMs: number;
  /** What the composed view says about this entry; absent until a view stamps it. */
  provenance?: FileProvenance;
  /**
   * When `type === 'dir'`, `true` means immediate children have been
   * read from the worker and merged into the tree snapshot. Omitted for
   * files and unresolved directory stubs.
   */
  isDirectoryResolved?: boolean;
};

/**
 * Stat result from virtual filesystem `stat` / `lstat` operations.
 * Aligns with the subset of Node.js `fs.Stats` used by the VFS layer.
 *
 * @public
 */
export type FileStat =
  | {
      readonly type: 'dir';
      readonly size: number;
      readonly mtimeMs: number;
      /** What a composed view says about this path; absent on a raw provider stat. */
      readonly provenance?: FileProvenance;
    }
  | ({
      readonly type: 'file';
      readonly size: number;
      readonly mtimeMs: number;
      /** What a composed view says about this path; absent on a raw provider stat. */
      readonly provenance?: FileProvenance;
    } & FileContentMetadata);

/**
 * Where a composed entry's bytes come from.
 *
 * `project` is the checkout's own tree; the other two are read-only overlays
 * composed above it at fixed paths and never stored in the project.
 *
 * @public
 */
export type FileProvenanceSource = 'project' | 'dependencies' | 'system-skills';

/**
 * What a composed view knows about one entry, as data.
 *
 * Labels are catalog, not wire: the UI maps this tuple to copy through one
 * catalog, so no presentation string crosses a process boundary.
 *
 * @public
 */
export type FileProvenance = Readonly<{
  source: FileProvenanceSource;
  /** Whether the bytes enter a revision. */
  versioned: boolean;
  /**
   * What the **agent** may do with the bytes, from the path registry.
   *
   * Deliberately not the user's access: the host UI edits records the agent
   * may only read. A user surface gates refusal on `source !== 'project'` and
   * dims on `versioned === false`.
   */
  agentAccess: 'read-write' | 'read-only';
  /** Stable identity of the serving source: a checkout id, or an overlay unit such as `skill:<slug>@<version>#<fingerprint>`. */
  identity?: string;
  /** Identity of the overlay unit a project entry replaces wholesale. */
  overrides?: string;
}>;

/**
 * Stat result with path and name for directory listings.
 * Returned by `readdirStat` and similar enumeration APIs.
 *
 * @public
 */
export type FileStatEntry = FileStat & {
  readonly path: string;
  readonly name: string;
};

/**
 * Named binary payload for conversion and import pipelines.
 *
 * @public
 */
export type FileInput = {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
};

/**
 * Named binary export artifact with a resolved MIME type.
 * Used by runtime export results and format plugins.
 *
 * @public
 */
export type ExportFile = {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: MimeType;
};
