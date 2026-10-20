import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { expectedTools } from '#doctor-probe.js';

type Run = { readonly stdout: string; readonly stderr: string; readonly code: number | undefined };

const version = '0.0.0-doctor-test';

/** A `tau mcp` that answers `initialize`, `tools/list` and `resources/list` as the real server does. */
const servingBody = String.raw`
let buffer = '';
process.stdin.setEncoding('utf8').on('data', (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) !== -1) {
    const message = JSON.parse(buffer.slice(0, newline));
    buffer = buffer.slice(newline + 1);
    const results = {
      initialize: {
        serverInfo: { name: '@taucad/mcp', version: '${version}' },
        instructions: 'Use your native filesystem tools. Tau CLI ${version} (installed tau at /x/tau) started by plugin ${version} on Node.js 24.20.0; server @taucad/mcp ${version}.',
      },
      'tools/list': { tools: ${JSON.stringify(expectedTools.map((name) => ({ name })))} },
      'resources/list': { resources: [{ uri: 'ui://tau/viewer.html' }] },
    };
    if (message.id !== undefined) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: results[message.method] }) + '\n');
    }
  }
});`;

describe.skipIf(process.platform === 'win32')('doctor', () => {
  let directory: string;
  let entry: string;
  let tools: string;

  /** An executable stand-in, run by the current Node.js, that answers `--version` with `answer`. */
  const fakeExecutable = async (path: string, answer: string, body: string): Promise<string> => {
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(
      path,
      `#!${process.execPath}\nif (process.argv[2] === '--version') { process.stdout.write(${JSON.stringify(answer)} + '\\n'); process.exit(0); }\n${body}\n`,
    );
    await chmod(path, 0o755);
    return path;
  };

  /** An `npm` 11.19.0 whose cache is `cache` and whose registry has this plugin's version as `beta`. */
  const fakeNpm = async (cache: string): Promise<string> =>
    fakeExecutable(
      join(tools, 'npm'),
      '11.19.0',
      `process.stdout.write((process.argv[2] === 'config' ? ${JSON.stringify(cache)} : '${version}') + '\\n');`,
    );

  /** A Claude Code whose `plugin list --json` holds `tau@taucad`, enabled or not. */
  const fakeClaude = async (enabled: boolean): Promise<string> =>
    fakeExecutable(
      join(tools, 'claude'),
      '2.1.303 (Claude Code)',
      `process.stdout.write(${JSON.stringify(JSON.stringify([{ id: 'tau@taucad', version, scope: 'user', enabled }]))});`,
    );

  const run = async (...args: readonly string[]): Promise<Run> =>
    new Promise((resolve, reject) => {
      const environment: NodeJS.ProcessEnv = {};
      environment['PATH'] = tools;
      environment['HOME'] = directory;
      const child = spawn(process.execPath, [entry, ...args], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        resolve({ stdout, stderr, code: code ?? undefined });
      });
    });

  /** The line of one check, `<status> <name> <detail>`, from the text report. */
  const line = (stdout: string, name: string): string | undefined =>
    stdout.split('\n').find((candidate) => candidate.slice(6).startsWith(`${name} `));

  /* The built doctor in a plugin folder with no `.dev/cli.json`, as a host installs it, with a matching `tau`. */
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-agent-plugin-doctor-'));
    const root = join(directory, 'plugin');
    const built = fileURLToPath(new URL('../dist/', import.meta.url));
    await mkdir(join(root, 'dist'), { recursive: true });
    const files = await readdir(built);
    const modules = files.filter((name) => name.endsWith('.mjs'));
    await Promise.all(modules.map(async (file) => copyFile(join(built, file), join(root, 'dist', file))));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@taucad/agent-plugin', version }));
    await mkdir(join(root, 'skills', 'tau'), { recursive: true });
    await writeFile(join(root, 'skills', 'tau', 'SKILL.md'), '---\nname: tau\n---\n');
    entry = join(root, 'dist', 'doctor.mjs');
    tools = join(directory, 'tools');
    await fakeNpm(join(directory, 'npm-cache'));
    await fakeClaude(true);
    await fakeExecutable(join(tools, 'tau'), version, servingBody);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should pass every check and print the nine report keys with --json when the plugin can serve', async () => {
    const { stdout, code } = await run('--json');
    const report = JSON.parse(stdout) as Record<string, { readonly status?: string } & Record<string, unknown>>;

    expect(code).toBe(0);
    expect(Object.keys(report)).toEqual([
      'plugin',
      'node',
      'npm',
      'hosts',
      'cli',
      'registry',
      'server',
      'skills',
      'next',
    ]);
    expect(report).toMatchObject({
      plugin: { version },
      node: { status: 'ok' },
      npm: { status: 'ok', version: '11.19.0', cache: join(directory, 'npm-cache') },
      hosts: { claude: { status: 'ok', version: '2.1.303' }, codex: { status: 'warn', detail: 'not on PATH' } },
      cli: { status: 'ok', source: 'installed', path: join(tools, 'tau'), cliVersion: version },
      registry: { status: 'ok', version },
      server: { status: 'ok', tools: [...expectedTools], missingTools: [], viewer: 'ui://tau/viewer.html' },
      skills: { status: 'ok', names: ['tau'] },
      next: [expect.stringContaining(`the server instructions contain "Tau CLI ${version}"`)],
    });
  });

  it('should print one line per check in the fixed format', async () => {
    const { stdout, code } = await run();

    expect(code).toBe(0);
    expect(stdout.split('\n')[0]).toBe(`tau doctor: plugin ${version} at ${join(directory, 'plugin')}`);
    expect(line(stdout, 'claude')).toBe(`ok    claude    2.1.303; tau@taucad ${version} enabled (user scope)`);
    expect(line(stdout, 'cli')).toBe(`ok    cli       installed tau ${version} at ${join(tools, 'tau')}`);
    expect(line(stdout, 'server')).toMatch(
      /^ok {4}server {4}initialize \d+\.\d s; @taucad\/mcp 0\.0\.0-doctor-test; 9 tools; viewer resource ui:\/\/tau\/viewer\.html$/u,
    );
  });

  it('should fail with exit 6 and the enable command when the plugin is installed but disabled', async () => {
    await fakeClaude(false);

    const { stdout, code } = await run();

    expect(code).toBe(6);
    expect(line(stdout, 'claude')).toBe(`fail  claude    2.1.303; tau@taucad ${version} disabled (user scope)`);
    expect(stdout).toContain('next  claude plugin enable tau@taucad\n');
  });

  it('should fail with exit 3 and the chown fix when npm’s cache is not writable', async () => {
    await writeFile(join(directory, 'file'), '');
    const cache = join(directory, 'file', 'npm-cache');
    await fakeNpm(cache);

    const { stdout, code } = await run();

    expect(code).toBe(3);
    expect(line(stdout, 'npm')).toBe(`fail  npm       npm cache ${cache} is not writable`);
    expect(stdout).toContain(`next  sudo chown -R ${process.getuid?.()}:${process.getgid?.()} "${cache}"\n`);
  });

  it('should warn that npx will run, and name the install, when only an older tau is installed', async () => {
    const older = await fakeExecutable(join(tools, 'tau'), '0.0.0-older', 'process.exit(1);');
    await fakeExecutable(join(tools, 'npx'), 'npx', servingBody);

    const { stdout, code } = await run();

    expect(code).toBe(0);
    expect(line(stdout, 'cli')).toBe(
      `warn  cli       installed tau 0.0.0-older at ${older} skipped (plugin ${version}); npx will run, and its first start can take minutes`,
    );
    expect(stdout).toContain(`next  npm install -g @taucad/cli@${version}\n`);
  });

  it('should fail with exit 5 and the launcher’s own line when the server does not start', async () => {
    await fakeExecutable(
      join(tools, 'tau'),
      version,
      String.raw`process.stderr.write('tau: cannot start the server\n'); process.exit(1);`,
    );

    const { stdout, code } = await run();

    expect(code).toBe(5);
    expect(line(stdout, 'server')).toBe('fail  server    tau: cannot start the server');
  });

  it('should warn and name the install when Claude Code has no Tau plugin', async () => {
    await fakeExecutable(join(tools, 'claude'), '2.1.303 (Claude Code)', "process.stdout.write('[]');");

    const { stdout, code } = await run();

    expect(code).toBe(0);
    expect(line(stdout, 'claude')).toBe('warn  claude    2.1.303; tau is not installed');
    expect(stdout).toContain('next  claude plugin install tau --marketplace taucad/marketplace\n');
  });
});
