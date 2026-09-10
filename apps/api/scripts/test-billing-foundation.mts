#!/usr/bin/env node
/**
 * Qualify billing on a disposable, test-owned PostgreSQL 17 cluster.
 * Native mode avoids a VM's clock discipline; neither mode changes financial guards.
 * Required env: none. Optional env: PATH, HOME, TMPDIR, DOCKER_HOST (tool discovery only).
 * Usage: pnpm nx run api:test:billing-foundation [--runtime=native --postgres-bin=/path/to/keg/bin]
 * Exit codes: 0 passed, 1 test/infrastructure failure. Never reads API dotenv files.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { hostname, release, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const repoRoot = resolve(import.meta.dirname, '../../..');
const toolEnvironment = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST'].map((key) => [key, process.env[key]]),
);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((argument) => !/^--(?:runtime=(?:native|compose)|postgres-bin=.+)$/u.test(argument))) {
    throw new Error('Expected --runtime=native|compose and optional --postgres-bin=/path/to/keg/bin');
  }
  const runtime = args.find((argument) => argument.startsWith('--runtime='))?.slice('--runtime='.length) ?? 'compose';
  const binaryDirectory = args
    .find((argument) => argument.startsWith('--postgres-bin='))
    ?.slice('--postgres-bin='.length);
  if ((runtime === 'native') !== Boolean(binaryDirectory)) {
    throw new Error('Native mode requires --postgres-bin; compose mode does not accept it');
  }
  // Native macOS PostgreSQL requires an explicit locale to avoid threaded locale initialization.
  if (runtime === 'native') {
    toolEnvironment['LC_ALL'] = 'C';
  }
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'tau-billing-foundation-')));
  const project = `tau-billing-${randomUUID()}`;
  const password = randomUUID();
  const dataDirectory = join(directory, 'data');
  const logFile = join(directory, 'postgres.log');
  const abort = new AbortController();
  const interrupt = () => {
    abort.abort();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  let cleanup = () => {
    /* No runtime has started yet. */
  };
  const run = async (
    command: string,
    commandArgs: string[],
    options: { env?: Record<string, string | undefined>; inherit?: boolean; interruptible?: boolean } = {},
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const child = spawn(command, commandArgs, {
        cwd: join(repoRoot, 'apps/api'),
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- child env intentionally excludes API-required ambient variables
        env: (options.env ?? toolEnvironment) as NodeJS.ProcessEnv,
        signal: options.interruptible === false ? undefined : abort.signal,
        stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      let failure: Error | undefined;
      child.on('error', (error) => {
        failure = error;
      });
      // Wait for the child to close before cleaning up its owned database.
      child.on('close', (code) => {
        if (failure !== undefined || abort.signal.aborted) {
          reject(failure ?? new Error('Billing fixture interrupted'));
          return;
        }
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`${command} failed (${code}): ${stderr}`));
        }
      });
    });
  try {
    let address: string;
    if (runtime === 'native' && binaryDirectory) {
      const bin = realpathSync(binaryDirectory);
      const version = await run(join(bin, 'postgres'), ['--version']);
      if (!version.startsWith('postgres (PostgreSQL) 17.')) {
        throw new Error('Native fixture requires PostgreSQL 17');
      }
      const passwordFile = join(directory, 'password');
      writeFileSync(passwordFile, password, { mode: 0o600 });
      writeFileSync(join(directory, 'owner'), project, { mode: 0o600 });
      cleanup = () => {
        if (existsSync(join(dataDirectory, 'postmaster.pid'))) {
          const stopped = spawnSync(join(bin, 'pg_ctl'), ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], {
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tooling env intentionally excludes API-required ambient variables
            env: toolEnvironment as NodeJS.ProcessEnv,
            encoding: 'utf8',
            timeout: 30_000,
          });
          if (stopped.status !== 0) {
            throw new Error(`Owned PostgreSQL shutdown failed; retaining ${directory}: ${stopped.stderr}`);
          }
        }
      };
      await run(
        join(bin, 'initdb'),
        [
          '-D',
          dataDirectory,
          '-U',
          'billing_test',
          '--pwfile',
          passwordFile,
          '--auth=scram-sha-256',
          '--encoding=UTF8',
          '--locale=C',
        ],
        { interruptible: false },
      );
      const port = await new Promise<number>((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const bound = server.address();
          if (!bound || typeof bound === 'string') {
            server.close();
            reject(new Error('No isolated port'));
            return;
          }
          server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve(bound.port);
            }
          });
        });
      });
      // Native configuration values are generated locally; no supplied URL or existing cluster is accepted.
      writeFileSync(
        join(dataDirectory, 'postgresql.auto.conf'),
        `listen_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${directory.replaceAll("'", "''")}'\ncluster_name = '${project}'\n`,
      );
      console.log(`Starting owned native PostgreSQL ${project} in ${dataDirectory}`);
      // Finish startup before honoring interruption so cleanup can identify the owned server.
      await run(join(bin, 'pg_ctl'), ['-D', dataDirectory, '-l', logFile, '-w', '-t', '20', 'start'], {
        interruptible: false,
      });
      address = `127.0.0.1:${port}`;
      const connectionEnvironment = { ...toolEnvironment };
      connectionEnvironment['PGPASSWORD'] = password;
      const connection = ['-h', '127.0.0.1', '-p', String(port), '-U', 'billing_test'];
      const identity = await run(
        join(bin, 'psql'),
        [
          '-X',
          ...connection,
          '-d',
          'postgres',
          '-At',
          '-c',
          "select current_setting('data_directory'), current_setting('cluster_name'), current_setting('server_version_num'), clock_timestamp()",
        ],
        { env: connectionEnvironment },
      );
      const [actualDirectory, owner, serverVersion, clock] = identity.split('|');
      if (
        actualDirectory !== dataDirectory ||
        owner !== project ||
        !serverVersion?.startsWith('17') ||
        readFileSync(join(directory, 'owner'), 'utf8') !== project
      ) {
        throw new Error('Native PostgreSQL fixture identity mismatch');
      }
      console.log(
        JSON.stringify({
          runtime,
          version,
          host: hostname(),
          platform: process.platform,
          release: release(),
          project,
          dataDirectory,
          address,
          databaseClock: clock,
          hostClock: new Date().toISOString(),
        }),
      );
      await run(join(bin, 'createdb'), [...connection, 'billing_test'], { env: connectionEnvironment });
    } else {
      const composeFile = join(directory, 'compose.json');
      writeFileSync(
        composeFile,
        JSON.stringify({
          services: {
            postgres: {
              image: 'postgres:17-alpine',
              // eslint-disable-next-line @typescript-eslint/naming-convention -- Docker Compose field
              pull_policy: 'never',
              // eslint-disable-next-line @typescript-eslint/naming-convention -- PostgreSQL image environment contract
              environment: { POSTGRES_USER: 'billing_test', POSTGRES_PASSWORD: password, POSTGRES_DB: 'billing_test' },
              ports: ['127.0.0.1::5432'],
              healthcheck: {
                test: ['CMD-SHELL', 'pg_isready -U billing_test -d billing_test'],
                interval: '1s',
                timeout: '3s',
                retries: 30,
              },
            },
          },
        }),
      );
      const nativeCompose =
        spawnSync('docker', ['compose', 'version'], {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tooling env intentionally excludes API-required ambient variables
          env: toolEnvironment as NodeJS.ProcessEnv,
          stdio: 'ignore',
        }).status === 0;
      const command = nativeCompose ? 'docker' : 'docker-compose';
      const composeArgs = [...(nativeCompose ? ['compose'] : []), '--project-name', project, '--file', composeFile];
      cleanup = () => {
        const stopped = spawnSync(command, [...composeArgs, 'down', '--volumes', '--remove-orphans'], {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tooling env intentionally excludes API-required ambient variables
          env: toolEnvironment as NodeJS.ProcessEnv,
          encoding: 'utf8',
          timeout: 40_000,
        });
        if (stopped.status !== 0) {
          throw new Error(`Compose cleanup failed; retaining ${directory}: ${stopped.stderr}`);
        }
      };
      await run(command, [...composeArgs, 'up', '--detach', '--wait', '--wait-timeout', '40']);
      address = await run(command, [...composeArgs, 'port', 'postgres', '5432']);
    }
    if (!/^127\.0\.0\.1:\d+$/u.test(address)) {
      throw new Error('Test database did not bind exclusively to loopback');
    }
    const testEnvironment = { ...toolEnvironment };
    testEnvironment['NODE_ENV'] = 'test';
    testEnvironment['BILLING_TEST_DATABASE_URL'] = `postgres://billing_test:${password}@${address}/billing_test`;
    testEnvironment['BILLING_TEST_OWNED'] = project;
    if (runtime === 'native') {
      testEnvironment['BILLING_TEST_DATA_DIRECTORY'] = dataDirectory;
    }
    await run(
      'pnpm',
      ['--config.verify-deps-before-run=warn', 'exec', 'vitest', 'run', '--config', 'vitest.billing.config.ts'],
      {
        env: testEnvironment,
        inherit: true,
      },
    );
  } finally {
    try {
      cleanup();
      if (existsSync(logFile)) {
        console.log(readFileSync(logFile, 'utf8').slice(-32_768));
      }
      rmSync(directory, { recursive: true, force: true });
      console.log(`Removed owned billing fixture ${project}; host clock ${new Date().toISOString()}`);
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
