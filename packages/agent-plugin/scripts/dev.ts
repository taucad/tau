/**
 * Local testing of the Tau plugin from a workspace checkout, in Claude Code, Codex and Claude Desktop.
 *
 * `pnpm plugin:dev <command>` from the repository root, after `pnpm nx run agent-plugin:build`:
 *
 * - `install [--host claude|codex|all]` adds this folder's own catalog (`tau-dev`) to each host and installs `tau`
 *   from it. Claude Code reads the folder in place; Codex copies it. Both run this checkout's CLI through
 *   `.dev/cli.json`.
 * - `uninstall [--host …]` removes the plugin and the catalog again.
 * - `desktop --project <folder>` adds a `tau-dev` server to Claude Desktop's `claude_desktop_config.json`, keeping a
 *   backup; `desktop --remove` takes it out.
 * - `preview --sha <commit>` installs a pkg.pr.new preview into Claude Code: the plugin from a scratch catalog and the
 *   CLI with npm, so nothing reads the checkout.
 * - `doctor [--smoke] [--project <folder>]` starts the launcher as each host would and checks the server answers,
 *   lists the expected tools and serves the viewer page; `--smoke` also builds, tests, screenshots and shows a block.
 *
 * @module
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The plugin folder: `packages/agent-plugin`. */
export const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The catalog name in `.claude-plugin/marketplace.json` of this folder. */
export const devMarketplace = 'tau-dev';

/** The server name `desktop` writes, so it never replaces an installed `tau` entry. */
export const desktopServerName = 'tau-dev';

/** The tools every host gets from `tau mcp`. */
export const expectedTools = [
  'evaluate_model',
  'test_model',
  'screenshot',
  'export_model',
  'arrange_workbench',
  'get_parameters',
  'apply_parameter_operation',
  'show_model',
  'view_state',
] as const;

/** Files a build leaves in the plugin folder; without them a host loads a plugin that starts nothing. */
export const builtFiles = ['dist/launch.mjs', 'dist-app/app.html', 'skills/tau/SKILL.md', '.dev/cli.json'] as const;

type Host = 'claude' | 'codex';

/**
 * Claude Desktop's config file for a platform.
 *
 * @param platform - `process.platform`.
 * @param home - The home directory.
 * @param env - The environment, for `APPDATA` on Windows.
 * @returns The absolute path of `claude_desktop_config.json`.
 */
