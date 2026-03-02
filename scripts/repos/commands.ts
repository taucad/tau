/* eslint-disable no-restricted-imports -- standalone scripts use relative imports */

import process from 'node:process';
import { execSync } from 'node:child_process';
import type { RepoConfig, RepoStatus } from './lib.ts';
import {
  cloneRepo,
  forkRepo,
  getRepoStatus,
  isCloned,
  parseOwnerRepo,
  readManifest,
  repoPath,
  resolveRepos,
  syncRepo,
  unforkRepo,
  writeManifest,
} from './lib.ts';

// ── Arg Parsing ─────────────────────────────────────────────────

const shortFlagMap: Record<string, string> = {
  g: 'group',
  b: 'branch',
  d: 'description',
  p: 'path',
};

function parseArgs(argv: string[]): {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const command = argv[0] ?? '';
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 1;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const short = arg[1]!;
      const longKey = shortFlagMap[short] ?? short;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        flags[longKey] = next;
        i += 2;
      } else {
        flags[longKey] = true;
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { command, positional, flags };
}

function getFilter(
  positional: string[],
  flags: Record<string, string | boolean>,
): {
  name?: string;
  group?: string;
  all?: boolean;
} {
  if (flags['all']) {
    return { all: true };
  }

  if (typeof flags['group'] === 'string') {
    return { group: flags['group'] };
  }

  if (positional.length > 0) {
    return { name: positional[0] };
  }

  return { all: true };
}

// ── Commands ────────────────────────────────────────────────────

function cmdClone(positional: string[], flags: Record<string, string | boolean>): void {
  const { manifest, root } = readManifest();
  const filter = getFilter(positional, flags);
  const repos = resolveRepos(manifest, filter);

  const results: Array<{ name: string; action: string; message: string }> = [];
  for (const [name, repo] of repos) {
    const result = cloneRepo(name, repo, manifest, root);
    results.push({ name, ...result });
    console.log(result.message);
  }

  if (flags['json']) {
    console.log(JSON.stringify(results, undefined, 2));
  }
}

function cmdSync(positional: string[], flags: Record<string, string | boolean>): void {
  const { manifest, root } = readManifest();
  const filter = getFilter(positional, flags);
  const repos = resolveRepos(manifest, filter);

  const results: Array<{ name: string; ok: boolean; message: string }> = [];
  for (const [name, repo] of repos) {
    if (!isCloned(name, repo, manifest, root)) {
      continue;
    }

    const result = syncRepo(name, repo, manifest, root);
    results.push({ name, ...result });
    console.log(result.message);
  }

  if (flags['json']) {
    console.log(JSON.stringify(results, undefined, 2));
  }
}

function cmdStatus(positional: string[], flags: Record<string, string | boolean>): void {
  const { manifest, root } = readManifest();
  const filter = getFilter(positional, flags);
  const repos = resolveRepos(manifest, filter);

  const statuses: RepoStatus[] = [];
  for (const [name, repo] of repos) {
    statuses.push(getRepoStatus(name, repo, manifest, root));
  }

  if (flags['json']) {
    console.log(JSON.stringify(statuses, undefined, 2));
    return;
  }

  const nameWidth = Math.max(...statuses.map((s) => s.name.length), 4);
  console.log(`${'NAME'.padEnd(nameWidth)}  STATUS   BRANCH               DIRTY  AHEAD  BEHIND`);
  console.log('─'.repeat(nameWidth + 55));

  for (const s of statuses) {
    const status = s.cloned ? 'cloned' : '─';
    const branch = s.branch ?? '─';
    const dirty = s.dirty ? 'yes' : s.cloned ? 'no' : '─';
    const ahead = s.ahead === undefined ? '─' : String(s.ahead);
    const behind = s.behind === undefined ? '─' : String(s.behind);
    console.log(
      `${s.name.padEnd(nameWidth)}  ${status.padEnd(7)}  ${branch.padEnd(20)} ${dirty.padEnd(6)} ${ahead.padEnd(6)} ${behind}`,
    );
  }
}

