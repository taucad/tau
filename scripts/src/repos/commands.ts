/* oxlint-disable no-restricted-imports -- standalone scripts use relative imports */

import { execSync } from 'node:child_process';
import type { CatalogName, CatalogSelection, RepoConfig, RepoContext, RepoFilter, RepoStatus } from './lib.ts';
import {
  cloneRepo,
  forkRepo,
  getRepoStatus,
  isCloned,
  mutateCatalog,
  parseOwnerRepo,
  readManifest,
  removeRepo,
  repoPath,
  resolveGroups,
  resolveRepos,
  syncRepo,
  unforkRepo,
} from './lib.ts';

const shortFlagMap: Record<string, string> = {
  g: 'group',
  b: 'branch',
  c: 'commit',
  d: 'description',
  p: 'path',
};

type ParsedArgs = { command: string; positional: string[]; flags: Record<string, string | boolean> };

const parseArgs = (argv: string[]): ParsedArgs => {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let index = 1;
  while (index < argv.length) {
    const argument = argv[index]!;
    if (argument === '--') {
      positional.push(...argv.slice(index + 1));
      break;
    }

    if (argument.startsWith('--')) {
      const key = argument.slice(2);
      const next = argv[index + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        index += 2;
      } else {
        flags[key] = true;
        index += 1;
      }
      continue;
    }

    if (argument.startsWith('-') && argument.length === 2) {
      const key = shortFlagMap[argument[1]!] ?? argument[1]!;
      const next = argv[index + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        index += 2;
      } else {
        flags[key] = true;
        index += 1;
      }
      continue;
    }

    positional.push(argument);
    index += 1;
  }

  return { command: argv[0] ?? '', positional, flags };
};

const getFilter = (positional: string[], flags: Record<string, string | boolean>): RepoFilter => {
  if (flags['all']) {
    return { all: true };
  }
  if (typeof flags['group'] === 'string') {
    return { group: flags['group'] };
  }
  if (positional[0]) {
    return { name: positional[0] };
  }
  return { all: true };
};

const getCatalog = (flags: Record<string, string | boolean>, fallback: CatalogSelection): CatalogSelection => {
  const value = flags['catalog'];
  if (value === undefined) {
    return fallback;
  }
  if (value === 'public' || value === 'private' || value === 'all') {
    return value;
  }

  throw new Error('--catalog must be public, private, or all.');
};

const getMutationCatalog = (flags: Record<string, string | boolean>): CatalogName => {
  const catalog = getCatalog(flags, 'private');
  if (catalog === 'all') {
    throw new Error('repos add requires --catalog public or --catalog private; writes cannot target all catalogs.');
  }

  return catalog;
};

const rejectCatalogOverride = (flags: Record<string, string | boolean>, command: string): void => {
  if (flags['catalog'] !== undefined) {
    throw new Error(`repos ${command} infers the owning catalog; --catalog is not accepted.`);
  }
};

const contextFor = (
  state: ReturnType<typeof readManifest>,
  entry: ReturnType<typeof resolveRepos>[number],
): RepoContext => {
  const [name, repo, catalog] = entry;
  return { name, repo, catalog, manifest: state.manifest, root: state.root, state };
};

const cmdClone = (positional: string[], flags: Record<string, string | boolean>): void => {
  const catalog = getCatalog(flags, 'all');
  const state = readManifest(undefined, catalog);
  const repos = resolveRepos(state, { filter: getFilter(positional, flags), catalog });
  const results: Array<{ name: string; catalog: CatalogName; action: string; message: string }> = [];
  for (const entry of repos) {
    const [name, , owner] = entry;
    const result = cloneRepo(contextFor(state, entry));
    results.push({ name, catalog: owner, ...result });
    if (!flags['json']) {
      console.log(result.message);
    }
  }

  if (flags['json']) {
    console.log(JSON.stringify(results, undefined, 2));
  }
};

const cmdSync = (positional: string[], flags: Record<string, string | boolean>): void => {
  const catalog = getCatalog(flags, 'all');
  const state = readManifest(undefined, catalog);
  const repos = resolveRepos(state, { filter: getFilter(positional, flags), catalog });
  const results: Array<{ name: string; catalog: CatalogName; ok: boolean; message: string }> = [];
  for (const entry of repos) {
    const [name, , owner] = entry;
    const context = contextFor(state, entry);
    if (!isCloned(context)) {
      continue;
    }

    const result = syncRepo(context);
    results.push({ name, catalog: owner, ...result });
    if (!flags['json']) {
      console.log(result.message);
    }
  }

  if (flags['json']) {
    console.log(JSON.stringify(results, undefined, 2));
  }
};

