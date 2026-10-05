#!/usr/bin/env node
/* eslint-disable @typescript-eslint/naming-convention -- Compose keys, credential fixtures, and environment variables retain external wire names. */

/**
 * Purpose: Run packaged desktop smoke tests or the selected unpackaged writer control against disposable Postgres, Redis, and MinIO services.
 * Why: Completed-package proof must not use the shared development database or storage stack.
 * Required env vars: TAU_E2E_DESKTOP_EXECUTABLE for packaged mode; absolute TAU_E2E_BROWSER_PHYSICAL_CLOSURE for --unpackaged-writer-control.
 * Optional env vars: PATH, HOME, TMPDIR, DOCKER_HOST (tool discovery only);
 * TAU_E2E_BROWSER_PHYSICAL_CLOSURE forwards the absolute physical pin artifact path; --test-name-pattern selects tests.
 * TAU_E2E_DESKTOP_STARTUP_DIAGNOSTIC=1 explicitly enables the installed startup-only diagnostic.
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
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopE2ERoot = resolve(import.meta.dirname, '..');

type ProtocolCommand = {
  id: number;
  kind: 'Page.addScriptToEvaluateOnNewDocument' | 'Runtime.evaluate' | 'Runtime.callFunctionOn';
  sessionHash: string;
  enteredAt: number;
  settledAt?: number;
  outcome?: 'ok' | 'error';
};
type ProtocolCounts = {
  lines: number;
  refused: number;
  dropped: number;
  unmatched: number;
  unqualified: number;
  overflow: boolean;
};
type ProtocolMetadataCollector = {
  consume: (line: string) => boolean;
  snapshot: () => { counts: ProtocolCounts; commands: ProtocolCommand[] };
  refuse: () => void;
};

/** Retain only qualified CDP command timing; never persist a protocol body. */
export const createProtocolMetadataCollector = (): ProtocolMetadataCollector => {
  const commands: ProtocolCommand[] = [];
  const counts = { lines: 0, refused: 0, dropped: 0, unmatched: 0, unqualified: 0, overflow: false };
  const increment = (key: 'lines' | 'refused' | 'dropped' | 'unmatched' | 'unqualified'): void => {
    if (counts[key] < 1_000_000) {
      counts[key]++;
    } else {
      counts.overflow = true;
    }
  };
  const consume = (line: string): boolean => {
    if (!line.includes('pw:protocol')) {
      return false;
    }
    increment('lines');
    // A line longer than the parser budget or clipped by Playwright cannot
    // establish a trustworthy session and must never reach ordinary stderr.
    if (Buffer.byteLength(line, 'utf8') > 131_072 || line.includes('LOG TRUNCATED') || counts.overflow) {
      increment('refused');
      return true;
    }
    const direction = /\bpw:protocol\b.*?\b(SEND|RECV)\b/u.exec(line)?.[1];
    const start = line.indexOf('{');
    const end = line.lastIndexOf('}');
    if (!direction || start === -1 || end <= start) {
      increment('refused');
      return true;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line.slice(start, end + 1));
    } catch {
      increment('refused');
      return true;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      increment('refused');
      return true;
    }
    const message = parsed as { id?: unknown; method?: unknown; sessionId?: unknown; error?: unknown };
    if (!Number.isSafeInteger(message.id) || typeof message.id !== 'number') {
      return true; // Protocol event, not a command response.
    }
    if (typeof message.sessionId !== 'string' || message.sessionId.length === 0) {
      increment('unqualified');
      return true; // Root commands can reuse IDs across Electron's connections.
    }
    const sessionHash = createHash('sha256').update(message.sessionId).digest('hex');
    if (direction === 'SEND') {
      if (
        message.method !== 'Page.addScriptToEvaluateOnNewDocument' &&
        message.method !== 'Runtime.evaluate' &&
        message.method !== 'Runtime.callFunctionOn'
      ) {
        return true;
      }
      if (commands.length === 256) {
        commands.shift();
        increment('dropped');
      }
      commands.push({ id: message.id, kind: message.method, sessionHash, enteredAt: Date.now() });
      return true;
    }
    const matches = commands.filter(
      (row) => row.id === message.id && row.sessionHash === sessionHash && row.settledAt === undefined,
    );
    if (matches.length === 1) {
      matches[0]!.settledAt = Date.now();
      matches[0]!.outcome = message.error === undefined ? 'ok' : 'error';
    } else if (matches.length > 1) {
      increment('refused');
    } else {
      increment('unmatched');
    }
    return true;
  };
  return {
    consume,
    snapshot: (): { counts: ProtocolCounts; commands: ProtocolCommand[] } => ({
      counts: { ...counts },
      commands: [...commands],
    }),
    refuse: (): void => {
      increment('refused');
    },
  };
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      'test-name-pattern': { type: 'string' },
      'unpackaged-writer-control': { type: 'boolean', default: false },
      'isolated-cloud-gateway': { type: 'boolean', default: false },
    },
  });
  const unpackagedWriterControl = values['unpackaged-writer-control'];
  const unpackagedPattern = String.raw`^\[unpackaged-utility-control\] should reopen the exact browser pin without a publication writer and deny authored publication$`;
  const testNamePattern =
    values['test-name-pattern'] ?? (unpackagedWriterControl ? unpackagedPattern : String.raw`^\[completed-artifact\]`);
  if (unpackagedWriterControl && testNamePattern !== unpackagedPattern) {
    throw new Error('Unpackaged isolated mode selects only the actual missing-writer utility control.');
  }
  const isolatedCloudGateway = values['isolated-cloud-gateway'] || unpackagedWriterControl;
  const startupDiagnostic = process.env['TAU_E2E_DESKTOP_STARTUP_DIAGNOSTIC'];
  if (startupDiagnostic !== undefined && !['0', '1', 'false'].includes(startupDiagnostic)) {
    throw new Error('TAU_E2E_DESKTOP_STARTUP_DIAGNOSTIC accepts only 1, 0, or false.');
  }
  const startupControl = process.env['TAU_E2E_DESKTOP_STARTUP_CONTROL'];
  if (startupControl !== undefined && !['0', '1', 'false'].includes(startupControl)) {
    throw new Error('TAU_E2E_DESKTOP_STARTUP_CONTROL accepts only 1, 0, or false.');
  }
  if (startupControl === '1' && startupDiagnostic !== '1') {
    throw new Error('Startup control requires the explicit startup diagnostic.');
  }
  const executable = process.env['TAU_E2E_DESKTOP_EXECUTABLE'];
  if (!unpackagedWriterControl && (!executable || !isAbsolute(executable) || !existsSync(executable))) {
    throw new Error('TAU_E2E_DESKTOP_EXECUTABLE must name an existing absolute packaged executable.');
  }

  const browserClosure = process.env['TAU_E2E_BROWSER_PHYSICAL_CLOSURE'];
  if (
    (unpackagedWriterControl && browserClosure === undefined) ||
    (browserClosure !== undefined &&
      (!isAbsolute(browserClosure) || !existsSync(browserClosure) || !statSync(browserClosure).isFile()))
  ) {
    throw new Error('TAU_E2E_BROWSER_PHYSICAL_CLOSURE must name an existing absolute artifact file.');
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
    const result = spawnSync(composeCommand, [...composeArguments, 'down', '--volumes', '--remove-orphans'], {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Cleanup receives only tool discovery variables.
      env: toolEnvironment as NodeJS.ProcessEnv,
      stdio: 'ignore',
      timeout: 40_000,
    });
    console.info('[completed-artifact] service cleanup', {
      project,
      status: result.status,
      signal: result.signal,
      error: result.error?.message,
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

    console.info('[completed-artifact] verified container services', {
      project,
      postgresContainer,
      databaseAddress,
      redisAddress,
      storageAddress,
      databaseIdentity,
    });

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
      TAU_E2E_COMPLETED_ARTIFACT: unpackagedWriterControl ? 'false' : 'true',
      TAU_E2E_ACP_PACKAGED: unpackagedWriterControl ? 'false' : 'true',
      ...(unpackagedWriterControl ? { TAU_E2E_UNPACKAGED_WRITER_CONTROL: 'true' } : {}),
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
      ...(executable === undefined ? {} : { TAU_E2E_DESKTOP_EXECUTABLE: executable }),
      ...(startupDiagnostic === '1' ? { TAU_E2E_DESKTOP_STARTUP_DIAGNOSTIC: '1' } : {}),
      ...(startupControl === '1' ? { TAU_E2E_DESKTOP_STARTUP_CONTROL: '1' } : {}),
      ...(browserClosure === undefined ? {} : { TAU_E2E_BROWSER_PHYSICAL_CLOSURE: browserClosure }),
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
    // Playwright's supported pw:protocol logger is opt-in. Drain its stderr in
    // this owned runner and retain only command metadata, never protocol bodies.
    const protocol = createProtocolMetadataCollector();
    const consumeProtocolLine = (line: string): void => {
      if (!protocol.consume(line)) {
        process.stderr.write(`${line}\n`);
      }
    };
    const vitestEnvironment: NodeJS.ProcessEnv = {
      ...environment,
      ...(startupDiagnostic === '1' ? { DEBUG: 'pw:protocol', DEBUG_COLORS: '0', MAX_LOG_LENGTH: '65536' } : {}),
    };
    const vitest = spawn(
      resolve(workspaceRoot, 'node_modules/.bin/vitest'),
      [
        'run',
        '--config',
        'vitest.config.ts',
        ...(unpackagedWriterControl
          ? []
          : [
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
            ]),
        'src/desktop-published-part.spec.ts',
        '-t',
        testNamePattern,
      ],
      {
        cwd: desktopE2ERoot,
        env: vitestEnvironment,
        stdio: startupDiagnostic === '1' ? ['inherit', 'inherit', 'pipe'] : 'inherit',
      },
    );
    activeChild = vitest;
    if (startupDiagnostic === '1') {
      const decoder = new StringDecoder('utf8');
      let carry = '';
      let carryBytes = 0;
      let dropping = false;
      const append = (text: string): void => {
        let offset = 0;
        while (offset < text.length) {
          const end = text.indexOf('\n', offset);
          const final = end === -1 ? text.length : end;
          const segment = text.slice(offset, final);
          if (!dropping) {
            const segmentBytes = Buffer.byteLength(segment, 'utf8');
            if (carryBytes + segmentBytes > 131_072) {
              carry = '';
              carryBytes = 0;
              dropping = true;
              protocol.refuse();
            } else {
              carry += segment;
              carryBytes += segmentBytes;
            }
          }
          if (end === -1) {
            break;
          }
          if (!dropping) {
            consumeProtocolLine(carry);
          }
          carry = '';
          carryBytes = 0;
          dropping = false;
          offset = end + 1;
        }
      };
      vitest.stderr?.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
        for (let offset = 0; offset < chunk.byteLength; offset += 16_384) {
          append(decoder.write(Buffer.from(chunk.subarray(offset, offset + 16_384))));
        }
      });
      vitest.stderr?.once('end', () => {
        append(decoder.end());
        if (carry && !dropping) {
          consumeProtocolLine(carry);
        }
      });
    }
    const status = await new Promise<number>((resolve, reject) => {
      vitest.once('error', reject);
      vitest.once('close', (code, signal) => {
        resolve(code ?? (signal ? 1 : 0));
      });
    });
    activeChild = undefined;
    if (startupDiagnostic === '1') {
      const path = resolve(workspaceRoot, 'out/test-results/desktop-e2e', `protocol-${project}.json`);
      mkdirSync(resolve(workspaceRoot, 'out/test-results/desktop-e2e'), { recursive: true });
      const metadata = protocol.snapshot();
      writeFileSync(path, JSON.stringify(metadata), { mode: 0o600 });
      console.info('[completed-artifact] private protocol metadata', { path, ...metadata.counts });
    }
    if (status !== 0) {
      throw new Error(`Completed-artifact Vitest failed with status ${String(status)}.`);
    }
  } finally {
    await cleanup();
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
