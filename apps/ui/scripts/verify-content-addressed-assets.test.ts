// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyContentAddressedAssets } from '#scripts/verify-content-addressed-assets.mts';

const workspace = resolve(import.meta.dirname, '../../..');
const fixtureRoot = resolve(import.meta.dirname, '../node_modules/.cache');
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true })));
}, 60_000);

const sha256 = (bytes: string): string => createHash('sha256').update(bytes).digest('hex');
// What Sentry's debug-ID injection appends to every JavaScript file it is pointed at.
const sentrySnippet =
  '\n!function(){try{var e="undefined"!=typeof window?window:{},n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="15a4b4b7-c6ad-5103-b1a8-53c4809aa1d6")}catch(e){}}();\n//# debugId=15a4b4b7-c6ad-5103-b1a8-53c4809aa1d6\n';

/** Write one content-addressed tree the way the UI build emits it, and return its directory. */
const writeTree = async (
  client: string,
  kind: 'picogk-browser' | 'csharp-language',
  files: Readonly<Record<string, string>>,
): Promise<string> => {
  const entries = Object.entries(files).map(([path, contents]) => ({
    path,
    sha256: sha256(contents),
    byteLength: Buffer.byteLength(contents),
  }));
  const manifest =
    kind === 'picogk-browser'
      ? {
          format: 'tau-picogk-browser-v2',
          single: { bootstrap: '_framework/dotnet.js', runtimeFiles: entries, references: [] },
        }
      : { format: 'tau-csharp-language-v1', bootstrap: '_framework/dotnet.js', files: entries };
  const bytes = `${JSON.stringify(manifest)}\n`;
  const directory = join(client, kind, sha256(bytes));
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await writeFile(join(directory, path), contents);
    }),
  );
  await writeFile(join(directory, 'assets-manifest.json'), bytes);
  return directory;
};

const createClient = async (): Promise<{ client: string; picogk: string; csharp: string }> => {
  await mkdir(fixtureRoot, { recursive: true });
  const root = await mkdtemp(join(fixtureRoot, 'tau-content-addressed-'));
  directories.push(root);
  const client = join(root, 'build', 'client');
  const runtime = {
    '_framework/dotnet.js': 'export const dotnet = 1;\n',
    '_framework/dotnet.native.abc.js': 'export const native = 2;\n',
    '_framework/dotnet.native.wasm': '\0asm\u0001\0\0\0',
  };
  const picogk = await writeTree(client, 'picogk-browser', runtime);
  const csharp = await writeTree(client, 'csharp-language', runtime);
  // An ordinary app chunk with a source map: the files debug-ID injection is for.
  await mkdir(join(client, 'assets'), { recursive: true });
  await writeFile(
    join(client, 'assets', 'app-a1b2c3d4.js'),
    'export const app = 3;\n//# sourceMappingURL=app-a1b2c3d4.js.map\n',
  );
  await writeFile(
    join(client, 'assets', 'app-a1b2c3d4.js.map'),
    JSON.stringify({ version: 3, sources: ['app.ts'], names: [], mappings: 'AAAA' }),
  );
  return { client, picogk, csharp };
};

describe('content-addressed browser runtimes in a built client', () => {
  it('should accept trees whose files still match their manifests', async () => {
    const { client } = await createClient();
    await expect(verifyContentAddressedAssets(client)).resolves.toEqual({
      trees: 2,
      problems: [],
    });
  });

  it('should name each file that changed after the manifest was written', async () => {
    const { client, picogk, csharp } = await createClient();
    await appendFile(join(picogk, '_framework/dotnet.js'), sentrySnippet);
    await appendFile(join(csharp, '_framework/dotnet.native.abc.js'), sentrySnippet);
    const { problems } = await verifyContentAddressedAssets(client);
    expect(problems).toEqual([
      expect.stringContaining('csharp-language/') as string,
      expect.stringContaining('picogk-browser/') as string,
    ]);
    expect(problems[0]).toContain('_framework/dotnet.native.abc.js');
    expect(problems[1]).toContain('_framework/dotnet.js');
  });

  it('should refuse a manifest that no longer hashes to its directory name, or a missing file', async () => {
    const { client, picogk, csharp } = await createClient();
    await appendFile(join(picogk, 'assets-manifest.json'), ' ');
    await rm(join(csharp, '_framework/dotnet.native.wasm'));
    const { problems } = await verifyContentAddressedAssets(client);
    expect(problems.join('\n')).toMatch(/csharp-language\/.*dotnet\.native\.wasm/u);
    expect(problems.join('\n')).toMatch(/picogk-browser\/.*assets-manifest\.json/u);
  });

  it('should leave both runtimes byte-identical through the deploy source-map injection', async () => {
    // The production build runs `ui:sourcemaps` after `ui:build`. Run its own client-side Sentry
    // injection command against the fixture: any JavaScript it rewrites under a runtime tree is a
    // file the browser then refuses with "PicoGK runtime resource integrity mismatch".
    const project = JSON.parse(await readFile(join(workspace, 'apps/ui/project.json'), 'utf8')) as {
      targets: { sourcemaps: { options: { commands: string[] } } };
    };
    const inject = project.targets.sourcemaps.options.commands.filter(
      (command) => command.includes('sentry-cli sourcemaps inject') && command.includes('{projectRoot}/build/client'),
    );
    expect(inject).toHaveLength(1);
    const { client, picogk } = await createClient();
    const projectRoot = dirname(dirname(client));
    execFileSync('sh', ['-c', inject[0]!.replaceAll('{projectRoot}', projectRoot)], { cwd: workspace, stdio: 'pipe' });
    await expect(verifyContentAddressedAssets(client)).resolves.toEqual({ trees: 2, problems: [] });
    // The injection still runs: the ordinary chunk gained its debug id.
    expect(await readFile(join(client, 'assets', 'app-a1b2c3d4.js'), 'utf8')).toContain('debugId=');
    expect(await readFile(join(picogk, '_framework/dotnet.js'), 'utf8')).not.toContain('debugId=');
  }, 60_000);

  it('should verify the runtimes in every deploy build after source maps are injected', async () => {
    const toml = await readFile(join(workspace, 'apps/ui/netlify.toml'), 'utf8');
    const commands = [...toml.matchAll(/^command = "(.*)"$/gmu)]
      .map((match) => match[1]!)
      .filter((command) => command.includes('ui:sourcemaps'));
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      const sourcemaps = command.indexOf('ui:sourcemaps');
      const verify = command.indexOf('node scripts/verify-content-addressed-assets.mts build/client');
      expect(verify).toBeGreaterThan(sourcemaps);
    }
  });
});
