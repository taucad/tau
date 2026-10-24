/**
 * Summarize one native S3 row's drop for the job summary and gate it: every planned run must have finished and
 * written its suites, and every screen-reader result must have actually run. A row whose reader was unavailable
 * stays red with its typed reason; it is never reported as a pass.
 *
 * Usage: node summarize.mts <drop> [--sets <all|set,set>] <label>=<suite,suite> ...
 * `--sets` gates only the planned labels that were dispatched; `r01-diag` selects every `r01-diag-*` label, which
 * `all` leaves out.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [drop, ...rest] = process.argv.slice(2);
const setsAt = rest.indexOf('--sets');
const sets = (setsAt === -1 ? 'all' : (rest.splice(setsAt, 2)[1] ?? 'all')).replaceAll(/\s/g, '');
const selected = (label: string): boolean => {
  const diagnostic = label.startsWith('r01-diag-');
  if (sets === 'all') {
    return !diagnostic;
  }
  const names = sets.split(',');
  return names.includes(label) || (diagnostic && names.includes('r01-diag'));
};
if (!drop || rest.length === 0) {
  throw new Error('Usage: summarize.mts <drop> [--sets <all|set,set>] <label>=<suite,suite> ...');
}
const plans = rest.filter((plan) => selected(plan.split('=')[0]!));
if (plans.length === 0) {
  process.stdout.write(`### ${path.basename(drop)}: no planned set selected by --sets ${sets}\n`);
  process.exit(0);
}
const lines: string[] = [];
let failed = false;
const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    return undefined;
  }
};
const environment = (await readJson(path.join(drop, plans[0]!.split('=')[0]!, 'environment.json'))) as
  | Partial<Record<'host' | 'osRelease' | 'gpuLabel', string>>
  | undefined;
lines.push(
  `### ${environment?.host ?? path.basename(drop)}: ${environment?.osRelease ?? 'unknown OS'}, ${environment?.gpuLabel ?? 'unlabelled GPU'}`,
);
const entries = plans.flatMap((plan) => {
  const [label, suites] = plan.split('=') as [string, string];
  return suites.split(',').map((suite) => ({ label, suite }));
});
const results = await Promise.all(
  entries.map(async ({ label, suite }) => readJson(path.join(drop, label, `${suite}.json`))),
);
for (const [index, { label, suite }] of entries.entries()) {
  const result = results[index] as { durationMs: number; result: unknown } | undefined;
  if (!result) {
    failed = true;
    lines.push(`- ${label}/${suite}: **missing**`);
    continue;
  }
  const readers = Array.isArray(result.result)
    ? (
        result.result as Array<{
          kind?: string;
          status?: string;
          reason?: string;
          receipts?: Array<{ speech?: string[]; spoken?: string[] }>;
        }>
      ).filter((entry) => entry.status ?? entry.receipts)
    : [];
  // A reader that ran but left no speech in any step is a capture failure, not a result.
  const silent = (entry: (typeof readers)[number]): boolean =>
    entry.receipts?.every((receipt) => [...(receipt.speech ?? []), ...(receipt.spoken ?? [])].every((text) => !text)) ??
    false;
  const notRun = readers
    .map((entry) =>
      (entry.status === undefined || entry.status === 'ran') && silent(entry)
        ? { ...entry, status: 'silent', reason: 'no speech captured in any step' }
        : entry,
    )
    .filter((entry) => entry.status !== undefined && entry.status !== 'ran');
  if (notRun.length > 0) {
    failed = true;
  }
  lines.push(
    `- ${label}/${suite}: ${Math.round(result.durationMs / 1000)} s${notRun.map((entry) => `; ${entry.kind} ${entry.status}: ${entry.reason ?? ''}`).join('')}`,
  );
}
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = failed ? 1 : 0;