const cmdStatus = (positional: string[], flags: Record<string, string | boolean>): void => {
  const catalog = getCatalog(flags, 'all');
  const state = readManifest(undefined, catalog);
  const statuses: RepoStatus[] = resolveRepos(state, { filter: getFilter(positional, flags), catalog }).map((entry) =>
    getRepoStatus(contextFor(state, entry)),
  );
  if (flags['json']) {
    console.log(JSON.stringify(statuses, undefined, 2));
    return;
  }

  const nameWidth = Math.max(4, ...statuses.map((status) => status.name.length));
  console.log(`${'NAME'.padEnd(nameWidth)}  CATALOG  STATUS   BRANCH               DIRTY  AHEAD  BEHIND  PINNED`);
  console.log('─'.repeat(nameWidth + 72));
  for (const status of statuses) {
    const cloned = status.cloned ? 'cloned' : '─';
    const branch = status.branch ?? '─';
    const dirty = status.dirty ? 'yes' : status.cloned ? 'no' : '─';
    const ahead = status.ahead === undefined ? '─' : String(status.ahead);
    const behind = status.behind === undefined ? '─' : String(status.behind);
    const pinned = status.pinnedCommit
      ? status.atPinnedCommit
        ? `✓ ${status.pinnedCommit.slice(0, 7)}`
        : `✗ ${status.pinnedCommit.slice(0, 7)}`
      : '─';
    console.log(
      `${status.name.padEnd(nameWidth)}  ${(status.catalog ?? '─').padEnd(7)}  ${cloned.padEnd(7)}  ${branch.padEnd(20)} ${dirty.padEnd(6)} ${ahead.padEnd(6)} ${behind.padEnd(7)} ${pinned}`,
    );
  }
};

const cmdList = (flags: Record<string, string | boolean>): void => {
  const catalog = getCatalog(flags, 'all');
  const state = readManifest(undefined, catalog);
  if (flags['groups']) {
    const groups = resolveGroups(state, catalog).map(([name, group, owner]) => ({
      name,
      description: group.description,
      catalog: owner,
      repos: group.repos.map((repoName) => ({ name: repoName, catalog: state.repoCatalogs[repoName] })),
    }));
    if (flags['json']) {
      console.log(JSON.stringify(groups, undefined, 2));
      return;
    }

    for (const group of groups) {
      console.log(`${group.name} [${group.catalog}]: ${group.description ?? ''}`);
      for (const member of group.repos) {
        const repo = state.manifest.repos[member.name];
        const clonedFlag = repo
          ? isCloned({ name: member.name, repo, manifest: state.manifest, root: state.root })
            ? '✓'
            : '·'
          : '?';
        console.log(`  ${clonedFlag} ${member.name} [${member.catalog ?? 'missing'}]`);
      }

      console.log();
    }
    return;
  }

  const entries = resolveRepos(state, { catalog });
  const data = entries.map(([name, repo, owner]) => ({
    name,
    catalog: owner,
    upstream: repo.upstream,
    fork: repo.fork,
    branch: repo.branch,
    commit: repo.commit,
    description: repo.description,
    cloned: isCloned({ name, repo, manifest: state.manifest, root: state.root }),
    path: repo.path ?? name,
  }));
  const visible = flags['cloned'] ? data.filter((repo) => repo.cloned) : data;
  if (flags['json']) {
    console.log(JSON.stringify(visible, undefined, 2));
    return;
  }

  const nameWidth = Math.max(4, ...visible.map((repo) => repo.name.length));
  console.log(`${'NAME'.padEnd(nameWidth)}  CATALOG  CLN  ORIGIN                    UPSTREAM                  BRANCH`);
  console.log('─'.repeat(nameWidth + 79));
  for (const repo of visible) {
    const source = state.manifest.repos[repo.name]!;
    const clonedFlag = repo.cloned ? '✓' : '·';
    const origin = source.fork ?? source.upstream;
    const upstream = source.fork ? `← ${source.upstream}` : '─';
    console.log(
      `${repo.name.padEnd(nameWidth)}  ${repo.catalog.padEnd(7)}   ${clonedFlag}   ${origin.padEnd(24)}  ${upstream.padEnd(24)}  ${repo.branch ?? '─'}`,
    );
  }
};

const cmdExec = (positional: string[], flags: Record<string, string | boolean>): void => {
  const command = positional.join(' ');
  if (!command) {
    throw new Error('Usage: repos exec [--group G] [--all] [--catalog public|private|all] -- <command>');
  }

  const catalog = getCatalog(flags, 'all');
  const state = readManifest(undefined, catalog);
  const repos = resolveRepos(state, { filter: getFilter([], flags), catalog });
  for (const entry of repos) {
    const [name] = entry;
    const context = contextFor(state, entry);
    if (!isCloned(context)) {
      continue;
    }

    console.log(`\n=== ${name} [${context.catalog}] ===`);
    try {
      execSync(command, { cwd: repoPath(context), stdio: 'inherit' });
    } catch {
      console.error(`  Command failed in ${name}`);
    }
  }
};

const cmdFork = (positional: string[], flags: Record<string, string | boolean>): void => {
  rejectCatalogOverride(flags, 'fork');
  const name = positional[0];
  if (!name) {
    throw new Error('Usage: repos fork <name>');
  }

  const result = forkRepo(readManifest(), name);
  console.log(result.message);
  if (!result.ok) {
    throw new Error(result.message);
  }
};

