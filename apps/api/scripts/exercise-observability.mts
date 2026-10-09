#!/usr/bin/env node
/**
 * Drive every instrumented part of a LOCAL Tau API so each Grafana dashboard has real data.
 *
 * Covers auth, REST, client telemetry ingest (CAD kernel, editor, WASM, IndexedDB, and synthetic agent
 * turns with their usage context, and client sync attempts, that validate the ingest path, not agent
 * execution), Tau Sync (git smart HTTP + LFS into MinIO), publications, Claude Haiku 4.5 through the LLM
 * gateway, billing attempt lookups, and the hosts/kernels WebSockets. Codex/ACP and the billing workers run
 * beside it (see the observability handbook); this script does not start them.
 *
 * Local only: refuses a non-loopback API and writes fixtures (a verified harness user, a Pro
 * subscription, promotional credits) to this worktree's dev database via `docker exec tau-postgres`.
 * Funded calls spend real Anthropic credit; the harness user's promotional credit caps the total.
 *
 * Required env: none. Optional env: TAU_EXERCISE_API (default http://localhost:4000),
 *   TAU_EXERCISE_WS (default: API port + 1, the Vite dev server's WebSocket port).
 * Usage: pnpm nx run api:observability:exercise [-- --ai-calls=6 --rounds=1 --skip=ai,sync]
 * Exit codes: 0 every phase passed, 1 a phase failed or a precondition was refused.
 */
/* oxlint-disable no-await-in-loop -- the exercise is sequential by design: each phase uses the state the last one made */
/* eslint-disable @typescript-eslint/naming-convention -- wire field names (Anthropic Messages API, env, HTTP) */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { localDatabaseName } from '@taucad/utils/worktree-database';

const { values } = parseArgs({
  options: {
    'ai-calls': { type: 'string', default: '6' },
    rounds: { type: 'string', default: '1' },
    skip: { type: 'string', default: '' },
    email: { type: 'string', default: 'w36-harness@example.test' },
  },
});
/** A count flag as a whole number of at least `minimum`; `--ai-calls=x` must not run zero calls and report clean. */
function count(flag: string, value: string, minimum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`--${flag} must be a whole number of at least ${String(minimum)} (got "${value}")`);
  }
  return parsed;
}
const aiCalls = count('ai-calls', values['ai-calls'], 0);
const rounds = count('rounds', values.rounds, 1);
const skip = new Set(values.skip.split(',').filter(Boolean));
const api = new URL(process.env['TAU_EXERCISE_API'] ?? 'http://localhost:4000');
const wsOrigin = process.env['TAU_EXERCISE_WS'] ?? `ws://${api.hostname}:${Number(api.port || 80) + 1}`;
const database = localDatabaseName();
const { email } = values;
const password = 'W36-harness-pass-123';
// Better Auth refuses a fetch-originated POST without an Origin (CSRF); the UI's own origin is trusted.
const authHeaders = { origin: process.env['TAU_EXERCISE_ORIGIN'] ?? 'http://localhost:3000' };
// 1 credit atom = 1 µUSD. Top the harness user up to this balance; it is the hard ceiling on funded spend.
const creditCeilingAtoms = 10_000_000;

if (!['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) {
  throw new Error(`Refusing non-local API ${api.origin}`);
}
if (!database.startsWith('tau_dev')) {
  throw new Error(`Refusing non-dev database ${database}`);
}

type Phase = { readonly name: string; ok: number; failed: number; notes: string[] };
const phases: Phase[] = [];
let phase: Phase = { name: 'setup', ok: 0, failed: 0, notes: [] };

const check = (condition: boolean, what: string): void => {
  if (condition) {
    phase.ok += 1;
  } else {
    phase.failed += 1;
    phase.notes.push(what);
    console.error(`  ✗ ${what}`);
  }
};

const sql = (statement: string, variables: Record<string, string> = {}): string =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'tau-postgres',
      'psql',
      '-U',
      'dev_user',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-Atq',
      ...Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]),
    ],
    { input: statement, encoding: 'utf8' },
  ).trim();

