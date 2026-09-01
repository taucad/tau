import process from 'node:process';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

export type CatalogName = 'public' | 'private';
export type CatalogSelection = CatalogName | 'all';

export type RepoConfig = {
  upstream: string;
  fork?: string;
  branch?: string;
  commit?: string;
  path?: string;
  description?: string;
  shallow?: boolean;
};

export type GroupConfig = {
  description?: string;
  repos: string[];
};

export type Manifest = {
  version: number;
  repos_dir: string;
  owner: string;
  groups: Record<string, GroupConfig>;
  repos: Record<string, RepoConfig>;
};

export type PublicCatalog = Manifest;
export type PrivateCatalog = {
  version: number;
  groups: Record<string, GroupConfig>;
  repos: Record<string, RepoConfig>;
};

export type CatalogState = {
  manifest: Manifest;
  root: string;
  catalogs: { public: PublicCatalog; private?: PrivateCatalog };
  repoCatalogs: Record<string, CatalogName>;
  groupCatalogs: Record<string, CatalogName>;
};

export type RepoStatus = {
  name: string;
  catalog?: CatalogName;
  cloned: boolean;
  branch?: string;
  dirty?: boolean;
  ahead?: number;
  behind?: number;
  upstreamAhead?: number;
  lastActivity?: number;
  pinnedCommit?: string;
  atPinnedCommit?: boolean;
};

export type RepoContext = {
  name: string;
  repo: RepoConfig;
  manifest: Manifest;
  root: string;
  catalog?: CatalogName;
  state?: CatalogState;
};

export type RepoFilter = { name?: string; group?: string; all?: boolean };
export type ResolvedRepo = [name: string, repo: RepoConfig, catalog: CatalogName];
export type ResolvedGroup = [name: string, group: GroupConfig, catalog: CatalogName];

// ── Root Detection ──────────────────────────────────────────────

const isTauRoot = (directory: string): boolean => {
  const packagePath = join(directory, 'package.json');
  if (!existsSync(packagePath) || !existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    return false;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: unknown };
    return packageJson.name === '@taucad/tau-source';
  } catch {
    return false;
  }
};

export const findRoot = (startDirectory = process.cwd()): string => {
  const envRoot = process.env['TAU_ROOT'];
  if (envRoot) {
    const resolvedEnvRoot = resolve(envRoot);
    if (!isTauRoot(resolvedEnvRoot)) {
      throw new Error(
        `TAU_ROOT does not identify the Tau workspace (expected package @taucad/tau-source and pnpm-workspace.yaml): ${resolvedEnvRoot}`,
      );
    }

    return resolvedEnvRoot;
  }

  let directory = resolve(startDirectory);
  while (true) {
    if (isTauRoot(directory)) {
      return directory;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }

    directory = parent;
  }

  throw new Error('Could not find the Tau workspace root. Run inside Tau or set TAU_ROOT.');
};

const resolveRoot = (root?: string): string => {
  if (!root) {
    return findRoot();
  }

  const resolvedRoot = resolve(root);
  if (!isTauRoot(resolvedRoot)) {
    throw new Error(
      `Invalid Tau workspace root (expected package @taucad/tau-source and pnpm-workspace.yaml): ${resolvedRoot}`,
    );
  }

  return resolvedRoot;
};

// ── Catalog Parsing and Validation ─────────────────────────────

const publicCatalogKeys = new Set(['version', 'repos_dir', 'owner', 'groups', 'repos']);
const privateCatalogKeys = new Set(['version', 'groups', 'repos']);
const repoKeys = new Set(['upstream', 'fork', 'branch', 'commit', 'path', 'description', 'shallow']);
const groupKeys = new Set(['description', 'repos']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a mapping.`);
  }

  return value;
};

const rejectUnknownKeys = (value: Record<string, unknown>, allowed: Set<string>, label: string): void => {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unsupported field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`);
  }
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
};

const optionalString = (value: unknown, label: string): string | undefined =>
  value === undefined ? undefined : requireString(value, label);

