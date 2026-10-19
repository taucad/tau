import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  codexDefaultPrompts,
  codexLongDescription,
  codexShortDescription,
  packageDescription,
  pluginDescription,
  pluginKeywords,
} from '#descriptions.js';

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
  'cad-build123d',
  'cad-jscad',
  'cad-manifold',
  'cad-openscad',
  'cad-picogk',
  'cad-picovoxel',
  'cad-replicad',
  'cad-smlib',
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

  it("should release with the CLI's version and engines, which the launcher's installed and npx rungs need", () => {
    const cli = readJson('../cli/package.json');
    const engines = { node: '>=24.0.0', npm: '>=11.0.0' };
    expect(version).toBe(cli['version']);
    expect(readJson('package.json')['engines']).toEqual(engines);
    expect(cli['engines']).toEqual(engines);
  });

  it('should point each host at its own MCP config, and Codex at the skills and the onboarding skill', () => {
    expect(readJson('.codex-plugin/plugin.json')).toMatchObject({
      skills: './skills/',
      mcpServers: './mcp/codex.json',
      extensions: { 'com.openai': { onboardingSkill: 'tau' } },
    });
    expect(readJson('.claude-plugin/plugin.json')).toMatchObject({ mcpServers: './mcp/claude.json' });
  });

  it('should carry the description texts from their one source in every manifest and package.json', () => {
    const listing = { description: pluginDescription, keywords: pluginKeywords };

    expect(readJson('.claude-plugin/plugin.json')).toMatchObject(listing);
    expect(readJson('.codex-plugin/plugin.json')).toMatchObject({
      ...listing,
      interface: {
        shortDescription: codexShortDescription,
        longDescription: codexLongDescription,
        defaultPrompt: codexDefaultPrompts,
      },
    });
    expect(readJson('.claude-plugin/marketplace.json')).toMatchObject({
      plugins: [{ name: 'tau', description: pluginDescription }],
    });
    expect(readJson('package.json')).toMatchObject({ description: packageDescription });
    expect(codexShortDescription.length).toBeLessThanOrEqual(30);
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

    /* eslint-disable @typescript-eslint/naming-convention -- Codex config keys keep their wire spelling */
    expect(tau).toMatchObject({
      command: 'node',
      cwd: '.',
      env_vars: [
        'TAU_CLI',
        'TAU_HOST_MACHINES',
        'TAU_ACQUISITION',
        'TAU_PAYLOAD_MIRROR',
        'TAU_PAYLOAD_MIRROR_NO_FALLBACK',
        'TAU_PAYLOAD_DIR',
        'TAU_CONFIG_DIR',
        'TAU_PAYLOAD_TARGET',
        'TAU_PAYLOAD_EMULATION',
        'HTTP_PROXY',
        'HTTPS_PROXY',
        'NO_PROXY',
        'http_proxy',
        'https_proxy',
        'no_proxy',
        'SSL_CERT_FILE',
        'SSL_CERT_DIR',
        'NODE_EXTRA_CA_CERTS',
        'NODE_USE_SYSTEM_CA',
      ],
      omit_tools_from: ['deferred'],
    });
    /* eslint-enable @typescript-eslint/naming-convention -- Back to camelCase after the Codex keys */
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
  it('should pack the manifests, MCP configs, launcher, doctor and skills, and nothing from the workspace', async () => {
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
        'dist/doctor-probe.mjs',
        'dist/doctor.mjs',
        'dist/index.mjs',
        'dist/launch.mjs',
        'dist/preflight.mjs',
        'dist/resolve-tau-cli.mjs',
        'mcp/claude.json',
        'mcp/codex.json',
        'package.json',
        ...skillSlugs.map((slug) => `skills/${slug}/SKILL.md`),
      ]),
    );
    expect(paths.filter((path) => /^(?:\.dev|node_modules|scripts|src)\//u.test(path))).toEqual([]);
  }, 180_000);
});
