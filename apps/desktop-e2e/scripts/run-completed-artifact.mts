#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention -- Compose keys, credential fixtures, and environment variables retain external wire names. */

/**
 * Purpose: Run packaged desktop smoke tests against disposable Postgres, Redis, and MinIO services.
 * Why: Completed-package proof must not use the shared development database or storage stack.
 * Required env vars: TAU_E2E_DESKTOP_EXECUTABLE (absolute packaged Tau executable path).
 * Optional env vars: PATH, HOME, TMPDIR, DOCKER_HOST (tool discovery only); TAU_E2E_PROJECTION_IMPORT_ROOT,
 * TAU_E2E_PROJECTION_ARTIFACT_ROOT, and the explicitly validated projection manual selectors below.
 * DEBUG=pw:protocol enables redacted test-child protocol diagnostics; other DEBUG values are not forwarded.
 * Usage: pnpm nx run desktop-e2e:test:e2e:desktop:completed-artifact [--args='--test-name-pattern="pattern" [--isolated-cloud-gateway]']
 * Exit codes: 0 when package tests pass; non-zero on preflight, infrastructure, migration, or test failure.
 */

import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs, stripVTControlCharacters } from 'node:util';
import { z } from 'zod';

/** Retain protocol command correlation without scripts, credentials or result values. */
const redactProtocolLine = (line: string): string => {
  const plain = stripVTControlCharacters(line);
  if (!plain.includes('pw:protocol')) {
    return line;
  }
  const direction = plain.includes('SEND ►') ? 'send' : plain.includes('◀ RECV') ? 'receive' : 'unknown';
  const receipt: Record<string, string | number | boolean> = { protocol: true, direction };
  try {
    // Debug adds a timing suffix; JSON itself is a single line, possibly truncated.
    const message: unknown = JSON.parse(plain.slice(plain.indexOf('{'), plain.lastIndexOf('}') + 1));
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid protocol message');
    }
    if ('id' in message && typeof message.id === 'number' && Number.isSafeInteger(message.id)) {
      receipt['id'] = message.id;
      if (direction === 'receive') {
        receipt['completion'] = 'error' in message ? 'error' : 'result';
      }
    }
    if (
      'sessionId' in message &&
      typeof message.sessionId === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/u.test(message.sessionId)
    ) {
      receipt['sessionId'] = message.sessionId;
    }
    if (
      'method' in message &&
      typeof message.method === 'string' &&
      /^[A-Za-z]+\.[A-Za-z0-9]+$/u.test(message.method)
    ) {
      receipt['method'] = message.method;
    }
    if (
      'error' in message &&
      message.error &&
      typeof message.error === 'object' &&
      'code' in message.error &&
      typeof message.error.code === 'number'
    ) {
      receipt['errorCode'] = message.error.code;
    }
  } catch {
    receipt['redactedMalformed'] = true;
  }
  return JSON.stringify(receipt);
};

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopE2ERoot = resolve(import.meta.dirname, '..');

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      'test-name-pattern': { type: 'string', default: String.raw`^\[completed-artifact\]` },
      'isolated-cloud-gateway': { type: 'boolean', default: false },
    },
  });
  const isolatedCloudGateway = values['isolated-cloud-gateway'];
  const executable = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];
  if (!executable || !isAbsolute(executable) || !existsSync(executable)) {
    throw new Error('TAU_E2E_DESKTOP_EXECUTABLE must name an existing absolute packaged executable.');
  }

  const projectionInputs = z
    .object({
      TAU_E2E_TRACE_SNAPSHOTS: z.enum(['true', 'false']).optional(),
      TAU_E2E_PROJECTION_IMPORT_ROOT: z.string().min(1).refine(isAbsolute).optional(),
      TAU_E2E_PROJECTION_ARTIFACT_ROOT: z.string().min(1).refine(isAbsolute).optional(),
      TAU_E2E_NATIVE_CORE_MANUAL: z.enum(['true', 'false']).optional(),
      TAU_E2E_RETAINED_MANUAL: z.enum(['true', 'false']).optional(),
      TAU_E2E_REVISIONS_MANUAL: z.enum(['true', 'false']).optional(),
      TAU_E2E_REVISIONS_ACCEPTANCE: z.enum(['true', 'false']).optional(),
      TAU_E2E_METADATA_MANUAL: z.enum(['true', 'false']).optional(),
      TAU_E2E_OBSERVATION_MANUAL: z
        .enum(['files', 'directory', 'catalog', 'settings', 'drafts', 'media', 'parameters', 'todo', 'plugins'])
        .optional(),
      TAU_E2E_ONE_SHOT_MANUAL: z.enum(['fix', 'linked', 'thumbnail']).optional(),
    })
    .parse(process.env);
  if (
    projectionInputs.TAU_E2E_TRACE_SNAPSHOTS === 'false' &&
    Object.entries(projectionInputs).some(([key, value]) => key.endsWith('_MANUAL') && value !== 'false')
  ) {
    throw new Error('Manual completed-artifact runs require full tracing snapshots.');
  }
  if (projectionInputs.TAU_E2E_PROJECTION_IMPORT_ROOT !== undefined) {
    const input = realpathSync(projectionInputs.TAU_E2E_PROJECTION_IMPORT_ROOT);
    if (!statSync(input).isDirectory()) {
      throw new Error('TAU_E2E_PROJECTION_IMPORT_ROOT must be an existing fixture directory.');
    }
    projectionInputs.TAU_E2E_PROJECTION_IMPORT_ROOT = input;
  }
  if (projectionInputs.TAU_E2E_PROJECTION_ARTIFACT_ROOT !== undefined) {
    const output = resolve(projectionInputs.TAU_E2E_PROJECTION_ARTIFACT_ROOT);
    if (
      ![resolve(workspaceRoot, 'out'), resolve(tmpdir())].some(
        (root) => output === root || output.startsWith(`${root}/`),
      )
    ) {
      throw new Error('TAU_E2E_PROJECTION_ARTIFACT_ROOT must be inside workspace out or system temp.');
    }
    projectionInputs.TAU_E2E_PROJECTION_ARTIFACT_ROOT = output;
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
          // Same pinned community MinIO image as infra/docker-compose.yml, which pulls it.
          image:
            'pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372',
          pull_policy: 'never',
          command: ['server', '/data'],
          environment: { MINIO_ROOT_USER: storageUser, MINIO_ROOT_PASSWORD: storagePassword },
          ports: ['127.0.0.1::9000'],
          healthcheck: { test: ['CMD', 'mc', 'ready', 'local'], interval: '1s', timeout: '3s', retries: 30 },
        },
        storage_bootstrap: {
          image:
            'pgsty/minio:RELEASE.2026-08-04T00-00-00Z@sha256:b6bfe7239bfc83fb90d31612d9704d86039dd714f7904b3f1ad68f211e602372',
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
    if (databaseAddress.endsWith(':5432')) {
      throw new Error('Disposable Postgres must not use the shared development database port.');
    }
    const databaseQueryArguments = [
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
    ];
    const databaseIdentityQuery =
      "select current_setting('cluster_name') || '|' || current_database() || '|' || current_user";
    const databaseIdentity = run(composeCommand, [...databaseQueryArguments, databaseIdentityQuery]);
    if (databaseIdentity !== `${project}|desktop_e2e|desktop_e2e`) {
      throw new Error('Disposable database ownership verification failed.');
    }
    const postgresContainer = run(composeCommand, [...composeArguments, 'ps', '--quiet', 'postgres']);
    if (!/^[a-f0-9]{12,64}$/u.test(postgresContainer)) {
      throw new Error('Disposable Postgres container identity was not resolved.');
    }

    const apiPort = await freePort();
    const apiUrl = `http://127.0.0.1:${String(apiPort)}`;
    const providerPort = isolatedCloudGateway ? await freePort() : undefined;
    const databaseUrl = `postgresql://desktop_e2e:${databasePassword}@${databaseAddress}/desktop_e2e`;
    const environment = {
      ...toolEnvironment,
      NX_DAEMON: 'false',
      NX_WORKSPACE_DATA_DIRECTORY: join(directory, 'nx-workspace-data'),
      NX_CACHE_DIRECTORY: join(directory, 'nx-cache'),
      NX_LOAD_DOT_ENV_FILES: 'false',
      DOTENV_CONFIG_PATH: '/dev/null',
      DATABASE_URL: databaseUrl,
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
      ...projectionInputs,
      TAU_E2E_COMPLETED_ARTIFACT: 'true',
      TAU_E2E_ACP_PACKAGED: 'true',
      TAU_E2E_COMPOSE_PROJECT: project,
      ...(isolatedCloudGateway
        ? {
            TAU_E2E_COMPLETED_CLOUD_GATEWAY: 'true',
            TAU_CLOUD_ENABLED: 'true',
            BILLING_DATABASE_URL: databaseUrl,
            BILLING_ENVIRONMENT: 'development',
            TAU_E2E_PROVIDER_STUB_URL: `http://127.0.0.1:${String(providerPort)}`,
            BILLING_PROVIDER_ACCOUNTS: JSON.stringify({
              anthropic: 'desktop-e2e-anthropic',
              openai: 'desktop-e2e-openai',
              vertexai: 'desktop-e2e-vertexai',
            }),
          }
        : {}),
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
    const migration = spawnSync('pnpm', ['--config.verify-deps-before-run=warn', 'nx', 'run', 'api:db-migrate'], {
      cwd: workspaceRoot,
      env: {
        ...environment,
        BILLING_DATABASE_URL: environment.DATABASE_URL,
        BILLING_ENVIRONMENT: 'development',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const migrationTranscript = `${migration.stdout}\n${migration.stderr}`
      .replaceAll(databasePassword, '[redacted]')
      .replaceAll(storageUser, '[redacted]')
      .replaceAll(storagePassword, '[redacted]')
      .replaceAll(environment.AUTH_SECRET, '[redacted]')
      .replaceAll(environment.TAU_VIEW_COOKIE_SECRET, '[redacted]');
    console.info(`Migration command status ${String(migration.status)}:\n${migrationTranscript}`);
    if (migration.error !== undefined || migration.status !== 0) {
      throw new Error(`api:db-migrate failed with status ${String(migration.status)}.`, { cause: migration.error });
    }

    // Global setup rebuilds the API and removes this entry; retain the migration's consumed bytes first.
    const checkpointDirectory = resolve(workspaceRoot, 'out/test-results/desktop-e2e/migration-checkpoint', project);
    mkdirSync(checkpointDirectory, { recursive: true });
    const billingEntry = readFileSync(resolve(workspaceRoot, 'apps/api/dist/billing-command.js'));
    const migrationJournal = readFileSync(resolve(workspaceRoot, 'apps/api/dist/migrations/meta/_journal.json'));
    for (const [name, bytes] of [
      ['billing-command.js', billingEntry],
      ['_journal.json', migrationJournal],
    ] as const) {
      writeFileSync(join(checkpointDirectory, name), bytes, { flag: 'wx' });
      console.info(
        `Migration input ${name}: ${String(bytes.byteLength)} bytes, SHA256 ${createHash('sha256').update(bytes).digest('hex')}`,
      );
    }
    const journal = z
      .object({ entries: z.array(z.object({ tag: z.string().min(1), when: z.number().int().positive() })).min(1) })
      .parse(JSON.parse(migrationJournal.toString('utf8')));
    const head = journal.entries.at(-1);
    if (!head) {
      throw new Error('Migration journal is empty.');
    }
    const migratedIdentity = run(composeCommand, [...databaseQueryArguments, databaseIdentityQuery]);
    if (migratedIdentity !== databaseIdentity) {
      throw new Error('Disposable database ownership changed during migration.');
    }
    const markerPresent = run(composeCommand, [
      ...databaseQueryArguments,
      "select to_regclass('drizzle.__drizzle_migrations') is not null",
    ]);
    const applied =
      markerPresent === 't'
        ? run(composeCommand, [
            ...databaseQueryArguments,
            "select count(*)::int || '|' || coalesce(max(created_at), 0)::text from drizzle.__drizzle_migrations",
          ])
        : '0|0';
    const expected = `${String(journal.entries.length)}|${String(head.when)}`;
    console.info(
      `Migration checkpoint ${migratedIdentity}: applied ${applied}, expected ${expected} through ${head.tag}.`,
    );
    if (applied !== expected) {
      throw new Error('Disposable database migration checkpoint does not match the consumed journal.');
    }
    const selectedSpecs = [
      'src/desktop-build123d.spec.ts',
      'src/desktop-assimp.spec.ts',
      'src/desktop-main-editor-kernels.spec.ts',
      'src/desktop-converter.spec.ts',
      'src/desktop-ephemeral-isolation.spec.ts',
      'src/desktop-image-geospec.spec.ts',
      'src/desktop-geometry-host.spec.ts',
      'src/desktop-chat-replay.spec.ts',
      'src/desktop-chat-in-project.spec.ts',
      'src/desktop-chat-acp.spec.ts',
      'src/desktop-measurement-exact.spec.ts',
      'src/desktop-thumbnail-lifecycle.spec.ts',
      'src/desktop-native-payload.spec.ts',
      'src/desktop-community-preview.spec.ts',
      'src/filesystem-projection-live.spec.ts',
      'src/filesystem-projection-metadata.spec.ts',
      'src/filesystem-projection-observation.spec.ts',
      'src/filesystem-projection-one-shot.spec.ts',
      'src/filesystem-projection-retained.spec.ts',
    ];
    const resultDirectory = join(
      projectionInputs.TAU_E2E_PROJECTION_ARTIFACT_ROOT ?? join(workspaceRoot, 'out/desktop-e2e/completed-artifact'),
      project,
    );
    mkdirSync(resultDirectory, { recursive: true });
    const testReport = join(resultDirectory, 'vitest-results.json');
    const selection = {
      executable: realpathSync(executable),
      executableSha256: createHash('sha256').update(readFileSync(executable)).digest('hex'),
      testNamePattern: values['test-name-pattern'],
      specs: selectedSpecs.map((path) => ({
        path,
        sha256: createHash('sha256')
          .update(readFileSync(join(desktopE2ERoot, path)))
          .digest('hex'),
      })),
      projectionInputs,
      testReport,
    };
    writeFileSync(join(resultDirectory, 'selection.json'), JSON.stringify(selection, null, 2));
    console.info('Completed-artifact selection', JSON.stringify(selection));
    const protocolDiagnostic = process.env['DEBUG'] === 'pw:protocol';
    const vitest = spawn(
      resolve(workspaceRoot, 'node_modules/.bin/vitest'),
      [
        'run',
        '--config',
        'vitest.config.ts',
        '--reporter=default',
        '--reporter=json',
        `--outputFile.json=${testReport}`,
        ...selectedSpecs,
        '-t',
        values['test-name-pattern'],
      ],
      {
        cwd: desktopE2ERoot,
        env: { ...environment, ...(protocolDiagnostic ? { DEBUG: 'pw:protocol' } : {}) },
        stdio: protocolDiagnostic ? ['inherit', 'pipe', 'pipe'] : 'inherit',
      },
    );
    if (protocolDiagnostic) {
      for (const stream of [vitest.stdout, vitest.stderr]) {
        if (stream) {
          createInterface({ input: stream }).on('line', (line) => {
            process.stdout.write(`${redactProtocolLine(line)}\n`);
          });
        }
      }
    }
    activeChild = vitest;
    const status = await new Promise<number>((resolve, reject) => {
      vitest.once('error', reject);
      vitest.once('close', (code, signal) => {
        resolve(code ?? (signal ? 1 : 0));
      });
    });
    activeChild = undefined;
    if (status !== 0) {
      throw new Error(`Completed-artifact Vitest failed with status ${String(status)}.`);
    }
    if (!existsSync(testReport)) {
      throw new Error('Completed-artifact Vitest did not produce its required case report.');
    }
    const result = z
      .object({
        numTotalTests: z.number().int().nonnegative(),
        numPassedTests: z.number().int().nonnegative(),
        numFailedTests: z.number().int().nonnegative(),
        numPendingTests: z.number().int().nonnegative(),
      })
      .parse(JSON.parse(readFileSync(testReport, 'utf8')));
    const executedCases = result.numPassedTests + result.numFailedTests;
    console.info('Completed-artifact selected case counts', JSON.stringify({ ...result, executedCases }));
    if (executedCases === 0 || result.numPassedTests === 0) {
      throw new Error(
        'Completed-artifact selection executed no passing cases; listed or skipped cases do not qualify the package.',
      );
    }
    if (result.numFailedTests > 0) {
      throw new Error('Completed-artifact case report contains failed cases.');
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