const parseRepo = (value: unknown, label: string): RepoConfig => {
  const raw = requireRecord(value, label);
  rejectUnknownKeys(raw, repoKeys, label);
  if (raw['shallow'] !== undefined && typeof raw['shallow'] !== 'boolean') {
    throw new Error(`${label}.shallow must be a boolean.`);
  }

  const fork = optionalString(raw['fork'], `${label}.fork`);
  const branch = optionalString(raw['branch'], `${label}.branch`);
  const commit = optionalString(raw['commit'], `${label}.commit`);
  const path = optionalString(raw['path'], `${label}.path`);
  const description = optionalString(raw['description'], `${label}.description`);
  return {
    upstream: requireString(raw['upstream'], `${label}.upstream`),
    ...(fork && { fork }),
    ...(branch && { branch }),
    ...(commit && { commit }),
    ...(path && { path }),
    ...(description && { description }),
    ...(raw['shallow'] === true && { shallow: true }),
  };
};

const parseRepos = (value: unknown, label: string): Record<string, RepoConfig> => {
  const raw = requireRecord(value, label);
  return Object.fromEntries(Object.entries(raw).map(([name, repo]) => [name, parseRepo(repo, `${label}.${name}`)]));
};

const parseGroup = (value: unknown, label: string): GroupConfig => {
  const raw = requireRecord(value, label);
  rejectUnknownKeys(raw, groupKeys, label);
  if (!Array.isArray(raw['repos']) || raw['repos'].some((repo) => typeof repo !== 'string' || repo.length === 0)) {
    throw new Error(`${label}.repos must be an array of non-empty strings.`);
  }

  const repos = raw['repos'] as string[];
  const duplicates = repos.filter((repo, index) => repos.indexOf(repo) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${label}.repos contains duplicate entries: ${[...new Set(duplicates)].join(', ')}.`);
  }

  const description = optionalString(raw['description'], `${label}.description`);
  return { ...(description && { description }), repos: [...repos] };
};

const parseGroups = (value: unknown, label: string): Record<string, GroupConfig> => {
  const raw = requireRecord(value, label);
  return Object.fromEntries(Object.entries(raw).map(([name, group]) => [name, parseGroup(group, `${label}.${name}`)]));
};

const requireVersion = (value: unknown, label: string): number => {
  if (value !== 1) {
    throw new Error(`${label}.version must be 1.`);
  }

  return value;
};

const parseCatalog = (content: string, catalog: CatalogName, filePath: string): PublicCatalog | PrivateCatalog => {
  let loaded: unknown;
  try {
    loaded = yamlLoad(content);
  } catch (error) {
    throw new Error(
      `Invalid ${catalog} catalog ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const raw = requireRecord(loaded, `${catalog} catalog`);
  rejectUnknownKeys(raw, catalog === 'public' ? publicCatalogKeys : privateCatalogKeys, `${catalog} catalog`);
  const shared = {
    version: requireVersion(raw['version'], `${catalog} catalog`),
    groups: parseGroups(raw['groups'], `${catalog} catalog.groups`),
    repos: parseRepos(raw['repos'], `${catalog} catalog.repos`),
  };

  if (catalog === 'private') {
    return shared;
  }

  const reposDirectory = requireString(raw['repos_dir'], 'public catalog.repos_dir');
  if (reposDirectory !== 'repos') {
    throw new Error('public catalog.repos_dir must be "repos".');
  }

  return {
    version: shared.version,
    repos_dir: reposDirectory,
    owner: requireString(raw['owner'], 'public catalog.owner'),
    groups: shared.groups,
    repos: shared.repos,
  };
};

const publicCatalogPath = (root: string): string => join(root, 'repos.yaml');
const privateCatalogPath = (root: string): string => join(root, 'repos', 'tau-brain', 'repos.yaml');

const readCatalog = (root: string, catalog: CatalogName): PublicCatalog | PrivateCatalog => {
  const filePath = catalog === 'public' ? publicCatalogPath(root) : privateCatalogPath(root);
  if (!existsSync(filePath)) {
    if (catalog === 'private') {
      throw new Error(
        `Private repos catalog not found at ${filePath}. Authorized setup: GIT_LFS_SKIP_SMUDGE=1 gh repo clone taucad/tau-brain repos/tau-brain`,
      );
    }

    throw new Error(`Public repos catalog not found at ${filePath}.`);
  }

  return parseCatalog(readFileSync(filePath, 'utf8'), catalog, filePath);
};

const assertSafeRepoPath = (root: string, manifest: Manifest, name: string, repo: RepoConfig): string => {
  const cloneRoot = resolve(root, manifest.repos_dir);
  const configuredPath = repo.path ?? name;
  if (isAbsolute(configuredPath)) {
    throw new Error(`Repo "${name}" path must be relative: ${configuredPath}.`);
  }

  const resolvedPath = resolve(cloneRoot, configuredPath);
  const fromCloneRoot = relative(cloneRoot, resolvedPath);
  if (fromCloneRoot === '..' || fromCloneRoot.startsWith(`..${sep}`) || isAbsolute(fromCloneRoot)) {
    throw new Error(`Repo "${name}" path escapes ${manifest.repos_dir}: ${configuredPath}.`);
  }

  return resolvedPath;
};

const buildState = (root: string, catalogs: CatalogState['catalogs']): CatalogState => {
  const publicCatalog = catalogs.public;
  const privateCatalog = catalogs.private;
  if (publicCatalog.repos['tau-brain'] || privateCatalog?.repos['tau-brain']) {
    throw new Error('Repo "tau-brain" is forbidden in both catalogs; Tau Brain cannot manage itself.');
  }
  if (publicCatalog.groups['brain'] || privateCatalog?.groups['brain']) {
    throw new Error('Group "brain" is forbidden in both catalogs.');
  }

  const duplicateRepos = privateCatalog
    ? Object.keys(privateCatalog.repos).filter((name) => publicCatalog.repos[name])
    : [];
  if (duplicateRepos.length > 0) {
    throw new Error(`Repo definitions collide across catalogs: ${duplicateRepos.join(', ')}.`);
  }

  const duplicateGroups = privateCatalog
    ? Object.keys(privateCatalog.groups).filter((name) => publicCatalog.groups[name])
    : [];
  if (duplicateGroups.length > 0) {
    throw new Error(`Group definitions collide across catalogs: ${duplicateGroups.join(', ')}.`);
  }

  const manifest: Manifest = {
    version: publicCatalog.version,
    repos_dir: publicCatalog.repos_dir,
    owner: publicCatalog.owner,
    groups: { ...publicCatalog.groups, ...privateCatalog?.groups },
    repos: { ...publicCatalog.repos, ...privateCatalog?.repos },
  };
  const repoCatalogs: Record<string, CatalogName> = Object.fromEntries(
    Object.keys(publicCatalog.repos).map((name) => [name, 'public']),
  );
  const groupCatalogs: Record<string, CatalogName> = Object.fromEntries(
    Object.keys(publicCatalog.groups).map((name) => [name, 'public']),
  );
  for (const name of Object.keys(privateCatalog?.repos ?? {})) {
    repoCatalogs[name] = 'private';
  }
  for (const name of Object.keys(privateCatalog?.groups ?? {})) {
    groupCatalogs[name] = 'private';
  }

  for (const [name, group] of Object.entries(publicCatalog.groups)) {
    const missing = group.repos.filter((repoName) => repoCatalogs[repoName] !== 'public');
    if (missing.length > 0) {
      throw new Error(`Public group "${name}" references non-public repos: ${missing.join(', ')}.`);
    }
  }
  for (const [name, group] of Object.entries(privateCatalog?.groups ?? {})) {
    const missing = group.repos.filter((repoName) => !manifest.repos[repoName]);
    if (missing.length > 0) {
      throw new Error(`Private group "${name}" references missing repos: ${missing.join(', ')}.`);
    }
  }

  const paths = new Map<string, string>();
  for (const [name, repo] of Object.entries(manifest.repos)) {
    const path = assertSafeRepoPath(root, manifest, name, repo);
    const existing = paths.get(path);
    if (existing) {
      throw new Error(`Repos "${existing}" and "${name}" resolve to the same clone path: ${path}.`);
    }

    paths.set(path, name);
  }

  return { manifest, root, catalogs, repoCatalogs, groupCatalogs };
};

export const readManifest = (root?: string, selection: CatalogSelection = 'all'): CatalogState => {
  const resolvedRoot = resolveRoot(root);
  const publicCatalog = readCatalog(resolvedRoot, 'public') as PublicCatalog;
  if (selection === 'public') {
    return buildState(resolvedRoot, { public: publicCatalog });
  }

  const privatePath = privateCatalogPath(resolvedRoot);
  if (!existsSync(privatePath)) {
    if (selection === 'private') {
      readCatalog(resolvedRoot, 'private');
    }

    return buildState(resolvedRoot, { public: publicCatalog });
  }

  const privateCatalog = readCatalog(resolvedRoot, 'private') as PrivateCatalog;
  return buildState(resolvedRoot, { public: publicCatalog, private: privateCatalog });
};

const dumpCatalog = (catalog: PublicCatalog | PrivateCatalog): string =>
  yamlDump(catalog, { lineWidth: -1, noRefs: true, quotingType: "'", forceQuotes: false });

const writeCatalog = (state: CatalogState, catalog: CatalogName): void => {
  const value = state.catalogs[catalog];
  if (!value) {
    throw new Error(`Cannot write missing ${catalog} catalog.`);
  }

  const filePath = catalog === 'public' ? publicCatalogPath(state.root) : privateCatalogPath(state.root);
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temporaryPath, dumpCatalog(value), 'utf8');
    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }

    throw error;
  }
};

