/**
 * Render the row's S0–S2 receipts as a GitHub step-summary table. Read-only over the evidence
 * directory; absence of a receipt is itself reported, never silently passed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'shell-spike');
const mark = (verdict: string): string => (verdict === 'pass' ? '✅' : '❌');

type Receipt = {
  spike: string;
  status?: string;
  verdict: string;
  strategy?: string;
  checks?: Array<{ id: string; expect: string; observed: string; verdict: string }>;
};

const lines: string[] = [];
if (!existsSync(evidenceDirectory)) {
  lines.push('## Shell spike — no evidence directory produced (sandbox or launch failed before any receipt)');
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exit(0);
}

for (const row of readdirSync(evidenceDirectory)) {
  const directory = join(evidenceDirectory, row);
  lines.push(`## Shell spike — ${row}`, '');
  const identityFile = ['s0.json', 's1.json', 's2-direct.json']
    .map((f) => join(directory, f))
    .find((f) => existsSync(f));
  if (identityFile) {
    const { identity } = JSON.parse(readFileSync(identityFile, 'utf8')) as {
      identity?: Record<string, { version?: string; build?: string; platform?: string; arch?: string }> & {
        bash?: { version?: string; origin?: string };
        provider?: { version?: string };
        nodePty?: { version?: string } | null;
      };
    };
    if (identity) {
      lines.push(
        `- OS: ${identity['os']?.platform} ${identity['os']?.arch} — ${identity['os']?.build ?? '?'}`,
        `- Sandbox runtime: ${identity['provider']?.version ?? '?'} · Bash: ${identity['bash']?.version ?? '?'} (${identity['bash']?.origin ?? '?'}) · node-pty: ${(identity['nodePty'] as { version?: string } | null)?.version ?? 'absent'}`,
        '',
      );
    }
  }
  lines.push('| Spike | Verdict | Checks (pass/total) | Status |', '| --- | --- | --- | --- |');
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const receipt = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Receipt;
    const total = receipt.checks?.length ?? 0;
    const passed = receipt.checks?.filter((c) => c.verdict === 'pass').length ?? 0;
    lines.push(
      `| ${file.replace('.json', '')} | ${mark(receipt.verdict)} ${receipt.verdict} | ${passed}/${total} | ${receipt.status ?? 'ran'} |`,
    );
  }
  lines.push('');
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const receipt = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Receipt;
    const failures = receipt.checks?.filter((c) => c.verdict !== 'pass') ?? [];
    if (failures.length > 0) {
      lines.push(`<details><summary>${file} failures</summary>`, '');
      for (const failure of failures) {
        lines.push(`- \`${failure.id}\` — expected ${failure.expect}; observed: ${failure.observed.slice(0, 200)}`);
      }
      lines.push('', '</details>', '');
    }
  }
}
process.stdout.write(`${lines.join('\n')}\n`);
