import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** The built entry both hosts run; the test target builds it first. */
const launcher = fileURLToPath(new URL('../dist/launch.mjs', import.meta.url));
const { version: pluginVersion } = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { readonly version: string };

type Run = { readonly stdout: string; readonly stderr: string; readonly code: number | undefined };

/** What a fake CLI or `npx` prints when started: its arguments and the launch descriptor it was given. */
type Started = {
  readonly argv: readonly string[];
  readonly launch: {
    readonly source: string;
    readonly path?: string;
    readonly cli?: string;
    readonly plugin: string;
    readonly node: string;
    readonly skipped: ReadonlyArray<{ readonly path: string; readonly version?: string }>;
  };
};

/**
 * Run a launcher as a host would: stdin a pipe the host closes, stdout the protocol channel.
 */
const launch = async (
  environment: NodeJS.ProcessEnv,
  {
    entry = launcher,
    args = [],
    stopWhen,
  }: {
    readonly entry?: string;
    readonly args?: readonly string[];
    readonly stopWhen?: (stdout: string) => boolean;
  } = {},
): Promise<Run> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
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

/* Built by assignment so no environment key is a source literal. */
const baseEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  environment['PATH'] = process.env['PATH'];
  environment['HOME'] = process.env['HOME'];
  return environment;
};

/** A copy of `base` whose `TAU_CLI` is `tauCli`. */
const explicitEnvironment = (tauCli: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const environment = { ...base };
  environment['TAU_CLI'] = tauCli;
  return environment;
};

