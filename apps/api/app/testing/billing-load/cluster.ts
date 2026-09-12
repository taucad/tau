/**
 * Disposable, test-owned PostgreSQL 17 for the billing load harness.
 *
 * Duplicated from `apps/api/scripts/test-billing-foundation.mts` (which is a script with a
 * top-level `await main()` and no exports, so it cannot be imported) and reduced to the
 * cluster lifecycle only. Same contract: loopback-only bind, per-run project name and
 * volume, explicit cleanup, never the developer's ordinary database, never `infra:reset`.
 * ponytail: the shared extraction belongs to the owner of `apps/api/scripts/**`, not here.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

/** Tool discovery only; no API dotenv file and no provider, cloud or payment credential. */
export const toolEnvironment: Record<string, string | undefined> = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST'].map((key) => [key, process.env[key]]),
);

export type ClusterRuntime = 'native' | 'compose';

export type OwnedCluster = {
  /** `postgres://billing_test:…@127.0.0.1:PORT/billing_test`. */
  url: string;
  project: string;
  runtime: ClusterRuntime;
  address: string;
  dataDirectory?: string;
  stop: () => void;
};

const run = async (command: string, args: string[], environment = toolEnvironment): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- child env intentionally excludes API-required ambient variables
      env: environment as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} failed (${code}): ${stderr}`));
      }
    });
  });

const freePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
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

/** Starts an owned cluster; the caller must always invoke `stop` and remove `directory`. */
export async function startOwnedCluster(options: {
  runtime: ClusterRuntime;
  /** Required for `native`: the PostgreSQL 17 keg `bin` directory. */
  binaryDirectory?: string;
}): Promise<OwnedCluster & { directory: string }> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'tau-billing-load-')));
  const project = `tau-billing-${randomUUID()}`;
  const password = randomUUID();
  let address: string;
  let stop: () => void;
  let dataDirectory: string | undefined;
  if (options.runtime === 'native') {
    if (!options.binaryDirectory) {
      throw new Error('Native mode requires --postgres-bin');
    }
    const bin = realpathSync(options.binaryDirectory);
    // Native macOS PostgreSQL requires an explicit locale to avoid threaded locale initialization.
    const localeEnvironment: Record<string, string | undefined> = { ...toolEnvironment };
    localeEnvironment['LC_ALL'] = 'C';
    const version = await run(join(bin, 'postgres'), ['--version'], localeEnvironment);
    if (!version.startsWith('postgres (PostgreSQL) 17.')) {
      throw new Error('Native fixture requires PostgreSQL 17');
    }
    dataDirectory = join(directory, 'data');
    const passwordFile = join(directory, 'password');
    writeFileSync(passwordFile, password, { mode: 0o600 });
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
      localeEnvironment,
    );
    const port = await freePort();
    // Generated locally; no supplied URL or pre-existing cluster is ever accepted.
    writeFileSync(
      join(dataDirectory, 'postgresql.auto.conf'),
      `listen_addresses = '127.0.0.1'\nport = ${port}\nunix_socket_directories = '${directory.replaceAll("'", "''")}'\ncluster_name = '${project}'\nmax_connections = 200\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n`,
    );
    const owned = dataDirectory;
    stop = () => {
      if (existsSync(join(owned, 'postmaster.pid'))) {
        const stopped = spawnSync(join(bin, 'pg_ctl'), ['-D', owned, '-m', 'immediate', '-w', 'stop'], {
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
      join(bin, 'pg_ctl'),
      ['-D', dataDirectory, '-l', join(directory, 'postgres.log'), '-w', '-t', '30', 'start'],
      localeEnvironment,
    );
    address = `127.0.0.1:${port}`;
    const createEnvironment: Record<string, string | undefined> = { ...localeEnvironment };
    createEnvironment['PGPASSWORD'] = password;
    await run(
      join(bin, 'createdb'),
      ['-h', '127.0.0.1', '-p', String(port), '-U', 'billing_test', 'billing_test'],
      createEnvironment,
    );
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
            command: ['postgres', '-c', 'max_connections=200', '-c', 'fsync=off', '-c', 'synchronous_commit=off'],
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
    stop = () => {
      const stopped = spawnSync(command, [...composeArgs, 'down', '--volumes', '--remove-orphans'], {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- tooling env intentionally excludes API-required ambient variables
        env: toolEnvironment as NodeJS.ProcessEnv,
        encoding: 'utf8',
        timeout: 60_000,
      });
      if (stopped.status !== 0) {
        throw new Error(`Compose cleanup failed; retaining ${directory}: ${stopped.stderr}`);
      }
    };
    await run(command, [...composeArgs, 'up', '--detach', '--wait', '--wait-timeout', '60']);
    address = await run(command, [...composeArgs, 'port', 'postgres', '5432']);
  }
  if (!/^127\.0\.0\.1:\d+$/u.test(address)) {
    throw new Error('Test database did not bind exclusively to loopback');
  }
  return {
    url: `postgres://billing_test:${password}@${address}/billing_test`,
    project,
    runtime: options.runtime,
    address,
    dataDirectory,
    directory,
    stop: () => {
      stop();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
