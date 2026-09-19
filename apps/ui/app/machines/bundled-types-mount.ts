/**
 * Bundled-type installation: the editor typing feature mirrors its generated
 * `.d.ts` payloads into `/node_modules` itself, through a trusted rooted handle
 * on that route (charter D15). The authority hosts no installation routine —
 * every consumer-reachable surface still refuses `/node_modules`
 * (`BUNDLED_TYPES_WORKSPACE`), and only this module's handle, created at the
 * worker's composition site, can write there.
 *
 * @module
 */

import type { RootedFileSystem, RootedPorcelain } from '@taucad/filesystem';
import { getNodeModulesPath } from '@taucad/utils/import';
import { isSafeRelativePath, resolveAuthorityPath } from '@taucad/utils/path';

/**
 * The route this installer's handle is rooted at. `getNodeModulesPath` spells
 * the same prefix, so package paths are validated authority-global and stripped
 * to the handle's own namespace at the write boundary.
 */
const nodeModulesRoute = '/node_modules';

const toRootRelative = (authorityPath: string): string => authorityPath.slice(nodeModulesRoute.length + 1);

/**
 * The `/node_modules` handle the installer needs: existence, recursive removal
 * of a stale package root, and one batch write per generation. `writeFiles` is
 * optional on every rooted view — a view relayed over the bridge holds no
 * porcelain — so the installer checks for it once, at its trust boundary.
 *
 * @public
 */
export type BundledTypesRoot = Pick<RootedFileSystem, 'exists' | 'rmdir'> &
  Partial<Pick<RootedPorcelain, 'writeFiles'>>;

/**
 * One installer at a time per browser profile, so a generation this tab writes
 * is not interleaved with a sibling tab's. The mutation pipeline's own locks are
 * keyed by path under `/node_modules`, so this name can never nest against one.
 *
 * @param install - The generation to write under exclusion.
 * @returns Promise fulfilled once the installation completes.
 */
const withInstallLock = async (install: () => Promise<void>): Promise<void> =>
  typeof navigator === 'undefined' || !('locks' in navigator)
    ? install()
    : navigator.locks.request('tau-bundled-types', { mode: 'exclusive' }, install);

/**
 * One package-shaped declaration bundle mirrored under `/node_modules/<packageName>/`.
 *
 * @public
 */
export type BundledTypesMountEntry = Readonly<{
  /** Root npm package name. Import subpaths belong in `files`. */
  packageName: string;
  /** Root declaration content, emitted verbatim as `index.d.ts`. */
  content: string;
  /** Additional files to write relative to `/node_modules/<packageName>/`. */
  files?: Readonly<Record<string, string>>;
  /** Package metadata to write instead of the minimal default package.json. */
  packageJson?: Readonly<Record<string, unknown>>;
}>;

/**
 * Declaration bundles populated after the file-manager worker mounts `/node_modules`.
 *
 * @public
 */
export type BundledTypesPayload = readonly BundledTypesMountEntry[];

/**
 * Writes bundled `.d.ts` + minimal `package.json` under `/node_modules/<pkg>/`.
 *
 * @param nodeModules - Trusted rooted handle on the `/node_modules` route.
 * @param payload - Package-shaped declaration bundles to mirror under `/node_modules`.
 * @public
 */
export async function populateBundledTypesMount(
  nodeModules: BundledTypesRoot,
  payload: BundledTypesPayload,
): Promise<void> {
  const targets = new Set<string>();
  const reserve = (path: string): void => {
    if (targets.has(path)) {
      throw new TypeError(`Duplicate bundled type target: ${JSON.stringify(path)}`);
    }
    let parent = path.slice(0, path.lastIndexOf('/')) || '/';
    while (parent !== '/') {
      if (targets.has(parent)) {
        throw new TypeError(`Bundled type target collides with ancestor: ${JSON.stringify(path)}`);
      }
      parent = parent.slice(0, parent.lastIndexOf('/')) || '/';
    }
    for (const target of targets) {
      if (target.startsWith(`${path}/`)) {
        throw new TypeError(`Bundled type target collides with ancestor: ${JSON.stringify(path)}`);
      }
    }
    targets.add(path);
  };
  const validatedPayload = payload.map((entry) => {
    const packageDirectory = getNodeModulesPath(entry.packageName);
    const declarationTypesPath = `${packageDirectory}/index.d.ts`;
    const packageJsonPath = `${packageDirectory}/package.json`;
    reserve(packageJsonPath);
    reserve(declarationTypesPath);
    const files = Object.entries(entry.files ?? {}).map(([relativePath, content]) => {
      if (!isSafeRelativePath(relativePath)) {
        throw new TypeError(`Invalid bundled type path: ${JSON.stringify(relativePath)}`);
      }
      const path = resolveAuthorityPath(`${packageDirectory}/${relativePath}`);
      reserve(path);
      return { path, content };
    });
    const packageJsonText = JSON.stringify(
      entry.packageJson ?? { name: entry.packageName, types: 'index.d.ts' },
      null,
      2,
    );
    if (typeof packageJsonText !== 'string') {
      throw new TypeError(`Bundled package metadata is not serializable: ${JSON.stringify(entry.packageName)}`);
    }
    return {
      packageDirectory,
      files: [
        { path: declarationTypesPath, content: entry.content },
        ...files,
        { path: packageJsonPath, content: packageJsonText },
      ],
    };
  });

  const { writeFiles } = nodeModules;
  if (writeFiles === undefined) {
    throw new TypeError('A bundled-types root must serve batch writes.');
  }

  await withInstallLock(async () => {
    for (const { packageDirectory } of validatedPayload) {
      const localDirectory = toRootRelative(packageDirectory);
      // oxlint-disable-next-line no-await-in-loop -- Stale generations are dropped in order, before any of the new one lands.
      if (await nodeModules.exists(localDirectory)) {
        // oxlint-disable-next-line no-await-in-loop -- Same reason: one complete generation replaces the previous one.
        await nodeModules.rmdir(localDirectory, { recursive: true });
      }
    }
    /*
     * Each package's `package.json` is its last materialized file, and it lands
     * in a second batch: a reader that resolves a manifest always finds the
     * declarations it names already written.
     */
    for (const generation of [
      validatedPayload.flatMap(({ files }) => files.slice(0, -1)),
      validatedPayload.flatMap(({ files }) => files.slice(-1)),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- The manifest batch is deliberately ordered after the declarations.
      await writeFiles(Object.fromEntries(generation.map(({ path, content }) => [toRootRelative(path), { content }])));
    }
  });
}
