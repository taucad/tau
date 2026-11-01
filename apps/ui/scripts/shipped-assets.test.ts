// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withVerbatimAssetsAside } from '#scripts/with-verbatim-assets-aside.mts';
import { verifyShippedAssets } from '#scripts/verify-shipped-assets.mts';

const workspace = resolve(import.meta.dirname, '../../..');
const fixtureRoot = resolve(import.meta.dirname, '../node_modules/.cache');
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
}, 60_000);

const integrityOf = (bytes: string): string => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
// What Sentry's debug-ID injection appends to every JavaScript file it is pointed at.
const sentrySnippet =
  '\n!function(){try{var e="undefined"!=typeof window?window:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="15a4b4b7-c6ad-5103-b1a8-53c4809aa1d6")}catch(e){}}();\n//# debugId=15a4b4b7-c6ad-5103-b1a8-53c4809aa1d6\n';

// Files a UI build writes: compiled chunks with hidden source maps, and runtimes copied verbatim.
// `some-future-kernel/` stands for any runtime added later: nothing names it in the deploy commands.
const compiled = {
  'assets/app-a1b2c3d4.js': 'export const app = 3;\n//# sourceMappingURL=app-a1b2c3d4.js.map\n',
  'assets/worker-b1c2d3e4.js': 'self.postMessage(1);\n//# sourceMappingURL=worker-b1c2d3e4.js.map\n',
};
const verbatim = {
  'picogk-browser/0123/_framework/dotnet.js': 'export const dotnet = 1;\n',
  'csharp-language/4567/_framework/dotnet.native.abc.js': 'export const native = 2;\n',
  // The .NET runtime names a source map it also ships, so injectors that follow the comment pair it.
  'csharp-language/4567/_framework/dotnet.runtime.def.js':
    'export const runtime = 5;\n//# sourceMappingURL=dotnet.runtime.js.map\n',
  'some-future-kernel/glue.mjs': 'export const glue = 4;\n',
  'assets/kernel-c1d2e3f4.wasm': '\0asm\u0001\0\0\0',
  '.vite/manifest.json': '{}\n',
};

const createClient = async (): Promise<string> => {
  await mkdir(fixtureRoot, { recursive: true });
  const root = await mkdtemp(join(fixtureRoot, 'tau-shipped-assets-'));
  directories.push(root);
  const client = join(root, 'build', 'client');
  const write = async (path: string, contents: string): Promise<void> => {
    await mkdir(dirname(join(client, path)), { recursive: true });
    await writeFile(join(client, path), contents);
  };
  await Promise.all([
    ...Object.entries({ ...compiled, ...verbatim }).map(async ([path, contents]) => write(path, contents)),
    ...[...Object.keys(compiled), 'csharp-language/4567/_framework/dotnet.runtime.js'].map(async (path) =>
      write(`${path}.map`, JSON.stringify({ version: 3, sources: ['a.ts'], names: [], mappings: 'AAAA' })),
    ),
  ]);
  const assets = Object.entries({ ...compiled, ...verbatim })
    .map(([path, contents]) => ({
      path,
      bytes: Buffer.byteLength(contents),
      integrity: integrityOf(contents),
      ...(path in compiled ? { sourceMap: true } : {}),
    }))
    .toSorted((left, right) => left.path.localeCompare(right.path));
  await write(
    'tau-asset-receipt.json',
    `${JSON.stringify({ schema: 'tau-ui-asset-receipt-v1', algorithm: 'sha384', assets }, undefined, 2)}\n`,
  );
  return client;
};

