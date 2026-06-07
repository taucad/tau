/**
 * Default file globs used by GeoSpec test discovery.
 *
 * @public
 */
export const defaultGeoSpecInclude = ['**/*.geospec.{ts,js}'] as const;

/**
 * Directories skipped by recursive GeoSpec discovery unless callers provide
 * their own ignored-directory list.
 *
 * @public
 */
export const defaultGeoSpecIgnoredDirectories = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.tau/cache',
  '.tau/artifacts',
  '.tau/transcripts',
] as const;

/**
 * File kind returned by a GeoSpec discovery filesystem.
 *
 * @public
 */
export type GeoSpecDiscoveryFileKind = 'file' | 'directory';

/**
 * Minimal stat object required for recursive GeoSpec test discovery.
 *
 * @public
 */
export type GeoSpecDiscoveryFileStat = {
  kind: GeoSpecDiscoveryFileKind;
};

/**
 * Minimal filesystem contract used by GeoSpec test discovery.
 *
 * Browser workers, Node CLI hosts, and embedded runners adapt their native
 * filesystem APIs to this shape so discovery has one shared behavior.
 *
 * @public
 */
export type GeoSpecDiscoveryFileSystem = {
  readdir(path: string): Promise<readonly string[]>;
  stat(path: string): Promise<GeoSpecDiscoveryFileStat>;
};

/**
 * Options for recursive GeoSpec test discovery.
 *
 * `files` accepts either exact `*.geospec.ts` / `*.geospec.js` files or
 * directory roots. When omitted, discovery starts at `projectPath`.
 *
 * `include` and `exclude` are Vitest-style file globs applied to
 * project-relative GeoSpec paths after `files` roots have been expanded.
 *
 * @public
 */
export type DiscoverGeoSpecFilesOptions = {
  filesystem: GeoSpecDiscoveryFileSystem;
  projectPath: string;
  files?: readonly string[];
  include?: readonly string[];
  exclude?: readonly string[];
  ignoredDirectories?: readonly string[];
};

/**
 * Result returned by recursive GeoSpec test discovery.
 *
 * `files` are project-relative, sorted, and de-duplicated. `unmatchedRoots`
 * contains requested file or directory roots that did not select any GeoSpec
 * files.
 *
 * @public
 */
export type GeoSpecDiscoveryResult = {
  files: string[];
  unmatchedRoots: string[];
};

const geoSpecFileNamePattern = /\.geospec\.(?:ts|js)$/u;

