/**
 * Fold the W2 MXC receipts into a Markdown summary for GITHUB_STEP_SUMMARY, and GATE the row.
 *
 * Honest about typed states: a prerequisite-absent receipt prints as a failed row with its reason,
 * never as a pass and never omitted. This step is also the single gate: it exits nonzero if any
 * REQUIRED receipt is missing or not pass, or if any OPTIONAL receipt that WAS produced is not pass.
 * On hosted windows-2025 the probe receipt is a typed-unavailable fail (PSEC absent), so the row
 * stays RED by design — that red is the intended evidence; the D14 ShellIdentity / grammar / PTY
 * receipts are still collected and green.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { outDir } from './mxc-lib.mts';

type Check = { id: string; expect: string; observed: string; verdict: 'pass' | 'fail'; detail?: unknown };
type Receipt = {
  kind?: string;
  verdict?: string;
  checks?: Check[];
  identity?: Record<string, unknown>;
  conclusion?: string;
};

const read = (name: string): Receipt | undefined => {
  const path = join(outDir(), name);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Receipt) : undefined;
};

const icon = (v?: string): string => (v === 'pass' ? '✅' : '❌');

const lines: string[] = ['## Spike W2 — Windows MXC processcontainer + D14 PowerShell shell', ''];

const provision = read('provision.receipt.json');
const identity = (provision?.identity ??
  read('shell-identity.receipt.json')?.identity ??
  read('probe.receipt.json')?.identity) as
  | { mxc?: { sdk?: Record<string, unknown> }; os?: Record<string, unknown>; source?: Record<string, unknown> }
  | undefined;

if (identity?.mxc?.sdk) {
  const sdk = identity.mxc.sdk;
  lines.push(
    `**MXC SDK** \`${String(sdk['name'])}@${String(sdk['installedVersion'])}\` (pinned \`${String(sdk['pinnedVersion'])}\`, licence ${String(sdk['license'])})  `,
    `**OS build** ${String(identity.os?.['build'] ?? 'unknown')} · **user SID** ${String(identity.os?.['userSid'] ?? 'unknown')}  `,
    `**Source** ${String(identity.source?.['run'] ?? 'local')}`,
    '',
  );
}

// kind: receipt file; required rows must exist and pass; optional rows gate only when produced.
const rows: { label: string; file: string; required: boolean }[] = [
  { label: 'Provision', file: 'provision.receipt.json', required: true },
  { label: 'D14 ShellIdentity', file: 'shell-identity.receipt.json', required: true },
  { label: 'T02-pwsh grammar', file: 'grammar.receipt.json', required: true },
  { label: 'PTY (ConPTY + PowerShell)', file: 'pty.receipt.json', required: true },
  { label: 'Capability probe', file: 'probe.receipt.json', required: true },
  { label: 'Two-container isolation', file: 'isolation.receipt.json', required: false },
];

let gateFail = false;
for (const row of rows) {
  const receipt = read(row.file);
  if (!receipt) {
    if (row.required) {
      lines.push(`### ${row.label}: ❌ not produced (required step did not run)`, '');
      gateFail = true;
    } else {
      lines.push(`### ${row.label}: ⚠️ not produced (skipped — e.g. PSEC absent)`, '');
    }
    continue;
  }
  if (receipt.verdict !== 'pass') {
    gateFail = true;
  }
  lines.push(`### ${row.label}: ${icon(receipt.verdict)} ${receipt.verdict ?? 'unknown'}`, '');
  if (receipt.conclusion) {
    lines.push(`> ${receipt.conclusion}`, '');
  }
  lines.push('| check | expect | observed | verdict |', '| --- | --- | --- | --- |');
  for (const c of receipt.checks ?? []) {
    lines.push(`| \`${c.id}\` | ${c.expect} | ${c.observed} | ${icon(c.verdict)} |`);
  }
  lines.push('');
}

// eslint-disable-next-line no-console
console.log(lines.join('\n'));
if (gateFail) {
  process.exitCode = 1;
}
