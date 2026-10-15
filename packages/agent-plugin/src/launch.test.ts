import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The built entry both hosts run; the test target builds it first. */
const launcher = fileURLToPath(new URL('../dist/launch.mjs', import.meta.url));

type Run = { readonly stdout: string; readonly stderr: string; readonly code: number | undefined };

/**
 * Run the launcher with `TAU_CLI` set, as a host would: stdin a pipe the host
 * closes, stdout the protocol channel.
 */
const launch = async (
  tauCli: string,
  stopWhen?: (stdout: string) => boolean,
  {
    args = [],
    environment = process.env,
  }: { readonly args?: readonly string[]; readonly environment?: NodeJS.ProcessEnv } = {},
): Promise<Run> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, ...args], {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment key
      env: { ...environment, TAU_CLI: tauCli },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stopWhen?.(stdout)) {
        child.kill('SIGTERM');
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({ stdout, stderr, code: code ?? undefined });
    });
    if (stopWhen === undefined) {
      child.stdin.end();
    }
  });

describe.skipIf(process.platform === 'win32')('launch', () => {
  let directory: string;

  /** An executable stand-in for `tau`, run by the current Node.js. */
  const fakeCli = async (body: string): Promise<string> => {
    const path = join(directory, 'tau');
    await writeFile(path, `#!${process.execPath}\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-agent-plugin-launch-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should pass the CLI only `mcp`, leave stdout to it and exit with its code', async () => {
    const cli = await fakeCli(
      "process.stdin.resume().on('end', () => { process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(7); });",
    );

    await expect(launch(cli)).resolves.toEqual({ stdout: '["mcp"]', stderr: '', code: 7 });
  });

  it('should pass its own arguments on after `mcp`', async () => {
    const cli = await fakeCli(
      "process.stdin.resume().on('end', () => { process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(0); });",
    );

    await expect(launch(cli, undefined, { args: ['--project', '/work/bracket'] })).resolves.toEqual({
      stdout: '["mcp","--project","/work/bracket"]',
      stderr: '',
      code: 0,
    });
  });

  /** A CLI that prints the names of the variables it was given, then exits. */
  const environmentProbe = async (): Promise<string> =>
    fakeCli(
      "process.stdin.resume().on('end', () => { process.stdout.write(JSON.stringify({ names: Object.keys(process.env), envProxy: process.env.NODE_USE_ENV_PROXY ?? 'unset' })); process.exit(0); });",
    );

  /* Built by assignment so no environment key is a source literal. */
  const baseEnvironment = (): NodeJS.ProcessEnv => {
    const environment: NodeJS.ProcessEnv = {};
    environment['PATH'] = process.env['PATH'];
    environment['HOME'] = process.env['HOME'];
    return environment;
  };

  it('should forward the proxy, CA and payload variables and turn on the environment proxy when one is set', async () => {
    const environment = baseEnvironment();
    environment['HTTPS_PROXY'] = 'http://127.0.0.1:9';
    environment['NO_PROXY'] = '127.0.0.1';
    environment['NODE_EXTRA_CA_CERTS'] = '/etc/ssl/certs/ca-certificates.crt';
    environment['TAU_PAYLOAD_MIRROR'] = 'https://mirror.example/';
    environment['TAU_CONFIG_DIR'] = directory;

    const run = await launch(await environmentProbe(), undefined, { environment });

    const probe = JSON.parse(run.stdout) as { names: string[]; envProxy: string };
    expect(probe.names).toEqual(
      expect.arrayContaining([
        'HTTPS_PROXY',
        'NO_PROXY',
        'NODE_EXTRA_CA_CERTS',
        'TAU_PAYLOAD_MIRROR',
        'TAU_CONFIG_DIR',
      ]),
    );
    expect(probe.envProxy).toBe('1');
  });

  it('should leave the environment proxy off without a proxy, and keep an explicit setting', async () => {
    const plain = await launch(await environmentProbe(), undefined, { environment: baseEnvironment() });
    const environment = baseEnvironment();
    environment['https_proxy'] = 'http://127.0.0.1:9';
    environment['NODE_USE_ENV_PROXY'] = '0';
    const explicit = await launch(await environmentProbe(), undefined, { environment });

    expect(JSON.parse(plain.stdout)).toMatchObject({ envProxy: 'unset' });
    expect(JSON.parse(explicit.stdout)).toMatchObject({ envProxy: '0' });
  });

  it('should forward SIGTERM to the CLI and exit once it has stopped', async () => {
    const cli = await fakeCli(
      [
        "process.on('SIGTERM', () => { process.stdout.write(' stopped'); process.exit(0); });",
        "process.stdout.write('serving');",
        'setInterval(() => undefined, 1000);',
      ].join('\n'),
    );

    await expect(launch(cli, (stdout) => stdout === 'serving')).resolves.toEqual({
      stdout: 'serving stopped',
      stderr: '',
      code: 0,
    });
  });

  it('should report a CLI that cannot start on one stderr line and exit 1', async () => {
    const missing = join(directory, 'missing-tau');

    const run = await launch(missing);

    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(/^tau: cannot start .*missing-tau: .*ENOENT.*\n$/u);
    expect(run.code).toBe(1);
  });
});
