/**
 * Fold the W2 MXC receipts into a Markdown summary for GITHUB_STEP_SUMMARY. Honest about typed
 * states: a prerequisite-absent receipt prints as a failed row with its reason, never as a pass and
 * never omitted. Reads whatever receipts exist in TAU_SPIKE_OUT; missing receipts are reported as
 * "not produced" (a run that never got there), not silently skipped.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { outDir } from './mxc-lib.mts';

type Check = { id: string; expect: string; observed: string; verdict: 'pass' | 'fail'; detail?: unknown };
type Receipt = { kind?: string; verdict?: string; checks?: Check[]; identity?: Record<string, unknown> };

const read = (name: string): Receipt | undefined => {
  const path = join(outDir(), name);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Receipt) : undefined;
};

const icon = (v?: string): string => (v === 'pass' ? '✅' : '❌');

const lines: string[] = ['## Spike W2 — Windows MXC processcontainer S1 isolation', ''];

const provision = read('provision.receipt.json');
const identity = (provision?.identity ?? read('probe.receipt.json')?.identity) as
  | {
      mxc?: { sdk?: Record<string, unknown>; wxcExec?: unknown };
      os?: Record<string, unknown>;
      source?: Record<string, unknown>;
    }
  | undefined;

if (identity?.mxc?.sdk) {
  const sdk = identity.mxc.sdk;
  lines.push(
    `**MXC SDK** \`${String(sdk['name'])}@${String(sdk['installedVersion'])}\` (pinned \`${String(sdk['pinnedVersion'])}\`, licence ${String(sdk['license'])})  `,
    `**Integrity** \`${String(sdk['integrity']).slice(0, 24)}…\`  `,
    `**OS build** ${String(identity.os?.['build'] ?? 'unknown')}  `,
    `**Source** ${String(identity.source?.['run'] ?? 'local')}`,
    '',
  );
}

for (const [label, name] of [
  ['Provision', 'provision.receipt.json'],
  ['Capability probe', 'probe.receipt.json'],
  ['Two-container isolation', 'isolation.receipt.json'],
  ['Capability-SID fallback', 'fallback.receipt.json'],
] as const) {
  const receipt = read(name);
  if (!receipt) {
    lines.push(`### ${label}: ⚠️ not produced (run did not reach this step)`, '');
    continue;
  }
  lines.push(
    `### ${label}: ${icon(receipt.verdict)} ${receipt.verdict ?? 'unknown'}`,
    '',
    '| check | expect | observed | verdict |',
    '| --- | --- | --- | --- |',
  );
  for (const c of receipt.checks ?? []) {
    lines.push(`| \`${c.id}\` | ${c.expect} | ${c.observed} | ${icon(c.verdict)} |`);
  }
  lines.push('');
}

// eslint-disable-next-line no-console
console.log(lines.join('\n'));
