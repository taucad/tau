/**
 * Render the reaping-spike receipts as a GitHub step-summary. Read-only over the evidence directory;
 * a missing receipt is reported, never silently passed. Strategies and adversaries are discovered
 * from the receipt files present, so the baseline probe (group/walk/asid × setsid/daemonize/
 * sigterm-ignore) and the follow-up candidates (resp/kqtrack × …/double-fork) render in one table.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const evidenceDirectory = process.env['TAU_SPIKE_OUT'] ?? join(process.cwd(), 'out', 'research', 'reaping-spike');
const mark = (v: string): string => (v === 'pass' ? '✅' : v === 'blocked' ? '🚧' : '❌');

// Preferred column/row order; anything else is appended in discovery order so nothing is hidden.
const STRATEGY_ORDER = ['group', 'walk', 'asid', 'resp', 'kqtrack', 'sbmember'];
const ADVERSARY_ORDER = ['setsid', 'daemonize', 'double-fork', 'sigterm-ignore'];
const ordered = (seen: Set<string>, pref: string[]): string[] => [
  ...pref.filter((x) => seen.has(x)),
  ...[...seen].filter((x) => !pref.includes(x)).sort(),
];

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

  for (const name of ['preflight.json', 'preflight-candidates.json', 'preflight-sandbox.json']) {
    if (!files.includes(name)) {
      continue;
    }
    const pre = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Receipt;
    if (name === 'preflight.json' && pre.identity?.os) {
      lines.push(`- OS: ${pre.identity.os.platform} ${pre.identity.os.arch} — ${pre.identity.os.build ?? '?'}`, '');
    }
    if (pre.identity?.helpers) {
      const helpers = Object.entries(pre.identity.helpers)
        .map(([k, v]) => `${k}=${v === 'absent' ? 'absent' : 'built'}`)
        .join(' · ');
      lines.push(`- Helpers (${name}): ${helpers}`);
    }
    lines.push(`- ${name}: ${mark(pre.verdict)} ${pre.verdict}`, '');
  }

  // S2 interactive-PTY receipt (PTY run inside the session.sb Seatbelt containment).
  if (files.includes('s2.json')) {
    const s2 = JSON.parse(readFileSync(join(dir, 's2.json'), 'utf8')) as Receipt;
    lines.push(`- S2 PTY in sandbox: ${mark(s2.verdict)} ${s2.verdict}`);
    for (const c of s2.checks ?? []) {
      lines.push(`  - ${mark(c.verdict)} \`${c.id}\` — ${c.observed.slice(0, 180)}`);
    }
    lines.push('');
  }

  // Discover the strategies and adversaries present from the `<strategy>.<adversary>.json` receipts.
  const cells = new Map<string, Receipt>();
  const strategiesSeen = new Set<string>();
  const adversariesSeen = new Set<string>();
  for (const f of files) {
    if (f.startsWith('preflight') || f.startsWith('matrix')) {
      continue;
    }
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Receipt;
    if (!r.strategy || !r.adversary) {
      continue;
    }
    cells.set(`${r.strategy}.${r.adversary}`, r);
    strategiesSeen.add(r.strategy);
    adversariesSeen.add(r.adversary);
  }
  const strategies = ordered(strategiesSeen, STRATEGY_ORDER);
  const adversaries = ordered(adversariesSeen, ADVERSARY_ORDER);

  if (strategies.length > 0) {
    lines.push(
      `| strategy \\ adversary | ${adversaries.join(' | ')} |`,
      `| --- | ${adversaries.map(() => '---').join(' | ')} |`,
    );
    for (const strategy of strategies) {
      const cell = (adv: string): string => {
        const r = cells.get(`${strategy}.${adv}`);
        if (!r) {
          return '—';
        }
        const state = r.blocked ? 'blocked' : r.verdict;
        const c = r.canary;
        return `${mark(state)} ${state}<br/>${c ? `${c.afterCancel}→${c.afterSettle}B` : ''}`;
      };
      lines.push(`| ${strategy} | ${adversaries.map((a) => cell(a)).join(' | ')} |`);
    }
    lines.push('');
  }

  for (const f of files.sort()) {
    if (f.startsWith('matrix')) {
      continue;
    }
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
