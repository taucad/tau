#!/usr/bin/env node
/**
 * Admit the focused CI database fixtures and prove every selected case executed.
 * Why: optional database suites otherwise skip successfully; global dispatch/LFS
 * scans must operate only on a fresh isolated CI fixture, never shared data.
 * Required preflight environment: GITHUB_ACTIONS, DATABASE_URL, TAU_CLOUD_ENABLED,
 * TAU_S3_ENDPOINT, TAU_S3_REGION, TAU_S3_ACCESS_KEY_ID, TAU_S3_SECRET_ACCESS_KEY,
 * TAU_S3_FORCE_PATH_STYLE, TAU_S3_BUCKET, TAU_S3_PRIVATE_BUCKET, TAU_S3_PUBLIC_BASE_URL.
 * These must equal the existing public localhost CI fixtures; values are not logged.
 * Admission requires no environment. No optional environment is supported.
 * Usage: node apps/api/scripts/qualify-db-fixtures.mts preflight
 *        node apps/api/scripts/qualify-db-fixtures.mts admit out/reports/api-focused-db.json
 * Exit0: qualified. Exit1: invalid input, unavailable fixture, or failed admission.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import postgres from 'postgres';
import { z } from 'zod';

const repoRoot = resolve(import.meta.dirname, '../../..');
const reportSchema = z.object({
  success: z.boolean(),
  numTotalTests: z.number().int(),
  numPassedTests: z.number().int(),
  numFailedTests: z.number().int(),
  numPendingTests: z.number().int(),
  numTodoTests: z.number().int().optional(),
  testResults: z.array(
    z.object({ name: z.string(), status: z.string(), assertionResults: z.array(z.object({ status: z.string() })) }),
  ),
});
const expected = new Map([
  ['app/api/jobs/jobs.service.integration.test.ts', 2],
  ['app/api/durable-events/durable-events.revision-stream.test.ts', 6],
  ['app/api/git/lfs-retirement.test.ts', 12],
]);
class FixtureGuardError extends Error {}
let qualificationPhase = 'arguments';
const diagnosticCodes = new Set([
  '42P01',
  '42703',
  '42601',
  '42501',
  '28P01',
  '3D000',
  '08001',
  '08006',
  '53300',
  '57014',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
]);
const insist = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new FixtureGuardError(message);
  }
};
async function preflight(): Promise<void> {
  qualificationPhase = 'raw-environment';
  // ProcessEnv includes parsed API types; this executable must validate raw Node environment strings.
  const environment = new Map(z.array(z.tuple([z.string(), z.string()])).parse(Object.entries(process.env)));
  insist(environment.get('GITHUB_ACTIONS') === 'true', 'Only the isolated Actions API service lane is admitted.');
  insist(environment.get('TAU_CLOUD_ENABLED') === 'false', 'Cloud execution must be disabled.');
  qualificationPhase = 'fixture-url';
  const database = new URL(environment.get('DATABASE_URL') ?? '');
  insist(
    database.protocol === 'postgresql:' &&
      database.hostname === 'localhost' &&
      database.port === '5432' &&
      database.pathname === '/tau_dev' &&
      database.username === 'dev_user' &&
      database.password === 'dev_password' &&
      database.search === '' &&
      database.hash === '',
    'Database is not the exact public local CI fixture.',
  );
  qualificationPhase = 'fixture-values';
  const fixtures = new Map([
    ['TAU_S3_ENDPOINT', 'http://localhost:9000'],
    ['TAU_S3_REGION', 'us-east-1'],
    ['TAU_S3_ACCESS_KEY_ID', 'tau-api'],
    ['TAU_S3_SECRET_ACCESS_KEY', 'tau-api-dev-secret'],
    ['TAU_S3_FORCE_PATH_STYLE', 'true'],
    ['TAU_S3_BUCKET', 'tau-content'],
    ['TAU_S3_PRIVATE_BUCKET', 'tau-content-private'],
    ['TAU_S3_PUBLIC_BASE_URL', 'http://localhost:9000/tau-content'],
  ]);
  for (const [key, value] of fixtures) {
    insist(environment.get(key) === value, `Local object-store fixture mismatch: ${key}`);
  }
  qualificationPhase = 'database-client';
  const sql = postgres(database.href, {
    max: 1,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- postgres.js option name
    connect_timeout: 5,
    prepare: false,
  });
  let failedPhase: string | undefined;
  try {
    qualificationPhase = 'database-identity';
    const [identity] = await sql`select current_database() as database, current_user as role`;
    insist(
      z.object({ database: z.literal('tau_dev'), role: z.literal('dev_user') }).safeParse(identity).success,
      'Connected database identity mismatch.',
    );
    qualificationPhase = 'outbox-empty';
    const [queue] = await sql`select count(*)::integer as count from job_dispatch_outbox`;
    insist(
      z.object({ count: z.literal(0) }).safeParse(queue).success,
      'Dispatch outbox is not empty; refusing an unscoped claim test.',
    );
    // The retireDueLfsObjects query scans project_git_lfs_object joined to project.
    // Retirement also reads/updates project_git. Require ALL rows absent.
    qualificationPhase = 'lfs-empty';
    const [lfs] = await sql`select
      (select count(*)::integer from project_git_lfs_object) as objects,
      (select count(*)::integer from project) as projects,
      (select count(*)::integer from project_git) as repositories`;
    insist(
      z.object({ objects: z.literal(0), projects: z.literal(0), repositories: z.literal(0) }).safeParse(lfs).success,
      'LFS/project tables are not empty; refusing globally scanning fixtures.',
    );
  } catch (error) {
    failedPhase = qualificationPhase;
    throw error;
  } finally {
    qualificationPhase = 'database-close';
    try {
      await sql.end();
    } finally {
      if (failedPhase !== undefined) {
        qualificationPhase = failedPhase;
      }
    }
  }
  console.log('Exact local database/object-store fixture configuration and empty outbox verified.');
}
function admit(filename: string): void {
  qualificationPhase = 'report-admission';
  const report = reportSchema.parse(JSON.parse(readFileSync(resolve(repoRoot, filename), 'utf8')));
  insist(
    report.success &&
      report.numTotalTests === 20 &&
      report.numPassedTests === 20 &&
      report.numFailedTests === 0 &&
      report.numPendingTests === 0 &&
      (report.numTodoTests ?? 0) === 0,
    'Expected exactly20 passed cases with zero failed/pending/todo.',
  );
  insist(Array.isArray(report.testResults) && report.testResults.length === 3, 'Expected exactly3 suite files.');
  const seen = new Set();
  for (const suite of report.testResults) {
    const name = suite.name.replaceAll('\\', '/');
    const key = [...expected.keys()].find((path) => name.endsWith('/' + path));
    insist(key !== undefined && !seen.has(key), 'Unexpected or duplicate suite path.');
    if (key === undefined) {
      throw new FixtureGuardError('Unexpected suite path.');
    }
    seen.add(key);
    insist(
      suite.status === 'passed' &&
        suite.assertionResults.length === expected.get(key) &&
        suite.assertionResults.every((result) => result.status === 'passed'),
      'A required suite skipped, failed or changed its case count.',
    );
  }
  console.log('All3 required suites executed:2 Jobs+6revision+12LFS=20PASS,0skip.');
}
const main = async (): Promise<void> => {
  if (process.argv[2] === 'preflight') {
    await preflight();
  } else if (process.argv[2] === 'admit' && process.argv[3]) {
    admit(process.argv[3]);
  } else {
    throw new FixtureGuardError('Expected preflight or admit <report.json>.');
  }
};
try {
  await main();
} catch (error) {
  const diagnostic = z.object({ code: z.string() }).safeParse(error);
  const code = diagnostic.success && diagnosticCodes.has(diagnostic.data.code) ? diagnostic.data.code : 'unclassified';
  console.error(
    error instanceof FixtureGuardError
      ? error.message
      : `Focused database fixture qualification failed during ${qualificationPhase} (${code}).`,
  );
  process.exit(1);
}
