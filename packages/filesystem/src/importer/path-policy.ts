/**
 * The import's path policy, applied while a source is traversed (charter D12,
 * I9, I12).
 *
 * Every source path is normalized once, refused when it could leave the
 * project (an absolute path, a drive, a `..` segment, a control character:
 * zip-slip), length-checked, and classified by the same injected
 * {@link PathPolicy} that classifies at index scan, mask and capture, so what
 * an import leaves behind is exactly what the project would never version: a
 * host's cache and every repository's control plane, at any depth. The
 * project's own manifest and identity are reserved, since the commit writes
 * them. Two kept paths that differ only in case or accents, or a file where
 * another entry needs a folder, refuse the import (I12).
 *
 * @module
 */

import type { PathPolicy } from '#types.js';
import { foldPathSpelling } from '#path-fold.js';
import { ImportRefusedError } from '#importer/limits.js';
import type { ImportMeter } from '#importer/limits.js';

/**
 * What the policy decided for one source path.
 *
 * @public
 */
export type ImportPathVerdict =
  | Readonly<{ kind: 'keep'; path: string }>
  | Readonly<{ kind: 'skip'; path: string; why: 'excluded' | 'reserved' }>;

/* A drive letter, so `C:/x` and `C:x` never reach a provider as a relative path. */
const drivePattern = /^[A-Za-z]:/u;
// oxlint-disable-next-line no-control-regex -- control characters are exactly what the policy refuses.
const controlPattern = /[\u0000-\u001F\u007F]/u;

/**
 * Normalize one source path to a project-relative path, or refuse it.
 *
 * Backslashes are separators (archives written on Windows use them), `.` and
 * empty segments fold away, and a trailing slash is dropped.
 *
 * @param raw - The path as the source spells it.
 * @returns The normalized path; empty for the source's own root.
 * @throws ImportRefusedError `unsafePath` for an absolute path, a drive, a `..` segment or a control character.
 * @public
 */
export const normalizeImportPath = (raw: string): string => {
  const slashed = raw.replaceAll('\\', '/');
  if (slashed.startsWith('/') || drivePattern.test(slashed) || controlPattern.test(slashed)) {
    throw new ImportRefusedError('unsafePath', { path: raw.slice(0, 120) });
  }
  const segments = slashed.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (segments.includes('..')) {
    throw new ImportRefusedError('unsafePath', { path: raw.slice(0, 120) });
  }
  return segments.join('/');
};

/* What Tau writes into a project beside the manifest: its identity, an import's facts and an in-place import's owner marker. */
const reservedTauMembers = ['.tau/project.json', '.tau/import.json', '.tau-import-owner.json'];

/**
 * Whether the commit writes this path itself, so neither an import nor a
 * staged ledger may carry it: the manifest at any depth, the identity
 * record, an import's facts and an in-place import's owner marker, in every
 * spelling a filesystem resolves onto them (case, trailing dots and spaces,
 * an NTFS `:stream` suffix: `TAU.JSON`, `tau.json.`, `.tau/project.json `).
 *
 * @param path - A normalized project-relative path.
 * @returns Whether it is reserved.
 * @public
 */
export const isReservedImportPath = (path: string): boolean => {
  const folded = foldPathSpelling(path);
  return (
    folded === 'tau.json' ||
    folded.endsWith('/tau.json') ||
    folded === '.tau' ||
    reservedTauMembers.some((member) => folded === member || folded.startsWith(`${member}/`))
  );
};

/* The key two names one filesystem would merge share: the registry's fold (case, accents, trailing dots, streams). */
const fold = (path: string): string => foldPathSpelling(path.normalize('NFC'));

/**
 * One import's path admission: normalizes, classifies, length-checks and
 * collision-checks every path it is shown, and counts each on the meter.
 *
 * @public
 */
export class ImportPathAdmission {
  private readonly _policy: PathPolicy;
  private readonly _meter: ImportMeter;
  private readonly _files = new Set<string>();
  private readonly _directories = new Set<string>();
  private readonly _strip: number;

  /**
   * Admit paths for one import.
   *
   * @param policy - The path policy the project classifies with (`tauPathPolicy` in the app).
   * @param meter - The import's meter, which counts each path shown.
   * @param options - `stripSegments`, leading folders every path shares that the import drops.
   */
  public constructor(policy: PathPolicy, meter: ImportMeter, options: Readonly<{ stripSegments?: number }> = {}) {
    this._policy = policy;
    this._meter = meter;
    this._strip = options.stripSegments ?? 0;
  }

  /**
   * Whether a directory's whole subtree is left behind, so a traversal need
   * not descend into it.
   *
   * @param path - A normalized directory path relative to the source root.
   * @returns Whether nothing under it is kept.
   */
  public prunes(path: string): boolean {
    const relative = this._stripped(path);
    if (relative === undefined || relative === '') {
      return false;
    }
    /* Probed as a child, so a directory row (`.git`, `node_modules`) answers for its subtree. */
    const { class: storageClass } = this._policy.classify(`${relative}/_`);
    return storageClass === 'cache' || storageClass === 'control-plane';
  }

  /**
   * Decide one file path.
   *
   * @param raw - The file's path as the source spells it.
   * @returns Keep, with the project-relative path, or skip with the reason.
   * @throws ImportRefusedError for an unsafe, overlong or colliding path, or past the entry limit.
   */
  public admit(raw: string): ImportPathVerdict {
    this._meter.listed(raw);
    const normalized = normalizeImportPath(raw);
    const path = this._stripped(normalized);
    if (path === undefined || path === '') {
      throw new ImportRefusedError('unsafePath', { path: raw.slice(0, 120) });
    }
    this._meter.path(path);
    const { class: storageClass } = this._policy.classify(path);
    if (storageClass === 'cache' || storageClass === 'control-plane') {
      return { kind: 'skip', path, why: 'excluded' };
    }
    if (isReservedImportPath(path)) {
      return { kind: 'skip', path, why: 'reserved' };
    }
    const key = fold(path);
    if (this._files.has(key) || this._directories.has(key)) {
      throw new ImportRefusedError('collision', { path });
    }
    const segments = key.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      const ancestor = segments.slice(0, depth).join('/');
      if (this._files.has(ancestor)) {
        throw new ImportRefusedError('collision', { path });
      }
      this._directories.add(ancestor);
    }
    this._files.add(key);
    return { kind: 'keep', path };
  }

  private _stripped(path: string): string | undefined {
    if (this._strip === 0) {
      return path;
    }
    const segments = path.split('/');
    return segments.length <= this._strip ? undefined : segments.slice(this._strip).join('/');
  }
}

/**
 * How many leading folders every path shares, so a folder dragged in, or a
 * zip whose entries all sit under one top folder, imports its contents rather
 * than one directory holding them. A path that is itself a file at that depth
 * stops the count.
 *
 * @param paths - Normalized source paths of the files.
 * @returns The number of shared leading folder segments.
 * @public
 */
export const sharedLeadingFolders = (paths: readonly string[]): number => {
  const [first] = paths;
  if (first === undefined) {
    return 0;
  }
  let shared = first.split('/').slice(0, -1);
  for (const path of paths) {
    const folders = path.split('/').slice(0, -1);
    let depth = 0;
    while (depth < shared.length && depth < folders.length && shared[depth] === folders[depth]) {
      depth += 1;
    }
    shared = shared.slice(0, depth);
    if (shared.length === 0) {
      return 0;
    }
  }
  return shared.length;
};