describe('files the UI build ships', () => {
  it('should accept a build whose verbatim files still match its receipt', async () => {
    const client = await createClient();
    await expect(verifyShippedAssets(client)).resolves.toEqual({ checked: 6, problems: [] });
  });

  it('should allow compiled chunks to change and name every verbatim file that did', async () => {
    const client = await createClient();
    await appendFile(join(client, 'assets/app-a1b2c3d4.js'), sentrySnippet);
    await appendFile(join(client, 'picogk-browser/0123/_framework/dotnet.js'), sentrySnippet);
    await appendFile(join(client, 'some-future-kernel/glue.mjs'), sentrySnippet);
    const { problems } = await verifyShippedAssets(client);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/^picogk-browser\/0123\/_framework\/dotnet\.js: \d+ bytes with sha384-/u);
    expect(problems[1]).toMatch(/^some-future-kernel\/glue\.mjs: \d+ bytes with sha384-/u);
  });

  it('should refuse a missing verbatim file or receipt, but not a removed Vite manifest', async () => {
    const client = await createClient();
    await rm(join(client, '.vite'), { recursive: true });
    await expect(verifyShippedAssets(client)).resolves.toEqual({ checked: 6, problems: [] });
    await rm(join(client, 'assets/kernel-c1d2e3f4.wasm'));
    await expect(verifyShippedAssets(client)).resolves.toEqual({
      checked: 6,
      problems: ['assets/kernel-c1d2e3f4.wasm: missing'],
    });
    await rm(join(client, 'tau-asset-receipt.json'));
    await expect(verifyShippedAssets(client)).resolves.toEqual({
      checked: 0,
      problems: ['tau-asset-receipt.json: missing, so nothing the build copied verbatim can be checked'],
    });
  });

  it('should hide every verbatim file from a command that rewrites JavaScript, then put it back', async () => {
    const client = await createClient();
    // Stands in for any injector: append to every JavaScript file it can see, as PostHog and Sentry do.
    const injector = join(dirname(client), 'inject-everything.mjs');
    await writeFile(
      injector,
      [
        "import { appendFileSync, readdirSync } from 'node:fs';",
        "import { join } from 'node:path';",
        'const [client] = process.argv.slice(2);',
        'for (const file of readdirSync(client, { recursive: true })) {',
        String.raw`  if (/\.[cm]?js$/u.test(file)) appendFileSync(join(client, file), '//injected');`,
        '}',
      ].join('\n'),
    );
    const rewriteAll = `node ${injector} ${client}`;
    await expect(withVerbatimAssetsAside(client, rewriteAll)).resolves.toBe(0);
    await expect(verifyShippedAssets(client)).resolves.toEqual({ checked: 6, problems: [] });
    await expect(readFile(join(client, 'assets/app-a1b2c3d4.js'), 'utf8')).resolves.toContain('//injected');
  });

  it('should put verbatim files back and pass on the status when the command fails', async () => {
    const client = await createClient();
    await expect(withVerbatimAssetsAside(client, 'exit 3')).resolves.toBe(3);
    await expect(verifyShippedAssets(client)).resolves.toEqual({ checked: 6, problems: [] });
  });

  it('should run every client-side injector in the deploy source-map target with verbatim files aside', async () => {
    // Before this, PostHog and Sentry each appended a snippet to runtime files the build copied verbatim, and the
    // PicoGK and C# hosts refused them ("PicoGK runtime resource integrity mismatch").
    const project = JSON.parse(await readFile(join(workspace, 'apps/ui/project.json'), 'utf8')) as {
      targets: { sourcemaps: { options: { commands: string[] } } };
    };
    const commands = project.targets.sourcemaps.options.commands.filter(
      (command) => command.includes('{projectRoot}/build/client') && /\binject\b/u.test(command),
    );
    expect(commands.some((command) => command.includes('posthog'))).toBe(true);
    expect(commands.some((command) => command.includes('sentry-cli'))).toBe(true);
    for (const command of commands) {
      expect(command).toMatch(
        /^node apps\/ui\/scripts\/with-verbatim-assets-aside\.mts \{projectRoot\}\/build\/client '/u,
      );
    }
  });

  it('should add Sentry debug ids to compiled chunks only, through the deploy command', async () => {
    const project = JSON.parse(await readFile(join(workspace, 'apps/ui/project.json'), 'utf8')) as {
      targets: { sourcemaps: { options: { commands: string[] } } };
    };
    const inject = project.targets.sourcemaps.options.commands.find(
      (command) => command.includes('{projectRoot}/build/client') && /\binject\b/u.test(command),
    );
    // Run the declared command without PostHog, which needs its API; the Sentry injection runs offline.
    const sentryOnly = inject!.replace(/npx -y @posthog\/cli sourcemap inject [^&']*&& /u, '');
    expect(sentryOnly).not.toContain('posthog');
    const client = await createClient();
    const projectRoot = dirname(dirname(client));
    execFileSync('sh', ['-c', sentryOnly.replaceAll('{projectRoot}', projectRoot)], { cwd: workspace, stdio: 'pipe' });
    await expect(verifyShippedAssets(client)).resolves.toEqual({ checked: 6, problems: [] });
    const chunks = await Promise.all(Object.keys(compiled).map(async (path) => readFile(join(client, path), 'utf8')));
    for (const chunk of chunks) {
      expect(chunk).toContain('debugId=');
    }
  }, 60_000);

  it('should verify the shipped files in every deploy build after source maps are injected', async () => {
    const toml = await readFile(join(workspace, 'apps/ui/netlify.toml'), 'utf8');
    const commands = [...toml.matchAll(/^command = "(.*)"$/gmu)]
      .map((match) => match[1]!)
      .filter((command) => command.includes('ui:sourcemaps'));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      const verify = command.indexOf('node scripts/verify-shipped-assets.mts build/client');
      expect(verify).toBeGreaterThan(command.indexOf('ui:sourcemaps'));
    }
  });
});
