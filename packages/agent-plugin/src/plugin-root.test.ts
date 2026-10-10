import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

/** The package folder, which is the plugin root both hosts load. The test target builds it first. */
const root = fileURLToPath(new URL('..', import.meta.url));

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;

const { version } = readJson('package.json');

type McpConfig = {
  readonly mcpServers: Readonly<Record<string, { readonly args: readonly string[]; readonly cwd?: string }>>;
};

/** Every bundle `nx build agent-plugin` installs, beside the committed onboarding skill `tau`. */
const skillSlugs = [
  'cad-jscad',
  'cad-manifold',
  'cad-openscad',
  'cad-picovoxel',
  'cad-replicad',
  'cad-tscircuit',
  'geospec-authoring',
  'tau',
  'workbench',
];

describe('plugin manifests', () => {
  it('should name the plugin tau and carry the package version in both host manifests', () => {
    expect(readJson('.codex-plugin/plugin.json')).toMatchObject({ name: 'tau', version });
    expect(readJson('.claude-plugin/plugin.json')).toMatchObject({ name: 'tau', version });
  });

  it('should point each host at its own MCP config, and Codex at the skills and the onboarding skill', () => {
    expect(readJson('.codex-plugin/plugin.json')).toMatchObject({
      skills: './skills/',
      mcpServers: './mcp/codex.json',
      extensions: { 'com.openai': { onboardingSkill: 'tau' } },
    });
    expect(readJson('.claude-plugin/plugin.json')).toMatchObject({ mcpServers: './mcp/claude.json' });
  });

  it('should list this folder as the tau plugin of the tau-dev marketplace', () => {
    expect(readJson('.claude-plugin/marketplace.json')).toMatchObject({
      name: 'tau-dev',
      plugins: [{ name: 'tau', source: './' }],
    });
  });
});

describe('MCP configs', () => {
  it('should start the built launcher from the Claude config through CLAUDE_PLUGIN_ROOT', () => {
    const { mcpServers } = readJson('mcp/claude.json') as McpConfig;
    const launcher = mcpServers['tau']?.args[0]?.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//u, '');

    expect(launcher).toBe('dist/launch.mjs');
    expect(existsSync(join(root, launcher!))).toBe(true);
  });

  it('should start the built launcher from the Codex config relative to its plugin-root cwd', () => {
    const { mcpServers } = readJson('mcp/codex.json') as McpConfig;
    const { tau } = mcpServers;

    // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex config keys keep their wire spelling
    expect(tau).toMatchObject({ command: 'node', cwd: '.', env_vars: ['TAU_CLI'], omit_tools_from: ['deferred'] });
    expect(existsSync(join(root, tau!.cwd!, tau!.args[0]!))).toBe(true);
  });
});

describe('skills', () => {
  it('should hold the onboarding skill and one bundle per kernel owner after a build', () => {
    expect(readdirSync(join(root, 'skills')).toSorted()).toEqual(skillSlugs);
  });

  it('should name every skill after its folder', () => {
    for (const slug of skillSlugs) {
      const skill = readFileSync(join(root, 'skills', slug, 'SKILL.md'), 'utf8');

      expect(skill).toMatch(new RegExp(`^---\\nname: ${slug}\\ndescription: \\S`, 'u'));
    }
  });
});

describe('attribution', () => {
  it('should carry the repository NOTICE unchanged, since the kernel skills are derived from upstream APIs', () => {
    expect(readFileSync(join(root, 'NOTICE'), 'utf8')).toBe(readFileSync(join(root, '../../NOTICE'), 'utf8'));
  });
});

describe('published package', () => {
  it('should pack the manifests, MCP configs, launcher and skills, and nothing from the workspace', async () => {
    const { stdout } = await promisify(execFile)('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: root,
    });
    const [pack] = JSON.parse(stdout) as [{ readonly files: ReadonlyArray<{ readonly path: string }> }];
    const paths = pack.files.map((file) => file.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        '.claude-plugin/marketplace.json',
        '.claude-plugin/plugin.json',
        '.codex-plugin/plugin.json',
        'CHANGELOG.md',
        'LICENSE',
        'NOTICE',
        'README.md',
        'dist/index.mjs',
        'dist/launch.mjs',
        'mcp/claude.json',
        'mcp/codex.json',
        'package.json',
        ...skillSlugs.map((slug) => `skills/${slug}/SKILL.md`),
      ]),
    );
    expect(paths.filter((path) => /^(?:\.dev|node_modules|scripts|src)\//u.test(path))).toEqual([]);
  }, 180_000);
});