export const mutateCatalog = (
  state: CatalogState,
  catalog: CatalogName,
  mutate: (value: PublicCatalog | PrivateCatalog) => void,
): CatalogState => {
  const catalogs = structuredClone(state.catalogs);
  const target = catalogs[catalog];
  if (!target) {
    throw new Error(`Cannot mutate missing ${catalog} catalog.`);
  }

  mutate(target);
  const next = buildState(state.root, catalogs);
  writeCatalog(next, catalog);
  return next;
};

// ── Resolution and Paths ────────────────────────────────────────

export const repoUrl = (ownerRepo: string): string => `https://github.com/${ownerRepo}.git`;
export const parseOwnerRepo = (url: string): string | undefined =>
  /github\.com[/:](?<ownerRepo>[^/]+\/[^./]+?)(?:\.git)?$/.exec(url)?.groups?.['ownerRepo'];

export const repoPath = (context: RepoContext): string =>
  resolve(context.root, context.manifest.repos_dir, context.repo.path ?? context.name);

const includesCatalog = (owner: CatalogName, selection: CatalogSelection): boolean =>
  selection === 'all' || owner === selection;

export const resolveRepos = (
  state: CatalogState,
  options: { filter?: RepoFilter; catalog?: CatalogSelection } = {},
): ResolvedRepo[] => {
  const { manifest, repoCatalogs, groupCatalogs } = state;
  const filter = options.filter;
  const selection = options.catalog ?? 'all';
  const entries = Object.entries(manifest.repos).map(([name, repo]): ResolvedRepo => [name, repo, repoCatalogs[name]!]);

  if (!filter || filter.all) {
    return entries.filter(([, , owner]) => includesCatalog(owner, selection));
  }
  if (filter.name) {
    const repo = manifest.repos[filter.name];
    const owner = repoCatalogs[filter.name];
    if (!repo || !owner || !includesCatalog(owner, selection)) {
      throw new Error(`Repo "${filter.name}" not found in selected catalog.`);
    }

    return [[filter.name, repo, owner]];
  }
  if (filter.group) {
    const group = manifest.groups[filter.group];
    const groupOwner = groupCatalogs[filter.group];
    if (!group || !groupOwner || !includesCatalog(groupOwner, selection)) {
      const available = Object.keys(manifest.groups)
        .filter((name) => includesCatalog(groupCatalogs[name]!, selection))
        .join(', ');
      throw new Error(`Group "${filter.group}" not found in selected catalog. Available: ${available}`);
    }

    return group.repos
      .filter((name) => includesCatalog(repoCatalogs[name]!, selection))
      .map((name): ResolvedRepo => [name, manifest.repos[name]!, repoCatalogs[name]!]);
  }

  return entries.filter(([, , owner]) => includesCatalog(owner, selection));
};

