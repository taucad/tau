/**
 * Summarize one native S3 row's drop for the job summary and gate it: every planned run must have finished and
 * written its suites, and every screen-reader result must have actually run. A row whose reader was unavailable
 * stays red with its typed reason; it is never reported as a pass.
 *
 * Usage: node summarize.mts <drop> <label>=<suite,suite> ...
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [drop, ...plans] = process.argv.slice(2);
if (!drop || plans.length === 0) {
  throw new Error('Usage: summarize.mts <drop> <label>=<suite,suite> ...');
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
  | Record<string, unknown>
  | undefined;
lines.push(
  `### ${String(environment?.['host'] ?? path.basename(drop))}: ${String(environment?.['osRelease'] ?? 'unknown OS')}, ${String(environment?.['gpuLabel'] ?? 'unlabelled GPU')}`,
);
for (const plan of plans) {
  const [label, suites] = plan.split('=') as [string, string];
  for (const suite of suites.split(',')) {
    const result = (await readJson(path.join(drop, label, `${suite}.json`))) as
      | { durationMs: number; result: unknown }
      | undefined;
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
          }>
        ).filter((entry) => entry.status)
      : [];
    const notRun = readers.filter((entry) => entry.status !== 'ran');
    if (notRun.length > 0) {
      failed = true;
    }
    lines.push(
      `- ${label}/${suite}: ${Math.round(result.durationMs / 1000)} s${notRun.map((entry) => `; ${entry.kind} ${entry.status}: ${entry.reason ?? ''}`).join('')}`,
    );
  }
}
process.stdout.write(`${lines.join('\n')}\n`);
process.exitCode = failed ? 1 : 0;