const normalizeGeoSpecPath = (path: string): string =>
  path.replaceAll('\\', '/').replaceAll(/\/+/gu, '/').replace(/^\.\//u, '');

const normalizeProjectPath = (path: string): string => {
  const normalized = normalizeGeoSpecPath(path).replace(/\/$/u, '');
  if (!normalized || normalized === '.') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const toProjectAbsolutePath = (path: string, projectPath: string): string => {
  const normalized = normalizeGeoSpecPath(path);
  if (!normalized || normalized === '.') {
    return projectPath;
  }
  if (normalized === projectPath || normalized.startsWith(`${projectPath}/`)) {
    return normalized;
  }
  if (normalized.startsWith('/')) {
    return normalized;
  }
  return projectPath === '/' ? `/${normalized}` : `${projectPath}/${normalized}`;
};

const toProjectRelativePath = (path: string, projectPath: string): string => {
  const absolutePath = toProjectAbsolutePath(path, projectPath);
  const projectPrefix = projectPath.endsWith('/') ? projectPath : `${projectPath}/`;
  if (absolutePath === projectPath) {
    return '';
  }
  return absolutePath.startsWith(projectPrefix) ? absolutePath.slice(projectPrefix.length) : absolutePath;
};

const escapeRegExp = (value: string): string => value.replaceAll(/[|\\{}()[\]^$+?.]/gu, String.raw`\$&`);

const globPatternToRegExp = (pattern: string): RegExp => {
  const normalizedPattern = normalizeGeoSpecPath(pattern);
  let source = '^';
  for (let index = 0; index < normalizedPattern.length; ) {
    const character = normalizedPattern[index];
    if (character === undefined) {
      break;
    }

    const next = normalizedPattern[index + 1];
    if (character === '*' && next === '*') {
      if (normalizedPattern[index + 2] === '/') {
        source += String.raw`(?:.*\/)?`;
        index += 3;
      } else {
        source += '.*';
        index += 2;
      }
      continue;
    }
    if (character === '*') {
      source += '[^/]*';
      index += 1;
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      index += 1;
      continue;
    }
    if (character === '{') {
      const closeIndex = normalizedPattern.indexOf('}', index + 1);
      if (closeIndex !== -1) {
        const alternatives = normalizedPattern
          .slice(index + 1, closeIndex)
          .split(',')
          .map((alternative) => escapeRegExp(alternative));
        source += `(?:${alternatives.join('|')})`;
        index = closeIndex + 1;
        continue;
      }
    }

    source += character === '/' ? String.raw`\/` : escapeRegExp(character);
    index += 1;
  }

  return new RegExp(`${source}$`, 'u');
};

const matchesGeoSpecFilePattern = (path: string, pattern: string): boolean =>
  globPatternToRegExp(pattern).test(normalizeGeoSpecPath(path));

const matchesAnyGeoSpecFilePattern = (path: string, patterns: readonly string[]): boolean =>
  patterns.some((pattern) => matchesGeoSpecFilePattern(path, pattern));

const isIgnoredDirectory = (path: string, ignoredDirectories: ReadonlySet<string>): boolean => {
  const normalizedPath = normalizeGeoSpecPath(path).replace(/\/$/u, '');
  const directoryName = normalizedPath.split('/').at(-1) ?? normalizedPath;
  return ignoredDirectories.has(normalizedPath) || ignoredDirectories.has(directoryName);
};

/**
 * Return true when a project-relative path names a GeoSpec test file.
 *
 * @param path - Project-relative path to inspect.
 * @returns True when the path ends with `.geospec.ts` or `.geospec.js`.
 * @public
 */
export const isGeoSpecTestFile = (path: string): boolean => geoSpecFileNamePattern.test(normalizeGeoSpecPath(path));

const collectGeoSpecFiles = async (options: {
  filesystem: GeoSpecDiscoveryFileSystem;
  directoryPath: string;
  projectPath: string;
  ignoredDirectories: ReadonlySet<string>;
  selectedFiles: Set<string>;
}): Promise<void> => {
  const entries = await options.filesystem.readdir(options.directoryPath);
  const directories: string[] = [];

  for (const entry of entries) {
    const absolutePath = options.directoryPath === '/' ? `/${entry}` : `${options.directoryPath}/${entry}`;
    const relativePath = toProjectRelativePath(absolutePath, options.projectPath);
    // oxlint-disable-next-line no-await-in-loop -- deterministic serial traversal avoids host-specific ordering races.
    const stat = await options.filesystem.stat(absolutePath);

    if (stat.kind === 'directory') {
      if (!isIgnoredDirectory(relativePath, options.ignoredDirectories)) {
        directories.push(absolutePath);
      }
      continue;
    }

    if (isGeoSpecTestFile(relativePath)) {
      options.selectedFiles.add(relativePath);
    }
  }

  directories.sort((left, right) => left.localeCompare(right));
  for (const directory of directories) {
    // oxlint-disable-next-line no-await-in-loop -- GeoSpec discovery is intentionally deterministic and serial.
    await collectGeoSpecFiles({ ...options, directoryPath: directory });
  }
};

const discoverFromRoot = async (options: {
  filesystem: GeoSpecDiscoveryFileSystem;
  projectPath: string;
  root: string;
  ignoredDirectories: ReadonlySet<string>;
}): Promise<string[]> => {
  const selectedFiles = new Set<string>();
  const absoluteRoot = toProjectAbsolutePath(options.root, options.projectPath);

  let rootStat: GeoSpecDiscoveryFileStat;
  try {
    rootStat = await options.filesystem.stat(absoluteRoot);
  } catch {
    return [];
  }

  if (rootStat.kind === 'file') {
    const relativePath = toProjectRelativePath(absoluteRoot, options.projectPath);
    if (isGeoSpecTestFile(relativePath)) {
      selectedFiles.add(relativePath);
    }
    return [...selectedFiles];
  }

  const rootRelativePath = toProjectRelativePath(absoluteRoot, options.projectPath);
  if (rootRelativePath && isIgnoredDirectory(rootRelativePath, options.ignoredDirectories)) {
    return [];
  }

  await collectGeoSpecFiles({
    filesystem: options.filesystem,
    directoryPath: absoluteRoot,
    projectPath: options.projectPath,
    ignoredDirectories: options.ignoredDirectories,
    selectedFiles,
  });
  return [...selectedFiles];
};

/**
 * Discover GeoSpec test files from exact files or directory roots.
 *
 * The returned `files` are project-relative paths suitable for
 * `runGeoSpecModule` and runner factory APIs.
 *
 * @param options - Discovery options containing a filesystem adapter and project roots.
 * @returns Sorted, de-duplicated project-relative GeoSpec files plus unmatched roots.
 * @public
 */
export const discoverGeoSpecFiles = async (options: DiscoverGeoSpecFilesOptions): Promise<GeoSpecDiscoveryResult> => {
  const projectPath = normalizeProjectPath(options.projectPath);
  const include = options.include && options.include.length > 0 ? options.include : defaultGeoSpecInclude;
  const exclude = options.exclude ?? [];
  const ignoredDirectories = new Set(options.ignoredDirectories ?? defaultGeoSpecIgnoredDirectories);
  const roots = options.files && options.files.length > 0 ? options.files : ['.'];
  const discoveredFiles = new Set<string>();
  const unmatchedRoots: string[] = [];

  for (const root of roots) {
    // oxlint-disable-next-line no-await-in-loop -- root order determines stable unmatched diagnostics.
    const rootFiles = await discoverFromRoot({
      filesystem: options.filesystem,
      projectPath,
      root,
      ignoredDirectories,
    });
    if (rootFiles.length === 0) {
      unmatchedRoots.push(normalizeGeoSpecPath(root) || '.');
      continue;
    }
    for (const file of rootFiles) {
      discoveredFiles.add(file);
    }
  }

  const selectedFiles = [...discoveredFiles].filter(
    (file) => matchesAnyGeoSpecFilePattern(file, include) && !matchesAnyGeoSpecFilePattern(file, exclude),
  );

  return {
    files: selectedFiles.sort((left, right) => left.localeCompare(right)),
    unmatchedRoots,
  };
};