export const desktopConfigPath = (
  platform: string,
  home: string,
  env: Readonly<Record<string, string | undefined>>,
): string => {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (platform === 'win32') {
    return join(env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return join(home, '.config', 'Claude', 'claude_desktop_config.json');
};

/**
 * A Claude Desktop config with the `tau-dev` server set, or removed when `server` is undefined.
 *
 * @param config - The parsed config, or undefined when the file does not exist.
 * @param server - The server entry to set.
 * @returns The new config; other servers and settings are kept.
 */
export const withDesktopServer = (
  config: Readonly<Record<string, unknown>> | undefined,
  server: { readonly command: string; readonly args: readonly string[] } | undefined,
): Record<string, unknown> => {
  const servers = Object.fromEntries(
    Object.entries((config?.['mcpServers'] as Record<string, unknown> | undefined) ?? {}).filter(
      ([name]) => name !== desktopServerName,
    ),
  );
  if (server !== undefined) {
    servers[desktopServerName] = { command: server.command, args: [...server.args] };
  }
  return { ...config, mcpServers: servers };
};

/**
 * The pkg.pr.new tarball URL of a workspace package at a commit.
 *
 * @param name - The package name, such as `@taucad/cli`.
 * @param sha - The commit pkg.pr.new published.
 * @returns The URL npm and Claude Code install from.
 */
export const previewUrl = (name: string, sha: string): string => `https://pkg.pr.new/taucad/tau/${name}@${sha}`;

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const fail = (line: string): never => {
  process.stderr.write(`plugin:dev: ${line}\n`);
  process.exit(1);
};

const run = (command: string, args: readonly string[], options: { readonly allowFailure?: boolean } = {}): number => {
  log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  const status = result.status ?? 1;
  if (status !== 0 && options.allowFailure !== true) {
    fail(`${command} exited with ${String(status)}`);
  }
  return status;
};

const available = (command: string): boolean =>
  spawnSync(command, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0;

const hostsOf = (value: string | undefined): Host[] => {
  if (value === undefined || value === 'all') {
    return ['claude', 'codex'];
  }
  if (value === 'claude' || value === 'codex') {
    return [value];
  }
  return fail(`--host takes claude, codex or all, not ${value}`);
};

const requireBuild = (): void => {
  const missing = builtFiles.filter((file) => !existsSync(join(pluginRoot, file)));
  if (missing.length > 0) {
    fail(`the plugin folder is not built (missing ${missing.join(', ')}); run: pnpm nx run agent-plugin:build`);
  }
};

const install = (hosts: readonly Host[]): void => {
  requireBuild();
  for (const host of hosts) {
    if (!available(host)) {
      log(`skip ${host}: no \`${host}\` on PATH`);
      continue;
    }
    if (host === 'claude') {
      run('claude', ['plugin', 'marketplace', 'add', pluginRoot]);
      run('claude', ['plugin', 'install', `tau@${devMarketplace}`]);
      log('Claude Code reads this folder in place: start a new session, or /reload-plugins, after a rebuild.');
    } else {
      run('codex', ['plugin', 'marketplace', 'add', pluginRoot]);
      run('codex', ['plugin', 'add', `tau@${devMarketplace}`]);
      log('Codex installed a copy: run this again after a rebuild, then start a new thread.');
    }
  }
};

const uninstall = (hosts: readonly Host[]): void => {
  for (const host of hosts) {
    if (!available(host)) {
      continue;
    }
    if (host === 'claude') {
      run('claude', ['plugin', 'uninstall', `tau@${devMarketplace}`], { allowFailure: true });
      run('claude', ['plugin', 'marketplace', 'remove', devMarketplace], { allowFailure: true });
    } else {
      run('codex', ['plugin', 'remove', `tau@${devMarketplace}`], { allowFailure: true });
      run('codex', ['plugin', 'marketplace', 'remove', devMarketplace], { allowFailure: true });
    }
  }
};

const desktop = (project: string | undefined, remove: boolean): void => {
  const path = desktopConfigPath(process.platform, homedir(), process.env);
  const existing = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>) : undefined;
  if (!remove) {
    requireBuild();
    if (project === undefined) {
      fail('desktop needs --project <folder>: Claude Desktop starts servers in no project folder');
    }
  }
  if (existing !== undefined) {
    copyFileSync(path, `${path}.bak`);
    log(`Backed up ${path} to ${path}.bak`);
  }
  const server = remove
    ? undefined
    : {
        command: process.execPath,
        args: [join(pluginRoot, 'dist', 'launch.mjs'), '--project', resolve(project ?? '.')],
      };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(withDesktopServer(existing, server), null, 2)}\n`);
  log(`${remove ? 'Removed' : 'Wrote'} the ${desktopServerName} server in ${path}. Quit and reopen Claude Desktop.`);
};

const preview = (sha: string | undefined): void => {
  if (sha === undefined || !/^[\da-f]{7,40}$/u.test(sha)) {
    return fail('preview needs --sha <commit> of a pkg.pr.new publish (the Preview packages workflow prints it)');
  }
  const catalog = join(homedir(), '.cache', 'tau-plugin-preview');
  mkdirSync(join(catalog, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(catalog, '.claude-plugin', 'marketplace.json'),
    `${JSON.stringify(
      {
        name: 'tau-preview',
        description: `The Tau plugin from pkg.pr.new at ${sha}`,
        owner: { name: 'taucad', url: 'https://tau.new' },
        plugins: [
          {
            name: 'tau',
            source: { source: 'npm', package: previewUrl('@taucad/agent-plugin', sha) },
            description: 'Evaluate, test, screenshot and export code-CAD models with Tau.',
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  /* The launcher's npx fallback names the plugin's own version, which no registry has for a preview. */
  run('npm', ['install', '--global', previewUrl('@taucad/cli', sha)]);
  run('claude', ['plugin', 'marketplace', 'add', catalog]);
  run('claude', ['plugin', 'install', 'tau@tau-preview']);
  log('Installed tau@tau-preview and a global `tau` from pkg.pr.new. Undo: claude plugin uninstall tau@tau-preview,');
  log('claude plugin marketplace remove tau-preview, npm uninstall --global @taucad/cli.');
};

/** A JSON-RPC session with the launcher over its stdio. */
const connect = (
  args: readonly string[],
): { child: ChildProcessWithoutNullStreams; request: (method: string, params: unknown) => Promise<unknown> } => {
  const child = spawn(process.execPath, [join(pluginRoot, 'dist', 'launch.mjs'), ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let buffer = '';
  let nextId = 1;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
      if (line === '') {
        continue;
      }
      const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
      const waiter = message.id === undefined ? undefined : pending.get(message.id);
      if (waiter !== undefined && message.id !== undefined) {
        pending.delete(message.id);
        if (message.error === undefined) {
          waiter.resolve(message.result);
        } else {
          waiter.reject(new Error(message.error.message));
        }
      }
    }
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  child.once('exit', (code) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`the server exited with ${String(code)}:\n${stderr}`));
    }
    pending.clear();
  });
  const request = async (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  return { child, request };
};

/** The `initialize` capabilities Claude Desktop sends, so the server offers the viewer page. */
const appHost = {
  clientInfo: { name: 'claude-ai', version: '0.1.0' },
  capabilities: {
    roots: { listChanged: true },
    extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
  },
};

const smokeProject = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'tau-plugin-doctor-'));
  writeFileSync(join(folder, 'tau.json'), `${JSON.stringify({ id: 'plugin-doctor' })}\n`);
  writeFileSync(
    join(folder, 'main.ts'),
    "import { drawRectangle } from 'replicad';\n\nexport default function main() {\n  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);\n}\n",
  );
  writeFileSync(
    join(folder, 'main.geospec.ts'),
    "import { describe, it, expectGeo } from 'geospec';\nimport { loadModel } from 'geospec/model';\n\ndescribe('20 x 10 x 4 mm block', () => {\n  it('has the specified size', async () => {\n    const model = await loadModel({ file: 'main.ts', format: 'step' });\n    expectGeo(model).toHaveBoundingBox({ size: { x: 20, y: 10, z: 4 }, tolerance: 0.001 });\n  });\n});\n",
  );
  return folder;
};

type ToolResult = { readonly isError?: boolean; readonly content?: ReadonlyArray<{ type: string; text?: string }> };

const doctor = async (smoke: boolean, project: string | undefined): Promise<void> => {
  requireBuild();
  const major = Number.parseInt(process.versions.node, 10);
  log(`${major >= 24 ? 'ok' : 'FAIL'}  Node.js ${process.versions.node} (the CLI needs 24 or later)`);
  for (const host of ['claude', 'codex'] as const) {
    const version = spawnSync(host, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' });
    log(
      `${version.status === 0 ? 'ok' : '--'}  ${host} ${version.status === 0 ? version.stdout.trim() : 'not on PATH'}`,
    );
  }
  const folder = project === undefined ? smokeProject() : resolve(project);
  const { child, request } = connect(['--project', folder]);
  const problems: string[] = [];
  try {
    const started = Date.now();
    await request('initialize', { protocolVersion: '2025-06-18', ...appHost });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    log(`ok  initialize answered in ${String(Date.now() - started)} ms`);
    const { tools } = (await request('tools/list', {})) as { tools: Array<{ name: string }> };
    const names = new Set(tools.map((tool) => tool.name));
    const missing = expectedTools.filter((name) => !names.has(name));
    log(
      `${missing.length === 0 ? 'ok' : 'FAIL'}  ${String(names.size)} tools${missing.length === 0 ? '' : `, missing ${missing.join(', ')}`}`,
    );
    if (missing.length > 0) {
      problems.push(`missing tools: ${missing.join(', ')}`);
    }
    const { resources } = (await request('resources/list', {})) as { resources: Array<{ uri: string }> };
    const page = resources.find((resource) => resource.uri.startsWith('ui://tau/'));
    if (page === undefined) {
      problems.push('no ui://tau/ viewer page resource');
      log('FAIL  no viewer page resource (ui://tau/…)');
    } else {
      const { contents } = (await request('resources/read', { uri: page.uri })) as {
        contents: Array<{ text?: string; mimeType?: string }>;
      };
      log(
        `ok  viewer page ${page.uri} (${String(contents[0]?.text?.length ?? 0)} characters, ${contents[0]?.mimeType ?? '?'})`,
      );
    }
    if (smoke) {
      const calls: Array<[string, Record<string, unknown>]> = [
        ['evaluate_model', { targetFile: 'main.ts' }],
        ['test_model', {}],
        ['screenshot', { targetFile: 'main.ts' }],
        ['export_model', { targetFile: 'main.ts', to: 'step' }],
        ['get_parameters', { targetFile: 'main.ts' }],
        ['show_model', { targetFile: 'main.ts' }],
      ];
      for (const [name, args] of calls) {
        const callStarted = Date.now();
        // oxlint-disable-next-line no-await-in-loop -- One model at a time, as an agent calls them.
        const result = (await request('tools/call', { name, arguments: args })) as ToolResult;
        const text = result.content?.find((item) => item.type === 'text')?.text ?? '';
        const kinds = [...new Set(result.content?.map((item) => item.type))].join('+');
        log(
          `${result.isError === true ? 'FAIL' : 'ok'}  ${name} in ${String(Date.now() - callStarted)} ms (${kinds}) ${text.split('\n')[0]?.slice(0, 100) ?? ''}`,
        );
        if (result.isError === true) {
          problems.push(`${name}: ${text.slice(0, 400)}`);
        }
      }
      log(`Smoke project: ${folder}`);
    }
  } finally {
    child.kill('SIGTERM');
    if (project === undefined && !smoke) {
      rmSync(folder, { recursive: true, force: true });
    }
  }
  if (problems.length > 0) {
    fail(`doctor found ${String(problems.length)} problem(s):\n${problems.join('\n')}`);
  }
  log('The plugin folder serves every tool and the viewer page.');
};

const main = async (): Promise<void> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      host: { type: 'string' },
      project: { type: 'string' },
      sha: { type: 'string' },
      remove: { type: 'boolean', default: false },
      smoke: { type: 'boolean', default: false },
    },
  });
  const [command] = positionals;
  switch (command) {
    case 'install': {
      install(hostsOf(values.host));
      break;
    }
    case 'uninstall': {
      uninstall(hostsOf(values.host));
      break;
    }
    case 'desktop': {
      desktop(values.project, values.remove);
      break;
    }
    case 'preview': {
      preview(values.sha);
      break;
    }
    case 'doctor': {
      await doctor(values.smoke, values.project);
      break;
    }
    default: {
      fail(
        'usage: pnpm plugin:dev install|uninstall|desktop|preview|doctor [--host claude|codex|all] [--project <folder>] [--sha <commit>] [--smoke] [--remove]',
      );
    }
  }
};

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
