import { assertRootedPath } from '@taucad/utils/path';
import type { RuntimeFileLocator } from '#types/runtime-file.types.js';

type IsUnion<T, U = T> = T extends U ? ([U] extends [T] ? false : true) : never;
/** Inline source bytes or text. @public */
export type RuntimeSourceContent = string | Uint8Array<ArrayBuffer>;
/** An inline source file map. @public */
export type RuntimeSourceFiles = Readonly<Record<string, RuntimeSourceContent>>;
type KnownSourceKeys<Files extends RuntimeSourceFiles> = Extract<keyof Files, string>;
type EntryField<Files extends RuntimeSourceFiles> =
  string extends KnownSourceKeys<Files>
    ? { readonly entry?: string }
    : true extends IsUnion<KnownSourceKeys<Files>>
      ? { readonly entry: KnownSourceKeys<Files> }
      : { readonly entry?: KnownSourceKeys<Files> };
/** Inline source with a required entry when multiple literal files are supplied. @public */
export type InlineRuntimeSource<Files extends RuntimeSourceFiles = RuntimeSourceFiles> = {
  readonly files: Files;
  readonly path?: never;
} & EntryField<Files> &
  (keyof Files extends never ? never : unknown);
/** Root-relative filesystem-backed source. @public */
export type FilesystemRuntimeSource = { readonly path: string; readonly files?: never; readonly entry?: never };
/** A document source. @public */
export type RuntimeSource<Files extends RuntimeSourceFiles = RuntimeSourceFiles> =
  | InlineRuntimeSource<Files>
  | FilesystemRuntimeSource;

/** Normalized worker file and optional inline stage. @internal */
export type NormalizedRuntimeSource = Readonly<{
  file: RuntimeFileLocator;
  stage?: Record<string, Uint8Array<ArrayBuffer>>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const canonicalFile = (path: string): string => {
  const canonical = assertRootedPath(path);
  if (canonical === '') {
    throw new TypeError(`Runtime source path must identify a file: ${JSON.stringify(path)}`);
  }
  return canonical;
};
const locator = (path: string): RuntimeFileLocator => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? { path: '', filename: path } : { path: path.slice(0, slash), filename: path.slice(slash + 1) };
};
const bytes = (path: string, content: unknown): Uint8Array<ArrayBuffer> => {
  if (typeof content === 'string') {
    return new TextEncoder().encode(content);
  }
  if (content instanceof Uint8Array) {
    return new Uint8Array(content);
  }
  throw new TypeError(`Runtime source file ${JSON.stringify(path)} must be a string or Uint8Array.`);
};

/** Validate an inline or filesystem source before it enters the worker protocol. @internal */
export const normalizeRuntimeSource = (source: unknown): NormalizedRuntimeSource => {
  if (!isRecord(source)) {
    throw new TypeError('Runtime source must be an object with either `files` or `path`.');
  }
  if ('files' in source && 'path' in source) {
    throw new TypeError('Runtime source must use either `files` or `path`.');
  }
  if ('files' in source) {
    if (!isRecord(source['files'])) {
      throw new TypeError('Runtime source `files` must be a non-empty file map.');
    }
    const entries = Object.entries(source['files']);
    if (entries.length === 0) {
      throw new TypeError('Runtime source `files` must contain at least one file.');
    }
    const entry =
      typeof source['entry'] === 'string' ? source['entry'] : entries.length === 1 ? entries[0]![0] : undefined;
    if (!entry) {
      throw new TypeError('Runtime source `entry` is required when `files` contains multiple files.');
    }
    const staged: Array<readonly [string, Uint8Array<ArrayBuffer>]> = [];
    const raw = new Map<string, string>();
    for (const [path, content] of entries) {
      const canonical = canonicalFile(path);
      const collision = raw.get(canonical);
      if (collision !== undefined) {
        throw new TypeError(
          `Runtime source files ${JSON.stringify(collision)} and ${JSON.stringify(path)} resolve to ${canonical}.`,
        );
      }
      raw.set(canonical, path);
      staged.push([canonical, bytes(path, content)]);
    }
    const selected = canonicalFile(entry);
    if (!raw.has(selected)) {
      throw new TypeError(`Runtime source entry ${JSON.stringify(entry)} must be one of the files keys.`);
    }
    return { file: locator(selected), stage: Object.fromEntries(staged) };
  }
  if (typeof source['path'] === 'string') {
    return { file: locator(canonicalFile(source['path'])) };
  }
  throw new TypeError('Runtime source must include either `files` or `path`.');
};

/** Merge an explicit update stage with an inline source stage. @internal */
export const withStagedFiles = (
  normalized: NormalizedRuntimeSource,
  stage: Readonly<Record<string, Uint8Array<ArrayBuffer> | string>> | undefined,
): NormalizedRuntimeSource => {
  if (stage === undefined) {
    return normalized;
  }
  if (!isRecord(stage)) {
    throw new TypeError('Runtime `stage` must be a map of runtime paths to bytes.');
  }
  const additions = Object.entries(stage).map(
    ([path, content]) => [canonicalFile(path), bytes(path, content)] as const,
  );
  return { ...normalized, stage: Object.fromEntries([...Object.entries(normalized.stage ?? {}), ...additions]) };
};