describe.skipIf(process.platform === 'win32')('launch', () => {
  let directory: string;

  /** An executable stand-in, run by the current Node.js, that answers `--version` as a Tau CLI does. */
  const fakeExecutable = async (
    path: string,
    body: string,
    { version = '0.0.1-fake' }: { readonly version?: string } = {},
  ): Promise<string> => {
    const answer = `if (process.argv[2] === '--version') { process.stdout.write('${version}\\n'); process.exit(0); }`;
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, `#!${process.execPath}\n${answer}\n${body}\n`);
    await chmod(path, 0o755);
    return path;
  };
  const fakeCli = async (body: string): Promise<string> => fakeExecutable(join(directory, 'tau'), body);

  /** A body that prints its arguments and the launch descriptor as one JSON object, then exits 0. */
  const reportStart =
    "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), launch: JSON.parse(process.env.TAU_LAUNCH ?? 'null') })); process.exit(0);";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-agent-plugin-launch-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  describe('with TAU_CLI', () => {
    it('should pass the CLI only `mcp`, leave stdout to it and exit with its code', async () => {
      const cli = await fakeCli(
        "process.stdin.resume().on('end', () => { process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(7); });",
      );

      await expect(launch(explicitEnvironment(cli))).resolves.toEqual({ stdout: '["mcp"]', stderr: '', code: 7 });
    });

    it('should pass its own arguments on after `mcp`', async () => {
      const cli = await fakeCli(
        "process.stdin.resume().on('end', () => { process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exit(0); });",
      );

      await expect(launch(explicitEnvironment(cli), { args: ['--project', '/work/bracket'] })).resolves.toEqual({
        stdout: '["mcp","--project","/work/bracket"]',
        stderr: '',
        code: 0,
      });
    });

    it('should tell the CLI in TAU_LAUNCH that TAU_CLI chose it, with the version it printed', async () => {
      const cli = await fakeCli(reportStart);

      const run = await launch(explicitEnvironment(cli, baseEnvironment()));

      expect(JSON.parse(run.stdout)).toEqual({
        argv: ['mcp'],
        launch: {
          source: 'explicit',
          path: cli,
          cli: '0.0.1-fake',
          plugin: pluginVersion,
          node: process.versions.node,
          skipped: [],
        },
      });
    });

    /** A CLI that prints the names of the variables it was given, then exits. */
    const environmentProbe = async (): Promise<string> =>
      fakeCli(
        "process.stdin.resume().on('end', () => { process.stdout.write(JSON.stringify({ names: Object.keys(process.env), envProxy: process.env.NODE_USE_ENV_PROXY ?? 'unset' })); process.exit(0); });",
      );

    it('should forward the proxy, CA and payload variables and turn on the environment proxy when one is set', async () => {
      const environment = baseEnvironment();
      environment['HTTPS_PROXY'] = 'http://127.0.0.1:9';
      environment['NO_PROXY'] = '127.0.0.1';
      environment['NODE_EXTRA_CA_CERTS'] = '/etc/ssl/certs/ca-certificates.crt';
      environment['TAU_PAYLOAD_MIRROR'] = 'https://mirror.example/';
      environment['TAU_CONFIG_DIR'] = directory;

      const run = await launch(explicitEnvironment(await environmentProbe(), environment));

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
      const cli = await environmentProbe();
      const plain = await launch(explicitEnvironment(cli, baseEnvironment()));
      const environment = baseEnvironment();
      environment['https_proxy'] = 'http://127.0.0.1:9';
      environment['NODE_USE_ENV_PROXY'] = '0';
      const explicit = await launch(explicitEnvironment(cli, environment));

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

      await expect(launch(explicitEnvironment(cli), { stopWhen: (stdout) => stdout === 'serving' })).resolves.toEqual({
        stdout: 'serving stopped',
        stderr: '',
        code: 0,
      });
    });

    it('should report a CLI that cannot start on one stderr line and exit 1', async () => {
      const missing = join(directory, 'missing-tau');

      const run = await launch(explicitEnvironment(missing));

      expect(run.stdout).toBe('');
      expect(run.stderr).toMatch(/^tau: cannot start .*missing-tau: .*ENOENT.*\n$/u);
      expect(run.code).toBe(1);
    });
  });

  describe('from an installed plugin folder', () => {
    const version = '0.0.0-launch-test';
    let entry: string;

    /* The built launcher in a folder with no `.dev/cli.json`, as a host installs it. */
    beforeEach(async () => {
      const root = join(directory, 'plugin');
      const built = fileURLToPath(new URL('../dist/', import.meta.url));
      await mkdir(join(root, 'dist'), { recursive: true });
      const files = await readdir(built);
      const modules = files.filter((name) => name.endsWith('.mjs'));
      await Promise.all(modules.map(async (file) => copyFile(join(built, file), join(root, 'dist', file))));
      await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@taucad/agent-plugin', version }));
      entry = join(root, 'dist', 'launch.mjs');
    });

    /** An environment whose `PATH` is exactly `folders`. */
    const pathEnvironment = (...folders: readonly string[]): NodeJS.ProcessEnv => {
      const environment = baseEnvironment();
      environment['PATH'] = folders.join(delimiter);
      return environment;
    };

    /** An `npm` that prints `npmVersion` for `--version` and `cache` for `config get cache`. */
    const fakeNpm = async (folder: string, npmVersion: string, cache: string): Promise<string> =>
      fakeExecutable(
        join(folder, 'npm'),
        `process.stdout.write(process.argv[2] === 'config' ? ${JSON.stringify(cache)} + '\\n' : 'never');`,
        { version: npmVersion },
      );

    /** The skipped entries under this test's folder: a machine's own `/usr/local/bin/tau` may be listed too. */
    const ownSkipped = (started: Started): Started['launch']['skipped'] =>
      started.launch.skipped.filter((skipped) => skipped.path.startsWith(directory));

    it('should run the first tau on PATH that prints the plugin version, and list the ones it skipped', async () => {
      const older = await fakeExecutable(join(directory, 'older', 'tau'), "process.stdout.write('older served');", {
        version: '0.0.0-older',
      });
      const broken = await fakeExecutable(join(directory, 'broken', 'tau'), 'process.exit(1);');
      await writeFile(broken, `#!${process.execPath}\nprocess.exit(1);\n`);
      const matching = await fakeExecutable(join(directory, 'matching', 'tau'), reportStart, { version });

      const run = await launch(
        pathEnvironment(join(directory, 'older'), join(directory, 'broken'), join(directory, 'matching')),
        { entry },
      );

      expect(run).toMatchObject({ stderr: '', code: 0 });
      expect(JSON.parse(run.stdout)).toEqual({
        argv: ['mcp'],
        launch: {
          source: 'installed',
          path: matching,
          cli: version,
          plugin: version,
          node: process.versions.node,
          skipped: [{ path: older, version: '0.0.0-older' }, { path: broken }],
        },
      });
    });

    it('should pass over a tau that prints 131,000 bytes for --version, keeping none of them, and run the next', async () => {
      /* Kept, those bytes would put TAU_LAUNCH past Linux's 128 KiB cap on one variable, and `spawn` would throw. */
      const noisy = await fakeExecutable(join(directory, 'noisy', 'tau'), "process.stdout.write('noisy served');", {
        version: '9'.repeat(131_000),
      });
      const matching = await fakeExecutable(join(directory, 'matching', 'tau'), reportStart, { version });

      const run = await launch(pathEnvironment(join(directory, 'noisy'), join(directory, 'matching')), { entry });

      expect(run).toMatchObject({ stderr: '', code: 0 });
      const started = JSON.parse(run.stdout) as Started;
      expect(started.launch).toMatchObject({ source: 'installed', path: matching, cli: version });
      expect(started.launch.skipped).toEqual([{ path: noisy }]);
    });

    it('should report a CLI that spawn refuses to start on one stderr line and exit 1', async () => {
      /* A plugin version that takes TAU_LAUNCH past every cap makes `spawn` throw E2BIG rather than emit an error:
       * Linux limits one variable to 32 pages (128 KiB with 4 KiB pages, 2 MiB with the 64 KiB pages of some
       * aarch64 kernels) and macOS all of them to 1 MiB. */
      await writeFile(
        join(directory, 'plugin', 'package.json'),
        JSON.stringify({ name: '@taucad/agent-plugin', version: '9'.repeat(2_200_000) }),
      );
      const cli = await fakeCli(reportStart);

      const run = await launch(explicitEnvironment(cli, baseEnvironment()), { entry });

      expect(run).toMatchObject({ stdout: '', code: 1 });
      expect(run.stderr).toMatch(/^tau: cannot start .*tau: spawn E2BIG\n$/u);
    });

    it('should fetch the plugin version with npx once the preflight passes', async () => {
      const older = await fakeExecutable(join(directory, 'older', 'tau'), "process.stdout.write('older served');", {
        version: '0.0.0-older',
      });
      const tools = join(directory, 'tools');
      await fakeNpm(tools, '11.19.0', join(directory, 'npm-cache'));
      await fakeExecutable(join(tools, 'npx'), reportStart);

      const run = await launch(pathEnvironment(join(directory, 'older'), tools), { entry });

      expect(run).toMatchObject({ stderr: '', code: 0 });
      const started = JSON.parse(run.stdout) as Started;
      expect(started).toMatchObject({
        argv: ['--yes', `--package=@taucad/cli@${version}`, 'tau', 'mcp'],
        launch: { source: 'npx', cli: version, plugin: version, node: process.versions.node },
      });
      expect(started.launch.path).toBeUndefined();
      expect(ownSkipped(started)).toEqual([{ path: older, version: '0.0.0-older' }]);
    });

    it('should still fetch with npx when npm will not name its cache', async () => {
      const tools = join(directory, 'tools');
      await fakeExecutable(
        join(tools, 'npm'),
        String.raw`process.stderr.write('npm error The cache option is protected, and cannot be retrieved in this way\n'); process.exit(1);`,
        { version: '11.19.0' },
      );
      await fakeExecutable(join(tools, 'npx'), reportStart);

      const run = await launch(pathEnvironment(tools), { entry });

      expect(run).toMatchObject({ stderr: '', code: 0 });
      expect(JSON.parse(run.stdout)).toMatchObject({ launch: { source: 'npx' } });
    });

    it('should exit 4 on one stderr line when npm is not on PATH', async () => {
      const empty = join(directory, 'empty');
      await mkdir(empty);

      const run = await launch(pathEnvironment(empty), { entry });

      expect(run).toEqual({
        stdout: '',
        stderr: 'tau: npm was not found on PATH; install Node.js 24 or later, which includes npm\n',
        code: 4,
      });
    });

    it('should exit 4 on one stderr line when npm is older than 11', async () => {
      const tools = join(directory, 'tools');
      await fakeNpm(tools, '10.9.4', join(directory, 'npm-cache'));
      await fakeExecutable(join(tools, 'npx'), reportStart);

      const run = await launch(pathEnvironment(tools), { entry });

      expect(run).toEqual({
        stdout: '',
        stderr: 'tau: npm 10.9.4 is older than 11; run: npm install -g npm@11\n',
        code: 4,
      });
    });

    it('should exit 3 on one stderr line, with the chown fix, when npm’s cache is not writable', async () => {
      const tools = join(directory, 'tools');
      await writeFile(join(directory, 'file'), '');
      const cache = join(directory, 'file', 'npm-cache');
      await fakeNpm(tools, '11.19.0', cache);
      await fakeExecutable(join(tools, 'npx'), reportStart);

      const run = await launch(pathEnvironment(tools), { entry });

      expect(run).toEqual({
        stdout: '',
        stderr: `tau: npm cache ${cache} is not writable; run: sudo chown -R ${process.getuid?.()}:${process.getgid?.()} "${cache}"\n`,
        code: 3,
      });
      expect(run.stderr).toMatch(/^tau: .*\n$/u);
    });
  });
});