export const resolveGroups = (state: CatalogState, selection: CatalogSelection = 'all'): ResolvedGroup[] =>
  Object.entries(state.manifest.groups)
    .filter(([name]) => includesCatalog(state.groupCatalogs[name]!, selection))
    .map(([name, group]) => [name, group, state.groupCatalogs[name]!] as ResolvedGroup);

// ── Git Helpers ─────────────────────────────────────────────────

export const isCloned = (context: RepoContext): boolean => existsSync(join(repoPath(context), '.git'));

export const gitExec = (context: RepoContext, args: string[]): string =>
  execSync(['git', ...args].join(' '), {
    cwd: repoPath(context),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();

export const getLastActivity = (context: RepoContext): number | undefined => {
  if (!isCloned(context)) {
    return undefined;
  }

  try {
    return Number.parseInt(gitExec(context, ['log', '-1', '--format=%ct']), 10);
  } catch {
    return undefined;
  }
};

export const getRepoStatus = (context: RepoContext): RepoStatus => {
  const { name, repo, catalog } = context;
  if (!isCloned(context)) {
    return { name, catalog, cloned: false };
  }

  try {
    const branch = gitExec(context, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const dirty = gitExec(context, ['status', '--porcelain']).length > 0;
    let ahead = 0;
    let behind = 0;
    try {
      const [behindRaw = '0', aheadRaw = '0'] = gitExec(context, [
        'rev-list',
        '--left-right',
        '--count',
        `origin/${branch}...HEAD`,
      ]).split('\t');
      behind = Number.parseInt(behindRaw, 10);
      ahead = Number.parseInt(aheadRaw, 10);
    } catch {
      // No tracking branch.
    }

    let upstreamAhead: number | undefined;
    if (repo.fork) {
      try {
        upstreamAhead = Number.parseInt(
          gitExec(context, ['rev-list', '--count', `HEAD..upstream/${repo.branch ?? branch}`]),
          10,
        );
      } catch {
        // Upstream has not been fetched.
      }
    }

    let pinnedCommit: string | undefined;
    let atPinnedCommit: boolean | undefined;
    if (repo.commit) {
      pinnedCommit = repo.commit;
      try {
        const head = gitExec(context, ['rev-parse', 'HEAD']);
        atPinnedCommit = head.startsWith(repo.commit) || repo.commit.startsWith(head);
      } catch {
        atPinnedCommit = false;
      }
    }

    return {
      name,
      catalog,
      cloned: true,
      branch,
      dirty,
      ahead,
      behind,
      upstreamAhead,
      lastActivity: getLastActivity(context),
      pinnedCommit,
      atPinnedCommit,
    };
  } catch {
    return { name, catalog, cloned: true };
  }
};

// ── Metadata and Mutations ──────────────────────────────────────

export const fetchRepoDescription = (upstream: string): string | undefined => {
  try {
    const raw = execSync(`gh repo view ${upstream} --json description -q .description`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return raw || undefined;
  } catch {
    return undefined;
  }
};

export const setRepoDescription = (state: CatalogState, name: string, description: string): CatalogState => {
  const owner = state.repoCatalogs[name];
  if (!owner) {
    throw new Error(`Repo "${name}" not found.`);
  }

  return mutateCatalog(state, owner, (catalog) => {
    catalog.repos[name]!.description = description;
  });
};

export const removeRepo = (state: CatalogState, name: string): CatalogState => {
  const owner = state.repoCatalogs[name];
  if (!owner) {
    throw new Error(`Repo "${name}" not found in manifest.`);
  }

  const foreignReferences = Object.entries(state.manifest.groups)
    .filter(([groupName, group]) => state.groupCatalogs[groupName] !== owner && group.repos.includes(name))
    .map(([groupName]) => groupName);
  if (foreignReferences.length > 0) {
    throw new Error(
      `Cannot remove "${name}"; ${owner === 'public' ? 'private' : 'public'} group references remain: ${foreignReferences.join(', ')}.`,
    );
  }

  return mutateCatalog(state, owner, (catalog) => {
    delete catalog.repos[name];
    for (const group of Object.values(catalog.groups)) {
      group.repos = group.repos.filter((repoName) => repoName !== name);
    }
  });
};

// ── Clone / Sync ────────────────────────────────────────────────

export type BuildCloneArgsOptions = { cloneUrl: string; directory: string; branch?: string; shallow?: boolean };

export const buildCloneArgs = (options: BuildCloneArgsOptions): string[] => {
  const args = ['git', 'clone'];
  if (options.shallow) {
    args.push('--depth', '1');
  }
  if (options.branch) {
    args.push('--branch', options.branch);
  }
  args.push(options.cloneUrl, options.directory);
  return args;
};

export const cloneRepo = (context: RepoContext): { action: 'cloned' | 'skipped'; message: string } => {
  const { name, repo } = context;
  const directory = repoPath(context);
  if (existsSync(join(directory, '.git'))) {
    return { action: 'skipped', message: `${name}: already cloned` };
  }

  if (!repo.description) {
    const description = fetchRepoDescription(repo.upstream);
    if (description && context.state) {
      setRepoDescription(context.state, name, description);
    }
  }

  const cloneUrl = repo.fork ? repoUrl(repo.fork) : repoUrl(repo.upstream);
  const args = buildCloneArgs({ cloneUrl, directory, branch: repo.branch, shallow: repo.shallow && !repo.commit });
  execSync(args.join(' '), { stdio: 'inherit' });
  if (repo.fork) {
    execSync(`git -C ${directory} remote add upstream ${repoUrl(repo.upstream)}`, { stdio: 'inherit' });
  }
  if (repo.commit) {
    execSync(`git -C ${directory} checkout ${repo.commit}`, { stdio: 'inherit' });
  }

  return { action: 'cloned', message: `${name}: cloned` };
};

export const syncRepo = (context: RepoContext): { ok: boolean; message: string } => {
  const { name, repo } = context;
  if (!isCloned(context)) {
    return { ok: false, message: `${name}: not cloned` };
  }

  try {
    gitExec(context, ['fetch', '--all', '--prune']);
    if (repo.commit) {
      const currentHead = gitExec(context, ['rev-parse', 'HEAD']);
      if (currentHead.startsWith(repo.commit) || repo.commit.startsWith(currentHead)) {
        return { ok: true, message: `${name}: already at pinned commit ${repo.commit.slice(0, 7)}` };
      }

      gitExec(context, ['checkout', repo.commit]);
      return { ok: true, message: `${name}: checked out pinned commit ${repo.commit.slice(0, 7)}` };
    }

    try {
      gitExec(context, ['pull', '--ff-only']);
    } catch {
      return { ok: false, message: `${name}: fetch ok, pull --ff-only failed (diverged?)` };
    }

    return { ok: true, message: `${name}: synced` };
  } catch (error) {
    return { ok: false, message: `${name}: ${error instanceof Error ? error.message : String(error)}` };
  }
};

// ── Fork / Unfork ───────────────────────────────────────────────

export const forkRepo = (state: CatalogState, name: string): { ok: boolean; message: string } => {
  const repo = state.manifest.repos[name];
  if (!repo) {
    return { ok: false, message: `Repo "${name}" not found in manifest.` };
  }
  if (repo.fork) {
    return { ok: false, message: `${name}: already forked to ${repo.fork}` };
  }

  const forkSlug = `${state.manifest.owner}/${repo.upstream.split('/')[1]}`;
  try {
    execSync(`gh repo fork ${repo.upstream} --org ${state.manifest.owner} --clone=false`, { stdio: 'inherit' });
  } catch {
    // The fork may already exist on GitHub.
  }

  mutateCatalog(state, state.repoCatalogs[name]!, (catalog) => {
    catalog.repos[name]!.fork = forkSlug;
  });
  const context: RepoContext = {
    name,
    repo,
    manifest: state.manifest,
    root: state.root,
    catalog: state.repoCatalogs[name],
    state,
  };
  if (isCloned(context)) {
    const directory = repoPath(context);
    try {
      execSync(`git -C ${directory} remote rename origin upstream`, { stdio: 'pipe' });
    } catch {
      // The upstream remote may already exist.
    }
    try {
      execSync(`git -C ${directory} remote add origin ${repoUrl(forkSlug)}`, { stdio: 'pipe' });
    } catch {
      execSync(`git -C ${directory} remote set-url origin ${repoUrl(forkSlug)}`, { stdio: 'pipe' });
    }
  }

  return { ok: true, message: `${name}: forked to ${forkSlug}` };
};

export const unforkRepo = (state: CatalogState, name: string): { ok: boolean; message: string } => {
  const repo = state.manifest.repos[name];
  if (!repo) {
    return { ok: false, message: `Repo "${name}" not found in manifest.` };
  }
  if (!repo.fork) {
    return { ok: false, message: `${name}: not forked` };
  }

  const context: RepoContext = {
    name,
    repo,
    manifest: state.manifest,
    root: state.root,
    catalog: state.repoCatalogs[name],
    state,
  };
  if (isCloned(context)) {
    const directory = repoPath(context);
    try {
      execSync(`git -C ${directory} remote remove origin`, { stdio: 'pipe' });
      execSync(`git -C ${directory} remote rename upstream origin`, { stdio: 'pipe' });
    } catch {
      // Remote cleanup is best effort.
    }
  }

  mutateCatalog(state, state.repoCatalogs[name]!, (catalog) => {
    delete catalog.repos[name]!.fork;
  });
  return { ok: true, message: `${name}: unforked (upstream only)` };
};
