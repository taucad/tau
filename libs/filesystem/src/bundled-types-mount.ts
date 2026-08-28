import type { WorkspaceFileService } from '#workspace-file-service.js';
import { getNodeModulesPath } from '@taucad/utils/import';
import { isSafeRelativePath, resolveAuthorityPath } from '@taucad/utils/path';

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
 * @param fileService - Workspace file service used to replace package roots.
 * @param payload - Package-shaped declaration bundles to mirror under `/node_modules`.
 * @public
 */
export async function populateBundledTypesMount(
  fileService: WorkspaceFileService,
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

  await fileService.replaceBundledTypePackages(validatedPayload);
}
