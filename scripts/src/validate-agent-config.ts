/**
 * Validate Tau's authored instruction hierarchy and shared skill configuration.
 *
 * Native behavior is verified separately; this check does not start model calls.
 * Usage: pnpm nx run scripts:validate-agent-config
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const excludedTrees = ['repos', 'worktrees', '.worktrees', '.claude/worktrees', '.codex/worktrees'];
const templateDirectories = [
  '.agents/skills/create-repo/templates',
  'tools/workspace-plugin/src/generators/package/files',
  'tools/workspace-plugin/src/generators/instruction-files',
];
const markdown = unified().use(remarkParse);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const repoPath = (root: string, path: string): string => relative(root, path).split(sep).join('/');

const inTree = (path: string, directory: string): boolean => path.startsWith(`${directory}/`);
const authoredFiles = (root: string): string[] =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter((path) => path && !excludedTrees.some((directory) => inTree(path, directory)))
    .map((path) => resolve(root, path))
    .filter(
      (path) => existsSync(path) && (lstatSync(path).isFile() || ['AGENTS.md', 'CLAUDE.md'].includes(basename(path))),
    )
    .sort();

const frontmatter = (text: string): Record<string, unknown> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
  if (!match?.[1]) {
    throw new Error('missing YAML frontmatter');
  }
  const parsed: unknown = loadYaml(match[1]);
  if (!record(parsed)) {
    throw new Error('frontmatter must be a mapping');
  }
  return parsed;
};

const markdownLinks = (text: string): string[] => {
  const links: string[] = [];
  const visit = (node: unknown): void => {
    if (!record(node)) {
      return;
    }
    if (['link', 'image', 'definition'].includes(String(node['type'])) && typeof node['url'] === 'string') {
      links.push(node['url']);
    }
    if (Array.isArray(node['children'])) {
      for (const child of node['children']) {
        visit(child);
      }
    }
  };
  visit(markdown.parse(text));
  return links;
};

type AgentConfigResult = {
  readonly issues: readonly string[];
  readonly boundaries: number;
  readonly skills: number;
  readonly maximumChainBytes: number;
};

const invocationAllowed = (path: string, report: (path: string, detail: string) => void): boolean => {
  const text = readFileSync(path, 'utf8');
  const data = frontmatter(text);
  if (
    data['name'] !== basename(dirname(path)) ||
    typeof data['description'] !== 'string' ||
    !data['description'].trim()
  ) {
    report(path, 'name must match its folder and description must identify its task');
  }
  const disabled = data['disable-model-invocation'];
  if (disabled !== undefined && typeof disabled !== 'boolean') {
    report(path, 'disable-model-invocation must be a boolean');
  }
  const nativePath = resolve(dirname(path), 'agents/openai.yaml');
  let implicit: unknown = true;
  if (existsSync(nativePath)) {
    const native: unknown = loadYaml(readFileSync(nativePath, 'utf8'));
    if (!record(native) || (native['policy'] !== undefined && !record(native['policy']))) {
      report(nativePath, 'native skill metadata and policy must be mappings');
    } else if (record(native['policy'])) {
      implicit = native['policy']['allow_implicit_invocation'] ?? true;
    }
  }
  if (typeof implicit !== 'boolean' || implicit === (disabled === true)) {
    report(path, 'Claude and Codex invocation intent differs');
  }
  if (disabled === true && !/^## Manual initiation\r?\n\s*\S/mu.test(text)) {
    report(path, 'manual-only exception needs its deliberate user requirement under ## Manual initiation');
  }
  if (
    disabled !== true &&
    /Use only when (?:explicitly invoked|invoked as|a maintainer)/u.test(String(data['description']))
  ) {
    report(path, 'enabled skill description still requires a manual command');
  }
  return disabled !== true;
};

const validateBoundary = (path: string, root: string, report: (path: string, detail: string) => void): number => {
  if (!lstatSync(path).isFile()) {
    report(path, 'canonical instructions must be a regular authored file');
    return 0;
  }
  const text = readFileSync(path, 'utf8');
  const fileBytes = Buffer.byteLength(text);
  const limit = dirname(path) === root ? 8192 : 4096;
  if (fileBytes > limit) {
    report(path, `${fileBytes} bytes exceeds the ${limit}-byte instruction budget`);
  }
  const adapter = resolve(dirname(path), 'CLAUDE.md');
  if (!existsSync(adapter) || !lstatSync(adapter).isFile() || readFileSync(adapter, 'utf8') !== '@AGENTS.md\n') {
    report(adapter, 'expected only @AGENTS.md and a newline');
  }
  let chainBytes = existsSync(resolve(root, 'AGENTS.md')) ? readFileSync(resolve(root, 'AGENTS.md')).length : 0;
  for (let directory = dirname(path); directory !== root; directory = dirname(directory)) {
    const ancestor = resolve(directory, 'AGENTS.md');
    if (existsSync(ancestor)) {
      chainBytes += readFileSync(ancestor).length;
    }
  }
  if (chainBytes > 16_384) {
    report(path, `${chainBytes} bytes exceeds the 16384-byte ancestor-chain budget`);
  }
  for (const section of text
    .split(/^## /mu)
    .filter((part) => /^Learned (?:User Preferences|Workspace Facts)/u.test(part))) {
    const bullets = section.split('\n').filter((line) => line.startsWith('- '));
    if (bullets.length > 12 || bullets.some((line) => [...line].length - 2 > 200)) {
      report(path, 'learned sections permit at most 12 bullets of 200 characters each');
    }
  }
  return chainBytes;
};

const hasSharedSkillAlias = (root: string): boolean => {
  const alias = resolve(root, '.claude/skills');
  return (
    existsSync(alias) &&
    lstatSync(alias).isSymbolicLink() &&
    readlinkSync(alias) === '../.agents/skills' &&
    realpathSync(alias) === realpathSync(resolve(root, '.agents/skills'))
  );
};

/** Check an authored Git worktree or disposable Git fixture without changing it. */
export const validateAgentConfig = (root: string): AgentConfigResult => {
  const issues: string[] = [];
  const authored = authoredFiles(root);
  const templates = authored.filter((path) =>
    templateDirectories.some((directory) => inTree(repoPath(root, path), directory)),
  );
  const files = authored.filter((path) => !templates.includes(path));
  const boundaries = files.filter((path) => basename(path) === 'AGENTS.md');
  const skills = files.filter((path) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/u.test(repoPath(root, path)));
  const skillPolicies = new Map<string, boolean>();
  const report = (path: string, detail: string): void => {
    issues.push(`${repoPath(root, path)}: ${detail}`);
  };

  for (const path of templates) {
    if (basename(path) === 'SKILL.md' && repoPath(root, path).startsWith('.agents/skills/')) {
      report(path, 'raw skill template is discoverable; use a template suffix until rendering');
    }
  }

  if (!boundaries.includes(resolve(root, 'AGENTS.md'))) {
    issues.push('AGENTS.md: missing root instructions');
  }
  if (existsSync(resolve(root, '.cursor'))) {
    issues.push('.cursor: retired development harness is still present');
  }
  if (!hasSharedSkillAlias(root)) {
    issues.push('.claude/skills: expected the shared ../.agents/skills symlink');
  }

  let maximumChainBytes = 0;
  for (const path of boundaries) {
    maximumChainBytes = Math.max(maximumChainBytes, validateBoundary(path, root, report));
  }

  for (const path of files.filter((file) => basename(file) === 'CLAUDE.md')) {
    if (!existsSync(resolve(dirname(path), 'AGENTS.md'))) {
      report(path, 'orphan import adapter has no canonical AGENTS.md');
    }
  }

  for (const path of skills) {
    try {
      skillPolicies.set(path, invocationAllowed(path, report));
    } catch (error) {
      report(path, error instanceof Error ? error.message : String(error));
    }
  }

  for (const path of [...boundaries, ...skills]) {
    for (const link of markdownLinks(readFileSync(path, 'utf8'))) {
      if (link.startsWith('#') || /^[a-z][a-z\d+.-]*:/iu.test(link)) {
        continue;
      }
      const target = resolve(dirname(path), decodeURIComponent(link.split('#')[0] ?? ''));
      const local = repoPath(root, target);
      const absentOptionalDocs = ['docs/research', 'docs/reference'].some(
        (prefix) => local.startsWith(`${prefix}/`) && !existsSync(resolve(root, prefix)),
      );
      if (!existsSync(target) && !absentOptionalDocs && !local.startsWith('repos/')) {
        report(path, `broken local link: ${link}`);
      }
      if (skillPolicies.get(path) && skillPolicies.get(target) === false) {
        report(path, `model-composed skill link targets a manual-only helper: ${link}`);
      }
    }
  }

  const operative = files.filter((path) => {
    const local = repoPath(root, path);
    return (
      ['AGENTS.md', 'DESIGN.md', 'package.json', 'nx.json', '.gitignore', '.oxfmtrc.json'].includes(local) ||
      (/^(?:\.agents\/|\.claude\/|\.codex\/|\.github\/|scripts\/|tools\/|docs\/policy\/)/u.test(local) &&
        /\.(?:md|json|jsonc|toml|ya?ml|[cm]?[jt]s|sh|py)$/u.test(local) &&
        !/\.(?:test|spec)\.[cm]?[jt]s$/u.test(local) &&
        local !== 'scripts/src/validate-agent-config.ts')
    );
  });
  for (const path of operative) {
    const text = readFileSync(path, 'utf8');
    if (/\.cursor\/|cursor-ide-browser|\bSwitchMode\b|configure-ai-agents|nx configuration start/u.test(text)) {
      report(path, 'operative reference to retired Cursor/Nx agent provisioning');
    }
  }
  return { issues, boundaries: boundaries.length, skills: skills.length, maximumChainBytes };
};

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  try {
    const result = validateAgentConfig(resolve(import.meta.dirname, '../..'));
    if (result.issues.length > 0) {
      throw new Error(result.issues.join('\n'));
    }
    console.log(
      `✓ ${result.boundaries} instruction boundaries, ${result.skills} skills; largest chain ${result.maximumChainBytes} bytes`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
