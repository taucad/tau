#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention -- Compose keys, credential fixtures, and environment variables retain external wire names. */

/**
 * Purpose: Run packaged desktop smoke tests against disposable Postgres, Redis, and MinIO services.
 * Why: Completed-package proof must not use the shared development database or storage stack.
 * Required env vars: TAU_E2E_DESKTOP_EXECUTABLE (absolute packaged Tau executable path).
 * Optional env vars: PATH, HOME, TMPDIR, DOCKER_HOST (tool discovery only).
 * Usage: pnpm nx run desktop-e2e:test:e2e:desktop:completed-artifact [--args='--test-name-pattern="pattern"']
 * Exit codes: 0 when package tests pass; non-zero on preflight, infrastructure, migration, or test failure.
 */

import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopE2ERoot = resolve(import.meta.dirname, '..');

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: { 'test-name-pattern': { type: 'string', default: String.raw`^\[completed-artifact\]` } },
  });
  const executable = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];
  if (!executable || !isAbsolute(executable) || !existsSync(executable)) {
    throw new Error('TAU_E2E_DESKTOP_EXECUTABLE must name an existing absolute packaged executable.');
  }

  const toolEnvironment = Object.fromEntries(
    ['PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST'].map((key) => [key, process.env[key]]),
  );
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'tau-desktop-e2e-')));
  const project = `tau-desktop-e2e-${randomUUID()}`;
  const databasePassword = randomUUID();
  const storageUser = randomUUID();
  const storagePassword = randomUUID();
  const composeFile = join(directory, 'compose.json');

  const composeAvailable =
    spawnSync('docker', ['compose', 'version'], {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Tool environment intentionally excludes application credentials.
      env: toolEnvironment as NodeJS.ProcessEnv,
      stdio: 'ignore',
    }).status === 0;
  const composeCommand = composeAvailable ? 'docker' : 'docker-compose';
  const composePrefix = composeAvailable ? ['compose'] : [];
  const composeArguments = [...composePrefix, '--project-name', project, '--file', composeFile];

  const run = (command: string, arguments_: readonly string[], environment = toolEnvironment): string => {
    const result = spawnSync(command, arguments_, {
      cwd: workspaceRoot,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each caller supplies a bounded generated environment.
      env: environment as NodeJS.ProcessEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error !== undefined || result.status !== 0) {
      const diagnostic = `${result.stderr}\n${result.stdout}`
        .slice(-8000)
        .replaceAll(databasePassword, '[redacted]')
        .replaceAll(storagePassword, '[redacted]');
      throw new Error(`${command} failed with status ${String(result.status)}: ${diagnostic}`, {
        cause: result.error,
      });
    }
    return result.stdout.trim();
  };

  const freePort = async (): Promise<number> =>
    new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Could not reserve an isolated loopback port.'));
          return;
        }
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(address.port);
          }
        });
      });
    });

  writeFileSync(
    composeFile,
    JSON.stringify({
      services: {
        postgres: {
          image: 'pgvector/pgvector:pg17',
          pull_policy: 'never',
          command: ['postgres', '-c', `cluster_name=${project}`],
          environment: {
            POSTGRES_USER: 'desktop_e2e',
            POSTGRES_PASSWORD: databasePassword,
            POSTGRES_DB: 'desktop_e2e',
          },
          ports: ['127.0.0.1::5432'],
          healthcheck: {
            test: ['CMD-SHELL', 'pg_isready -U desktop_e2e -d desktop_e2e'],
            interval: '1s',
            timeout: '3s',
            retries: 30,
          },
        },
        redis: {
          image: 'redis:7-alpine',
          pull_policy: 'never',
          ports: ['127.0.0.1::6379'],
          healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: '1s', timeout: '3s', retries: 30 },
        },
        minio: {
          image: 'quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z',
          pull_policy: 'never',
          command: ['server', '/data'],
          environment: { MINIO_ROOT_USER: storageUser, MINIO_ROOT_PASSWORD: storagePassword },
          ports: ['127.0.0.1::9000'],
          healthcheck: { test: ['CMD', 'mc', 'ready', 'local'], interval: '1s', timeout: '3s', retries: 30 },
        },
        storage_bootstrap: {
          image: 'quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z',
          pull_policy: 'never',
          depends_on: { minio: { condition: 'service_healthy' } },
          environment: { MINIO_ROOT_USER: storageUser, MINIO_ROOT_PASSWORD: storagePassword },
          entrypoint: [
            '/bin/sh',
            '-c',
            'set -eu; mc alias set local http://minio:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD" >/dev/null; mc mb local/tau-content local/tau-content-private >/dev/null',
          ],
        },
      },
    }),
    { mode: 0o600 },
  );

  let cleaned = false;
  let activeChild: ChildProcess | undefined;
  const stopActiveChild = async (): Promise<void> => {
    const child = activeChild;
    if (!child) {
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      const exited = (): void => {
        clearTimeout(killTimeout);
        resolve();
      };
      const killTimeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);
      child.once('exit', exited);
      child.kill('SIGTERM');
    });
    activeChild = undefined;
  };
  const cleanup = async (): Promise<void> => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    await stopActiveChild();
    spawnSync(composeCommand, [...composeArguments, 'down', '--volumes', '--remove-orphans'], {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Cleanup receives only tool discovery variables.
      env: toolEnvironment as NodeJS.ProcessEnv,
      stdio: 'ignore',
      timeout: 40_000,
    });
    rmSync(directory, { force: true, recursive: true });
  };
  process.once('SIGINT', async () => {
    await cleanup();
    process.exit(130);
  });
  process.once('SIGTERM', async () => {
    await cleanup();
    process.exit(143);
  });

  try {
    run(composeCommand, [
      ...composeArguments,
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '40',
      'postgres',
      'redis',
      'minio',
    ]);
    run(composeCommand, [...composeArguments, 'run', '--rm', 'storage_bootstrap']);
    const databaseAddress = run(composeCommand, [...composeArguments, 'port', 'postgres', '5432']);
    const redisAddress = run(composeCommand, [...composeArguments, 'port', 'redis', '6379']);
    const storageAddress = run(composeCommand, [...composeArguments, 'port', 'minio', '9000']);
    if (![databaseAddress, redisAddress, storageAddress].every((address) => /^127\.0\.0\.1:\d+$/u.test(address))) {
      throw new Error('Disposable services did not bind exclusively to loopback.');
    }
    const databaseIdentity = run(composeCommand, [
      ...composeArguments,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'desktop_e2e',
      '-d',
      'desktop_e2e',
      '-At',
      '-c',
      "select current_setting('cluster_name') || '|' || current_database() || '|' || current_user",
    ]);
    if (databaseIdentity !== `${project}|desktop_e2e|desktop_e2e`) {
      throw new Error('Disposable database ownership verification failed.');
    }
    const postgresContainer = run(composeCommand, [...composeArguments, 'ps', '--quiet', 'postgres']);
    if (!/^[a-f0-9]{12,64}$/u.test(postgresContainer)) {
      throw new Error('Disposable Postgres container identity was not resolved.');
    }

    const apiPort = await freePort();
    const apiUrl = `http://127.0.0.1:${String(apiPort)}`;
    const environment = {
      ...toolEnvironment,
      NX_DAEMON: 'false',
      NX_WORKSPACE_DATA_DIRECTORY: join(directory, 'nx-workspace-data'),
      NX_CACHE_DIRECTORY: join(directory, 'nx-cache'),
      NX_LOAD_DOT_ENV_FILES: 'false',
      DOTENV_CONFIG_PATH: '/dev/null',
      DATABASE_URL: `postgresql://desktop_e2e:${databasePassword}@${databaseAddress}/desktop_e2e`,
      REDIS_URL: `redis://${redisAddress}`,
      AUTH_SECRET: randomUUID(),
      TAU_VIEW_COOKIE_SECRET: randomUUID(),
      LOG_LEVEL: 'warn',
      OPENAI_API_KEY: 'desktop-e2e-unused',
      ANTHROPIC_API_KEY: 'desktop-e2e-unused',
      GOOGLE_VERTEX_AI_CREDENTIALS: JSON.stringify({
        type: 'service_account',
        project_id: 'desktop-e2e',
        private_key_id: 'unused',
        private_key: 'unused',
        client_email: 'desktop-e2e@example.invalid',
        client_id: 'unused',
        auth_uri: 'http://127.0.0.1/unused',
        token_uri: 'http://127.0.0.1/unused',
        auth_provider_x509_cert_url: 'http://127.0.0.1/unused',
        client_x509_cert_url: 'http://127.0.0.1/unused',
        universe_domain: 'example.invalid',
      }),
      GITHUB_CLIENT_ID: 'desktop-e2e-unused',
      GITHUB_CLIENT_SECRET: 'desktop-e2e-unused',
      ZOO_API_KEY: '',
      OTEL_METRICS_PORT: String(await freePort()),
      TAU_E2E_API_URL: apiUrl,
      TAU_E2E_API_CWD: directory,
      TAU_E2E_COMPLETED_ARTIFACT: 'true',
      TAU_E2E_DESKTOP_EXECUTABLE: executable,
      TAU_E2E_EXTERNAL_SERVICES: 'true',
      TAU_E2E_POSTGRES_CONTAINER: postgresContainer,
      TAU_E2E_POSTGRES_DATABASE: 'desktop_e2e',
      TAU_E2E_POSTGRES_USER: 'desktop_e2e',
      TAU_S3_ACCESS_KEY_ID: storageUser,
      TAU_S3_BUCKET: 'tau-content',
      TAU_S3_ENDPOINT: `http://${storageAddress}`,
      TAU_S3_FORCE_PATH_STYLE: 'true',
      TAU_S3_PRIVATE_BUCKET: 'tau-content-private',
      TAU_S3_PUBLIC_BASE_URL: `http://${storageAddress}/tau-content`,
      TAU_S3_REGION: 'us-east-1',
      TAU_S3_SECRET_ACCESS_KEY: storagePassword,
    };
    run('pnpm', ['--config.verify-deps-before-run=warn', 'nx', 'run', 'api:db-migrate'], environment);
    const vitest = spawn(
      resolve(workspaceRoot, 'node_modules/.bin/vitest'),
      [
        'run',
        '--config',
        'vitest.config.ts',
        'src/desktop-build123d.spec.ts',
        'src/desktop-assimp.spec.ts',
        'src/desktop-main-editor-kernels.spec.ts',
        'src/desktop-converter.spec.ts',
        'src/desktop-ephemeral-isolation.spec.ts',
        'src/desktop-image-geospec.spec.ts',
        'src/desktop-thumbnail-lifecycle.spec.ts',
        'src/desktop-native-payload.spec.ts',
        '-t',
        values['test-name-pattern'],
      ],
      {
        cwd: desktopE2ERoot,
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test environment contains only run-owned service credentials.
        env: environment as NodeJS.ProcessEnv,
        stdio: 'inherit',
      },
    );
    activeChild = vitest;
    const status = await new Promise<number>((resolve, reject) => {
      vitest.once('error', reject);
      vitest.once('exit', (code, signal) => {
        resolve(code ?? (signal ? 1 : 0));
      });
    });
    activeChild = undefined;
    if (status !== 0) {
      throw new Error(`Completed-artifact Vitest failed with status ${String(status)}.`);
    }
  } finally {
    await cleanup();
  }
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