function cmdList(flags: Record<string, string | boolean>): void {
  const { manifest, root } = readManifest();

  if (flags['groups']) {
    if (flags['json']) {
      console.log(JSON.stringify(manifest.groups, undefined, 2));
      return;
    }

    for (const [name, group] of Object.entries(manifest.groups)) {
      console.log(`${name}: ${group.description ?? ''}`);
      for (const repoName of group.repos) {
        const clonedFlag = manifest.repos[repoName]
          ? isCloned(repoName, manifest.repos[repoName], manifest, root)
            ? '✓'
            : '·'
          : '?';
        console.log(`  ${clonedFlag} ${repoName}`);
      }

      console.log();
    }

    return;
  }

  const entries = Object.entries(manifest.repos);
  if (flags['json']) {
    const data = entries.map(([name, repo]) => ({
      name,
      upstream: repo.upstream,
      fork: repo.fork,
      branch: repo.branch,
      description: repo.description,
      cloned: isCloned(name, repo, manifest, root),
      path: repo.path ?? name,
    }));

    if (flags['cloned']) {
      console.log(
        JSON.stringify(
          data.filter((d) => d.cloned),
          undefined,
          2,
        ),
      );
    } else {
      console.log(JSON.stringify(data, undefined, 2));
    }

    return;
  }

  const nameWidth = Math.max(...entries.map(([n]) => n.length), 4);
  console.log(`${'NAME'.padEnd(nameWidth)}  CLN  ORIGIN                    UPSTREAM                  BRANCH`);
  console.log('─'.repeat(nameWidth + 70));

  for (const [name, repo] of entries) {
    if (flags['cloned'] && !isCloned(name, repo, manifest, root)) {
      continue;
    }

    const clonedFlag = isCloned(name, repo, manifest, root) ? '✓' : '·';
    const origin = repo.fork ?? repo.upstream;
    const upstream = repo.fork ? `← ${repo.upstream}` : '─';
    const branch = repo.branch ?? '─';
    console.log(`${name.padEnd(nameWidth)}   ${clonedFlag}   ${origin.padEnd(24)}  ${upstream.padEnd(24)}  ${branch}`);
  }
}

function cmdExec(positional: string[], flags: Record<string, string | boolean>): void {
  const { manifest, root } = readManifest();
  const filter = getFilter([], flags);
  const repos = resolveRepos(manifest, filter);

  const cmd = positional.join(' ');
  if (!cmd) {
    throw new Error('Usage: repos exec [--group G] [--all] -- <command>');
  }

  for (const [name, repo] of repos) {
    if (!isCloned(name, repo, manifest, root)) {
      continue;
    }

    const dir = repoPath(name, repo, manifest, root);
    console.log(`\n=== ${name} ===`);
    try {
      execSync(cmd, { cwd: dir, stdio: 'inherit' });
    } catch {
      console.error(`  Command failed in ${name}`);
    }
  }
}