let token = '';
const call = async (
  method: string,
  path: string,
  init: { body?: unknown; headers?: Record<string, string>; auth?: boolean } = {},
): Promise<Response> => {
  const send = async (): Promise<Response> =>
    fetch(new URL(path, api), {
      method,
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(init.auth === false || token === '' ? {} : { authorization: `Bearer ${token}` }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  try {
    return await send();
  } catch (error) {
    // A pooled keep-alive socket the server already closed (after a long git step) fails once; resend.
    console.warn(`  ↻ ${method} ${path}: ${String((error as Error).cause ?? error)}`);
    return send();
  }
};

const status = async (...args: Parameters<typeof call>): Promise<number> => {
  const response = await call(...args);
  await response.body?.cancel();
  return response.status;
};
async function json<T>(...args: Parameters<typeof call>): Promise<T> {
  const response = await call(...args);
  return (await response.json()) as T;
}
const succeeded = (code: number): boolean => code >= 200 && code < 300;

const run = async (name: string, body: () => Promise<void>): Promise<void> => {
  if (skip.has(name)) {
    return;
  }
  phase = { name, ok: 0, failed: 0, notes: [] };
  phases.push(phase);
  console.log(`▶ ${name}`);
  try {
    await body();
  } catch (error) {
    check(false, `${name} aborted: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const random = (low: number, high: number): number => low + Math.random() * (high - low);

// ---------------------------------------------------------------------------------------------
await run('auth', async () => {
  check(succeeded(await status('GET', '/health/ready', { auth: false })), 'API /health/ready');
  const signUp = await call('POST', '/v1/auth/sign-up/email', {
    auth: false,
    headers: authHeaders,
    body: { email, password, name: 'W36 Harness' },
  });
  check(signUp.ok || signUp.status === 422, `sign-up ${signUp.status}`);
  sql(`UPDATE "user" SET email_verified = true WHERE email = :'email';`, { email });
  const wrong = await call('POST', '/v1/auth/sign-in/email', {
    auth: false,
    headers: authHeaders,
    body: { email, password: 'wrong' },
  });
  check(wrong.status === 401, `wrong-password sign-in answers 401 (got ${wrong.status})`);
  const signIn = await call('POST', '/v1/auth/sign-in/email', {
    auth: false,
    headers: authHeaders,
    body: { email, password },
  });
  token = signIn.headers.get('set-auth-token') ?? ((await signIn.json()) as { token?: string }).token ?? '';
  check(signIn.ok && token !== '', `sign-in ${signIn.status}`);
  check(succeeded(await status('GET', '/v1/auth/get-session')), 'get-session');
});

if (token === '') {
  console.error('No session; stopping.');
  process.exit(1);
}

await run('fixtures', async () => {
  // A Pro subscription (Tau Sync, private shares, pro kernels) with no Stripe customer id, so nothing
  // reaches Stripe; then promotional credit up to the ceiling, journaled the way the ledger writes it.
  const balance = sql(
    `
BEGIN;
SELECT id AS uid FROM "user" WHERE email = :'email' \\gset
INSERT INTO billing.credit_account (id, environment)
  SELECT 'w36-acct-' || :'uid', 'development'
  WHERE NOT EXISTS (SELECT 1 FROM billing.billing_owner_binding
                    WHERE auth_user_id = :'uid' AND environment = 'development' AND revoked_at IS NULL);
INSERT INTO billing.billing_owner_binding (id, account_id, environment, auth_user_id)
  SELECT 'w36-bind-' || :'uid', 'w36-acct-' || :'uid', 'development', :'uid'
  WHERE NOT EXISTS (SELECT 1 FROM billing.billing_owner_binding
                    WHERE auth_user_id = :'uid' AND environment = 'development' AND revoked_at IS NULL);
SELECT account_id AS acct FROM billing.billing_owner_binding
  WHERE auth_user_id = :'uid' AND environment = 'development' AND revoked_at IS NULL \\gset
INSERT INTO billing.billing_stripe_customer (id, account_id, environment, stripe_account_id, livemode, stripe_customer_id)
  VALUES ('w36-cust-' || :'acct', :'acct', 'development', 'acct_w36_local', false, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.subscription (id, plan, status, account_id, environment, customer_binding_id, request_id,
    request_hash, offer_snapshot, slot_state, paid_through)
  SELECT 'w36-sub-' || :'acct' || '-' || to_char(now(), 'YYYYMMDD'), 'pro', 'active', :'acct', 'development',
    'w36-cust-' || :'acct', 'w36-req-' || :'acct' || '-' || to_char(now(), 'YYYYMMDD'), repeat('0', 64),
    '{"source":"w36-harness"}'::jsonb, 'current', now() + interval '30 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.subscription WHERE account_id = :'acct' AND paid_through > now() + interval '1 day');
INSERT INTO billing.billing_budget_funding (id, environment, kind, scope, funded_lifetime)
  VALUES ('w36-promo-funding', 'development', 'promotion_issuance', 'w36-promo', 1000000000000) ON CONFLICT DO NOTHING;
INSERT INTO billing.billing_budget (id, environment, funding_id, kind, scope, period_start, period_end, quantum, approved_cap)
  VALUES ('w36-promo', 'development', 'w36-promo-funding', 'promotion_issuance', 'w36-promo',
          '2020-01-01Z', '2030-01-01Z', 'credit_atom', 1000000000000) ON CONFLICT DO NOTHING;
SELECT promo_atoms + plan_atoms + purchased_atoms - debt_atoms AS bal, revision + 1 AS rev,
       greatest(0, :ceiling - (promo_atoms + plan_atoms + purchased_atoms - debt_atoms)) AS grant
  FROM billing.credit_account WHERE id = :'acct' FOR UPDATE \\gset
INSERT INTO billing.billing_promotion_issuance (id, environment, account_id, promotion_program_id, period_start,
    period_end, budget_id, atoms)
  SELECT 'w36-iss-' || :'acct' || '-' || :rev, 'development', :'acct', 'w36-' || :rev, now(), now() + interval '1 day',
    'w36-promo', :grant WHERE :grant > 0;
UPDATE billing.credit_account SET promo_atoms = promo_atoms + :grant, revision = :rev WHERE id = :'acct' AND :grant > 0;
INSERT INTO billing.credit_transaction (id, account_id, revision, kind, promotion_issuance_id, promo_delta_atoms,
    plan_delta_atoms, purchased_delta_atoms, debt_delta_atoms, account_delta_atoms, balance_after_atoms, occurred_at)
  SELECT gen_random_uuid()::text, :'acct', :rev, 'promotion_grant', 'w36-iss-' || :'acct' || '-' || :rev, :grant,
    0, 0, 0, :grant, :bal + :grant, now() WHERE :grant > 0;
UPDATE billing.billing_budget SET consumed = consumed + :grant WHERE id = 'w36-promo' AND :grant > 0;
UPDATE billing.billing_budget_funding SET consumed = consumed + :grant WHERE id = 'w36-promo-funding' AND :grant > 0;
SELECT promo_atoms + plan_atoms + purchased_atoms - debt_atoms FROM billing.credit_account WHERE id = :'acct';
COMMIT;
`,
    { email, ceiling: String(creditCeilingAtoms) },
  );
  phase.notes.push(`credit balance ${balance} atoms`);
  const entitlements = await json<Record<string, unknown>>('GET', '/v1/billing/entitlements');
  check(JSON.stringify(entitlements).includes('"canSyncFiles":true'), 'Pro entitlements (canSyncFiles)');
  for (const path of ['/v1/billing/credits', '/v1/billing/holds', '/v1/models', '/v1/projects']) {
    check(succeeded(await status('GET', path)), `GET ${path}`);
  }
  check((await status('GET', '/v1/does-not-exist')) === 404, 'unknown route 404');
  // A malformed body: the API logs validation failures at error level in development (Error Logs panels).
  check((await status('PUT', '/v1/projects/w36-invalid', { body: { name: '' } })) === 400, 'invalid body 400');
});

// ---------------------------------------------------------------------------------------------
await run('telemetry', async () => {
  const total = rounds * 5;
  for (let round = 0; round < total; round += 1) {
    if (round === Math.ceil(total / 2)) {
      // A counter's first scrape is its baseline, so increments sent before it never show in rate().
      // Pausing past two scrapes (tau-api scrape_interval is 5 s in infra/grafana/otelcol-config.yaml;
      // raise this with it) lets the second half register as an increase.
      await delay(12_000);
    }
    const failed = round % 4 === 3;
    const tauAgent = round % 2 === 0;
    const kernelId = (['replicad', 'openscad', 'build123d'] as const)[round % 3];
    const response = await call('POST', '/v1/telemetry/ingest', {
      body: {
        entries: [
          {
            name: 'observability.createGeometry',
            duration: random(80, 2500),
            detail: { status: failed ? 'error' : 'success' },
          },
          {
            name: 'observability.exportGeometry',
            duration: random(200, 4000),
            detail: { status: 'success', exportFormat: ['stl', 'step', 'glb'][round % 3] },
          },
          {
            name: 'observability.websocketReconnection',
            duration: random(300, 5000),
            detail: { attempt: 1 + (round % 3), reason: 'close' },
          },
          {
            name: 'observability.editorLoad',
            duration: random(400, 3000),
            detail: { kernel: ['openscad', 'replicad', 'jscad'][round % 3], fileCount: 1 + (round % 4) },
          },
          {
            name: 'observability.wasmModuleLoad',
            duration: random(150, 1800),
            detail: { module: ['replicad', 'openscad', 'occt'][round % 3], sizeBytes: 1_048_576 },
          },
          {
            name: 'observability.indexeddbOperation',
            duration: random(1, 40),
            detail: { operation: ['get', 'put'][round % 2], store: 'files' },
          },
          // Synthetic fixtures in the shape the UI and daemon send: they validate ingest to metrics, not agents.
          {
            name: 'agent.session',
            duration: random(1000, 60_000),
            detail: { agentId: ['tau', 'codex'][round % 2], placement: 'browser', outcome: 'started' },
          },
          {
            name: 'agent.turn',
            duration: random(2000, 40_000),
            detail: {
              agentId: ['tau', 'codex'][round % 2],
              placement: ['browser', 'daemon'][round % 2],
              // A turn refused before admission reports no first update, tools or usage.
              ...(failed
                ? { outcome: 'refused', errorCode: 'CLI_NOT_FOUND' }
                : {
                    outcome: 'completed',
                    timeToFirstUpdate: random(300, 3000),
                    // Tau's own tools carry their name; an ACP agent's rows carry only the kind.
                    toolCalls: tauAgent
                      ? [
                          { kind: 'edit', tool: 'edit_file', status: 'completed', count: 1 + (round % 3) },
                          { kind: 'execute', tool: 'evaluate_model', status: 'failed', count: 1 },
                          { kind: 'other', tool: 'use_skill', status: 'completed', count: 1 },
                        ]
                      : [{ kind: 'edit', status: 'completed', count: 1 + (round % 3) }],
                    tokens: { input: 1200, output: 300, cacheRead: 800, cacheWrite: 0 },
                    // Every series in the "Agent context" row: two lookup outcomes, an api_misuse evaluation,
                    // a correction and a GeoSpec run with both assertion results. Reference bytes are Tau's only.
                    context: {
                      kernelId,
                      skillsActivated: [`cad-${kernelId}`, 'geospec-authoring'],
                      callsBeforeFirstModelWrite: 2 + (round % 5),
                      timeToFirstModelWrite: random(8000, 90_000),
                      referenceLookups: [
                        { outcome: 'ok', count: 2 + (round % 3) },
                        { outcome: round % 2 === 0 ? 'zero_match' : 'not_found', count: 1 },
                      ],
                      ...(tauAgent ? { referenceBytesRead: Math.round(random(2000, 120_000)) } : {}),
                      evaluations: [
                        { class: 'api_misuse', count: 1 },
                        { class: 'ok', count: 1 + (round % 2) },
                      ],
                      correctionsAfterError: 1 + (round % 3),
                      geospec: {
                        runs: 2,
                        passed: 3 + (round % 3),
                        failed: 1,
                        runStatuses: [
                          { status: 'failed', count: 1 },
                          { status: 'passed', count: 1 },
                        ],
                      },
                    },
                  }),
            },
          },
          {
            name: 'observability.syncAttempt',
            duration: random(100, 2000),
            // `pending` is the queue depth when a push starts; `lagMilliseconds` belongs to an acknowledged push.
            detail:
              round % 2 === 0
                ? {
                    direction: 'push',
                    outcome: failed ? 'retry' : 'ok',
                    placement: 'browser',
                    pending: round % 3,
                    ...(failed ? {} : { lagMilliseconds: random(500, 4000) }),
                  }
                : { direction: 'pull', outcome: failed ? 'retry' : 'ok', placement: 'browser' },
          },
        ],
      },
    });
    check(response.status === 204, `telemetry ingest ${response.status}`);
  }
});

// ---------------------------------------------------------------------------------------------
const projectId = `w36-${Date.now().toString(36)}`;
const gitEnvironment: Record<string, string | undefined> = {
  PATH: process.env['PATH'],
  HOME: process.env['HOME'],
  GIT_TERMINAL_PROMPT: '0',
};
let tagRevision = '';
await run('sync', async () => {
  check(
    succeeded(await status('PUT', `/v1/projects/${projectId}`, { body: { name: 'W36 harness' } })),
    'register project',
  );
  const directory = mkdtempSync(join(tmpdir(), 'w36-sync-'));
  const git = (args: string[], cwd = join(directory, 'work'), expectRefused = false): string => {
    // The operator's own signing config must not prompt for a key in an unattended run, and the bearer is
    // scoped to the API: sent to a presigned object-store URL as well, S3 refuses the second auth mechanism.
    // Passed as GIT_CONFIG_* (read by git and git-lfs alike) rather than `-c`, so the token is not on argv.
    const config: Array<[string, string]> = [
      ['commit.gpgsign', 'false'],
      ['tag.gpgsign', 'false'],
      ['user.name', 'W36 harness'],
      ['user.email', email],
      [`http.${api.origin}/.extraHeader`, `Authorization: Bearer ${token}`],
    ];
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the child env excludes API-required ambient variables
      env: {
        ...gitEnvironment,
        GIT_CONFIG_COUNT: String(config.length),
        ...Object.fromEntries(
          config.flatMap(([key, value], index) => [
            [`GIT_CONFIG_KEY_${String(index)}`, key],
            [`GIT_CONFIG_VALUE_${String(index)}`, value],
          ]),
        ),
      } as unknown as NodeJS.ProcessEnv,
    });
    check(
      expectRefused ? result.status !== 0 : result.status === 0,
      `git ${args.join(' ')}${expectRefused ? ' should be refused' : ''}: ${result.stderr.trim().split('\n').slice(-3).join(' | ')}`,
    );
    return result.stdout.trim();
  };
  try {
    const remote = new URL(`/v1/git/${projectId}.git`, api).href;
    git(['init', '-q', '-b', 'main', 'work'], directory);
    git(['lfs', 'install', '--local']);
    git(['lfs', 'track', '*.bin']);
    writeFileSync(join(directory, 'work', 'main.scad'), 'cube([10, 20, 5]);\n');
    writeFileSync(join(directory, 'work', 'mesh.bin'), randomBytes(256 * 1024));
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'Harness bracket']);
    git(['remote', 'add', 'origin', remote]);
    git(['push', '-q', 'origin', 'main']);
    git(['tag', '-a', 'v1', '-m', 'Harness release']);
    git(['push', '-q', 'origin', 'v1']);
    tagRevision = git(['rev-parse', 'v1^{commit}']);
    for (let round = 0; round < rounds * 3; round += 1) {
      writeFileSync(join(directory, 'work', 'main.scad'), `cube([10, 20, ${6 + round}]);\n`);
      git(['commit', '-q', '-am', `Harness edit ${round}`]);
      git(['push', '-q', 'origin', 'main']);
    }
    git(['clone', '-q', remote, 'clone'], directory);
    git(['fetch', '-q', 'origin'], join(directory, 'clone'));
    // W36 D1: a diverged (non-fast-forward) push. The Hosted Remote is forward-only, so git refuses the ref
    // inside an HTTP 200 report-status; tau_sync_operations_total{outcome="ref_rejected"} is what shows it.
    git(['reset', '-q', '--hard', 'HEAD~1']);
    writeFileSync(join(directory, 'work', 'main.scad'), 'sphere(5);\n');
    git(['commit', '-q', '-am', 'Harness divergence']);
    git(['push', '-q', '--force', 'origin', 'main'], join(directory, 'work'), true);
    check(succeeded(await status('GET', `/v1/projects/${projectId}/usage`)), 'project usage');
    check(succeeded(await status('GET', '/v1/revisions/salt?workspace=w36')), 'revision salt');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
await run('publications', async () => {
  if (tagRevision === '') {
    check(false, 'needs the sync phase tag');
    return;
  }
  const created = await call('POST', '/v1/publications', {
    body: {
      projectId,
      projectName: 'W36 harness',
      tag: 'v1',
      revisionId: tagRevision,
      entryPath: 'main.scad',
      visibility: 'private',
      title: 'W36 harness publication',
      sharedEmails: ['w36-reader@example.test'],
      notifyRecipients: true,
    },
  });
  check(created.status === 201, `publish ${created.status}`);
  const { id } = (await created.json()) as { id: string };
  check((await status('PATCH', `/v1/publications/${id}/views`, { auth: false })) === 204, 'anonymous view');
  check((await status('PATCH', `/v1/publications/${id}/views`, { auth: false })) === 204, 'duplicate view');
  await call('PATCH', `/v1/publications/${id}/views`);
  await call('PATCH', `/v1/publications/does-not-exist/views`, { auth: false });
  const file = await call('GET', `/v1/publications/${id}/files?path=main.scad`);
  check(file.ok, `owner file ${file.status}`);
  const etag = file.headers.get('etag');
  if (etag) {
    check(
      (await status('GET', `/v1/publications/${id}/files?path=main.scad`, { headers: { 'if-none-match': etag } })) ===
        304,
      'revalidated file',
    );
  }
  check(
    (await status('GET', `/v1/publications/${id}/files?path=main.scad`, { auth: false })) === 401,
    'anonymous file denied',
  );
  await call('GET', `/v1/publications/does-not-exist/files?path=main.scad`);
});

// ---------------------------------------------------------------------------------------------
type Balance = Record<
  'promoGrantCreditAtoms' | 'planGrantCreditAtoms' | 'purchasedCreditAtoms' | 'debtCreditAtoms',
  string
>;
const creditBalance = async (): Promise<number> => {
  const { balance } = await json<{ balance: Balance }>('GET', '/v1/billing/credits');
  return (
    Number(balance.promoGrantCreditAtoms) +
    Number(balance.planGrantCreditAtoms) +
    Number(balance.purchasedCreditAtoms) -
    Number(balance.debtCreditAtoms)
  );
};
await run('ai', async () => {
  const before = await creditBalance();
  const prompts = [
    'In one sentence, what is a fillet in CAD?',
    'Name three common 3D printing file formats, comma-separated.',
    'What wall thickness would you suggest for a small PLA bracket? One sentence.',
  ];
  const tools = [
    {
      name: 'set_parameter',
      description: 'Set a named numeric CAD parameter.',
      input_schema: {
        type: 'object',
        properties: { name: { type: 'string' }, value: { type: 'number' } },
        required: ['name', 'value'],
      },
    },
  ];
  for (let index = 0; index < aiCalls; index += 1) {
    const withTool = index % 2 === 1;
    const response = await call('POST', '/v1/llm/anthropic/v1/messages', {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-tau-attempt-id': `w36-${randomUUID()}`,
        'x-tau-project-id': projectId,
      },
      body: {
        model: 'anthropic-claude-haiku-4.5',
        max_tokens: 200,
        stream: true,
        ...(withTool
          ? { tools, messages: [{ role: 'user', content: 'Set the wall_thickness parameter to 2.4 using the tool.' }] }
          : { messages: [{ role: 'user', content: prompts[index % prompts.length] }] }),
      },
    });
    const text = await response.text();
    check(response.ok && text.includes('message_stop'), `Haiku call ${index + 1}: ${response.status}`);
  }
  // Refusals and lookups: an unknown model, an attempt looked up before it was ever sent (voided), then sent.
  const badModel = await call('POST', '/v1/llm/anthropic/v1/messages', {
    headers: { 'anthropic-version': '2023-06-01', 'x-tau-attempt-id': `w36-${randomUUID()}` },
    body: { model: 'not-a-model', max_tokens: 10, stream: true, messages: [{ role: 'user', content: 'hi' }] },
  });
  check(badModel.status === 400, `unknown model answers 400 (got ${badModel.status})`);
  const voided = `w36-voided-${randomUUID()}`;
  check(succeeded(await status('GET', `/v1/billing/attempts/gateway/${voided}`)), 'attempt lookup');
  const late = await call('POST', '/v1/llm/anthropic/v1/messages', {
    headers: { 'anthropic-version': '2023-06-01', 'x-tau-attempt-id': voided },
    body: {
      model: 'anthropic-claude-haiku-4.5',
      max_tokens: 10,
      stream: true,
      messages: [{ role: 'user', content: 'hi' }],
    },
  });
  check(late.status === 409, `voided attempt answers 409 (got ${late.status})`);
  const after = await creditBalance();
  phase.notes.push(`user-charged spend ${((before - after) / 1e6).toFixed(4)} USD (${aiCalls} Haiku calls)`);
});

// ---------------------------------------------------------------------------------------------
const socket = async (path: string, credential: string, first?: unknown): Promise<number> =>
  new Promise((resolve) => {
    const ws = new WebSocket(`${wsOrigin}${path}`, {
      headers: { authorization: `Bearer ${credential}` },
      // Node's WebSocket (undici) takes connection headers; the DOM constructor type does not declare them.
    } as unknown as string[]);
    const timer = setTimeout(() => {
      ws.close(1000);
    }, 3000);
    ws.addEventListener('open', () => {
      if (first !== undefined) {
        ws.send(JSON.stringify(first));
      }
    });
    ws.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve(event.code);
    });
  });
await run('websockets', async () => {
  const pairing = await json<{ deviceCode: string; userCode: string }>('POST', '/v1/agents/pairings', {
    auth: false,
    body: { deviceLabel: 'w36-harness' },
  });
  check(
    (await status('POST', '/v1/agents/pairings/approve', { body: { userCode: pairing.userCode } })) === 204,
    'approve pairing',
  );
  const device = await json<{ deviceId: string; credential: string }>('POST', '/v1/agents/pairings/token', {
    auth: false,
    body: { deviceCode: pairing.deviceCode },
  });
  check(Boolean(device.credential), 'device credential');
  for (let round = 0; round < rounds * 2; round += 1) {
    const code = await socket('/v1/agents/control', device.credential, {
      v: 1,
      type: 'ready',
      deviceId: device.deviceId,
      runtimeVersion: '0.0.0',
      capacity: 1,
    });
    check(code === 1000 || code === 1005, `host control socket closed ${code}`);
  }
  check((await socket('/v1/agents/control', 'not-a-credential')) === 4401, 'bad device credential closes 4401');
  const kernel = await socket('/v1/kernels/zoo', token);
  phase.notes.push(`kernels/zoo closed ${kernel}`);
});

// ---------------------------------------------------------------------------------------------
console.log('\nSummary');
for (const { name, ok, failed, notes } of phases) {
  console.log(
    `${failed === 0 ? '✓' : '✗'} ${name.padEnd(13)} ${ok} ok, ${failed} failed${notes.length > 0 ? ` — ${notes.join('; ')}` : ''}`,
  );
}
process.exit(phases.some(({ failed }) => failed > 0) ? 1 : 0);
