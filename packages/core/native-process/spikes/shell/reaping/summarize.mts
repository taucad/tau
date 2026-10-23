/**
 * Render the reaping-spike receipts as a GitHub step-summary. Read-only over the evidence directory;
 * a missing receipt is reported, never silently passed.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const mark = (v: string): string => (v === 'pass' ? '✅' : v === 'blocked' ? '🚧' : '❌');

const lines: string[] = [];
if (!existsSync(evidenceDirectory)) {
  process.stdout.write('## Reaping spike — no evidence directory (probe failed before any receipt)\n');
  process.exit(0);
}

type Receipt = {
  strategy?: string;
  adversary?: string;
  verdict: string;
  status?: string;
  blocked?: boolean;
  blocker?: string;
  canary?: { startedBytes: number; beforeCancel: number; afterCancel: number; afterSettle: number };
  identity?: { os?: { platform?: string; arch?: string; build?: string }; helpers?: Record<string, string> };
  checks?: Array<{ id: string; expect: string; observed: string; verdict: string }>;
};

for (const rowDir of readdirSync(evidenceDirectory)) {
  const dir = join(evidenceDirectory, rowDir);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  lines.push(`## Reaping spike — ${rowDir}`, '');
  const pre = files.includes('preflight.json')
    ? (JSON.parse(readFileSync(join(dir, 'preflight.json'), 'utf8')) as Receipt)
    : undefined;
  if (pre?.identity?.os) {
    lines.push(
      `- OS: ${pre.identity.os.platform} ${pre.identity.os.arch} — ${pre.identity.os.build ?? '?'}`,
      `- Helpers: setasid=${pre.identity.helpers?.['setasid'] ?? '?'} · enum=${pre.identity.helpers?.['asidEnum'] ?? '?'} · ${pre.identity.helpers?.['clang'] ?? '?'}`,
      '',
    );
  }
  if (pre) {
    lines.push(`- Preflight: ${mark(pre.verdict)} ${pre.verdict}`, '');
  }

  lines.push('| strategy \\ adversary | setsid | daemonize | sigterm-ignore |', '| --- | --- | --- | --- |');
  for (const strategy of ['group', 'walk', 'asid']) {
    const cell = (adv: string): string => {
      const f = `${strategy}.${adv}.json`;
      if (!files.includes(f)) {
        return '—';
      }
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Receipt;
      const state = r.blocked ? 'blocked' : r.verdict;
      const c = r.canary;
      return `${mark(state)} ${state}<br/>${c ? `${c.afterCancel}→${c.afterSettle}B` : ''}`;
    };
    lines.push(`| ${strategy} | ${cell('setsid')} | ${cell('daemonize')} | ${cell('sigterm-ignore')} |`);
  }
  lines.push('');

  for (const f of files.sort()) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Receipt;
    if (r.blocker) {
      lines.push(`- \`${f}\` blocker: ${r.blocker}`);
    }
    const fails = (r.checks ?? []).filter((c) => c.verdict !== 'pass' && !r.blocked);
    for (const fail of fails) {
      lines.push(`- \`${fail.id}\` — expected ${fail.expect}; observed: ${fail.observed.slice(0, 220)}`);
    }
  }
  lines.push('');
}
process.stdout.write(`${lines.join('\n')}\n`);