function cmdFork(positional: string[]): void {
  const name = positional[0];
  if (!name) {
    throw new Error('Usage: repos fork <name>');
  }

  const { manifest, root } = readManifest();
  const result = forkRepo(name, manifest, root);
  console.log(result.message);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

function cmdUnfork(positional: string[]): void {
  const name = positional[0];
  if (!name) {
    throw new Error('Usage: repos unfork <name>');
  }

  const { manifest, root } = readManifest();
  const result = unforkRepo(name, manifest, root);
  console.log(result.message);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

function cmdAdd(positional: string[], flags: Record<string, string | boolean>): void {
  const raw = positional[0];
  if (!raw) {
    throw new Error(
      'Usage: repos add <owner/repo | github-url> [-g group] [-b branch] [-d description] [--shallow] [--clone]',
    );
  }

  const slug = raw.includes('://') ? parseOwnerRepo(raw) : raw;
  if (!slug?.includes('/')) {
    throw new Error(`Could not parse repo slug from "${raw}". Expected owner/repo or a GitHub URL.`);
  }

  const repoName = slug.split('/')[1]!;
  const { manifest, root } = readManifest();

  if (manifest.repos[repoName]) {
    throw new Error(`Repo "${repoName}" already exists in manifest.`);
  }

  let description: string | undefined;
  if (typeof flags['description'] === 'string') {
    description = flags['description'];
  } else {
    try {
      const raw = execSync(`gh repo view ${slug} --json description -q .description`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      description = raw || undefined;
    } catch {
      // Gh CLI not available or repo not found
    }
  }

  const config: RepoConfig = {
    upstream: slug,
    ...(typeof flags['branch'] === 'string' && { branch: flags['branch'] }),
    ...(description && { description }),
    ...(typeof flags['path'] === 'string' && { path: flags['path'] }),
    ...(flags['shallow'] && { shallow: true }),
  };

  manifest.repos[repoName] = config;
  const groupName = typeof flags['group'] === 'string' ? flags['group'] : undefined;
  if (groupName) {
    manifest.groups[groupName] ??= { repos: [] };

    if (!manifest.groups[groupName].repos.includes(repoName)) {
      manifest.groups[groupName].repos.push(repoName);
    }
  }

  writeManifest(manifest, root);
  console.log(`✓ Added ${repoName} (${slug})`);

  if (groupName) {
    console.log(`  → added to group "${groupName}"`);
  }

  if (flags['clone']) {
    const result = cloneRepo(repoName, manifest.repos[repoName], manifest, root);
    console.log(result.message);
  }
}

function cmdRemove(positional: string[]): void {
  const name = positional[0];
  if (!name) {
    throw new Error('Usage: repos remove <name>');
  }

  const { manifest, root } = readManifest();
  if (!manifest.repos[name]) {
    throw new Error(`Repo "${name}" not found in manifest.`);
  }

  const { [name]: _, ...remainingRepos } = manifest.repos;
  manifest.repos = remainingRepos;

  for (const group of Object.values(manifest.groups)) {
    const idx = group.repos.indexOf(name);
    if (idx !== -1) {
      group.repos.splice(idx, 1);
    }
  }

  writeManifest(manifest, root);
  console.log(`✓ Removed ${name} from manifest`);
}

// ── Dispatcher ──────────────────────────────────────────────────

const helpText = `
Usage: repos <command> [options]

Commands:
  add    <owner/repo> [-g group] [-b branch] [-d desc] [--shallow] [--clone]
  remove <name>                               Remove repo from manifest
  clone  [name] [--group G] [--all]           Clone repos
  sync   [name] [--group G] [--all]           Pull latest changes
  status [name] [--group G] [--all] [--json]  Show repo status
  list   [--groups] [--cloned] [--json]       List repos/groups
  exec   [--group G] [--all] -- <cmd>         Run command across repos
  fork   <name>                               Fork repo to owner org
  unfork <name>                               Remove fork config

Short flags: -g (group) -b (branch) -d (description) -p (path)

Run without arguments for interactive TUI.
`.trim();

export function run(argv: string[]): void {
  const { command, positional, flags } = parseArgs(argv);

  switch (command) {
    case 'add': {
      cmdAdd(positional, flags);
      break;
    }

    case 'remove':
    case 'rm': {
      cmdRemove(positional);
      break;
    }

    case 'clone': {
      cmdClone(positional, flags);
      break;
    }

    case 'sync': {
      cmdSync(positional, flags);
      break;
    }

    case 'status': {
      cmdStatus(positional, flags);
      break;
    }

    case 'list': {
      cmdList(flags);
      break;
    }

    case 'exec': {
      cmdExec(positional, flags);
      break;
    }

    case 'fork': {
      cmdFork(positional);
      break;
    }

    case 'unfork': {
      cmdUnfork(positional);
      break;
    }

    case 'help':
    case '--help':
    case '-h': {
      console.log(helpText);
      break;
    }

    default: {
      console.error(`Unknown command: ${command}\n`);
      console.log(helpText);
      throw new Error(`Unknown command: ${command}`);
    }
  }
}