const cmdUnfork = (positional: string[], flags: Record<string, string | boolean>): void => {
  rejectCatalogOverride(flags, 'unfork');
  const name = positional[0];
  if (!name) {
    throw new Error('Usage: repos unfork <name>');
  }

  const result = unforkRepo(readManifest(), name);
  console.log(result.message);
  if (!result.ok) {
    throw new Error(result.message);
  }
};

const cmdAdd = (positional: string[], flags: Record<string, string | boolean>): void => {
  const raw = positional[0];
  if (!raw) {
    throw new Error(
      'Usage: repos add <owner/repo | github-url> [--catalog public|private] [-g group] [-b branch] [-d description] [--shallow] [--clone]',
    );
  }

  const slug = raw.includes('://') ? parseOwnerRepo(raw) : raw;
  if (!slug?.includes('/')) {
    throw new Error(`Could not parse repo slug from "${raw}". Expected owner/repo or a GitHub URL.`);
  }

  const target = getMutationCatalog(flags);
  const repoName = slug.split('/')[1]!;
  const state = readManifest(undefined, target === 'public' ? 'all' : 'private');
  if (state.manifest.repos[repoName]) {
    throw new Error(`Repo "${repoName}" already exists in manifest.`);
  }

  let description = typeof flags['description'] === 'string' ? flags['description'] : undefined;
  if (!description) {
    try {
      description = execSync(`gh repo view ${slug} --json description -q .description`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // GitHub metadata is optional.
    }
  }

  const config: RepoConfig = {
    upstream: slug,
    ...(typeof flags['branch'] === 'string' && { branch: flags['branch'] }),
    ...(typeof flags['commit'] === 'string' && { commit: flags['commit'] }),
    ...(description && { description }),
    ...(typeof flags['path'] === 'string' && { path: flags['path'] }),
    ...(flags['shallow'] && { shallow: true }),
  };
  const groupName = typeof flags['group'] === 'string' ? flags['group'] : undefined;
  if (groupName && state.groupCatalogs[groupName] && state.groupCatalogs[groupName] !== target) {
    throw new Error(`Group "${groupName}" belongs to the ${state.groupCatalogs[groupName]} catalog.`);
  }

  const next = mutateCatalog(state, target, (catalog) => {
    catalog.repos[repoName] = config;
    if (groupName) {
      catalog.groups[groupName] ??= { repos: [] };
      catalog.groups[groupName].repos.push(repoName);
    }
  });
  console.log(`✓ Added ${repoName} (${slug}) to ${target} catalog`);
  if (groupName) {
    console.log(`  → added to group "${groupName}"`);
  }
  if (flags['clone']) {
    const repo = next.manifest.repos[repoName]!;
    console.log(
      cloneRepo({ name: repoName, repo, catalog: target, manifest: next.manifest, root: next.root, state: next })
        .message,
    );
  }
};

const cmdRemove = (positional: string[], flags: Record<string, string | boolean>): void => {
  rejectCatalogOverride(flags, 'remove');
  const name = positional[0];
  if (!name) {
    throw new Error('Usage: repos remove <name>');
  }

  const state = readManifest();
  const owner = state.repoCatalogs[name];
  removeRepo(state, name);
  console.log(`✓ Removed ${name} from ${owner} catalog`);
};

const helpText = `
Usage: repos <command> [options]

Commands:
  add    <owner/repo> [--catalog public|private] [-g group] [-b branch] [-c commit] [-d desc] [--shallow] [--clone]
  remove <name>                                      Remove repo from its owning catalog
  clone  [name] [--group G] [--all] [--catalog C]   Clone repos
  sync   [name] [--group G] [--all] [--catalog C]   Pull latest / checkout pinned commit
  status [name] [--group G] [--all] [--catalog C]   Show repo status
  list   [--groups] [--cloned] [--catalog C]        List repos/groups
  exec   [--group G] [--all] [--catalog C] -- <cmd> Run command across repos
  fork   <name>                                      Fork repo to owner org
  unfork <name>                                      Remove fork config

C is public, private, or all. Reads default to all; add defaults to private.
Short flags: -g (group) -b (branch) -c (commit) -d (description) -p (path)

Run without arguments for interactive TUI.
`.trim();

export const run = (argv: string[]): void => {
  const { command, positional, flags } = parseArgs(argv);
  switch (command) {
    case 'add':
      cmdAdd(positional, flags);
      break;
    case 'remove':
    case 'rm':
      cmdRemove(positional, flags);
      break;
    case 'clone':
      cmdClone(positional, flags);
      break;
    case 'sync':
      cmdSync(positional, flags);
      break;
    case 'status':
      cmdStatus(positional, flags);
      break;
    case 'list':
      cmdList(flags);
      break;
    case 'exec':
      cmdExec(positional, flags);
      break;
    case 'fork':
      cmdFork(positional, flags);
      break;
    case 'unfork':
      cmdUnfork(positional, flags);
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(helpText);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(helpText);
      throw new Error(`Unknown command: ${command}`);
  }
};
