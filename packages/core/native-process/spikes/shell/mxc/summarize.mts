/**
 * Fold the W2 MXC receipts into a Markdown summary for GITHUB_STEP_SUMMARY, and GATE the row.
 *
 * Honest about typed states: a prerequisite-absent receipt prints as a failed row with its reason,
 * never as a pass and never omitted. This step is also the single gate: it exits nonzero if any
 * REQUIRED receipt is missing or not pass, if any OPTIONAL receipt that WAS produced is not pass, OR
 * if any receipt FAILS RECEIPT INTEGRITY — its prose narrative disagreeing with its own structured
 * facts. The cc3b970b probe shipped a hand-written conclusion claiming "PSEC not present / E_NOTIMPL"
 * while its probeFacts said baseContainerApiPresent=TRUE; that hidden contradiction nearly misled the
 * evidence. The integrity gate below makes any such drift a hard red, for EVERY mxc receipt.
 *
 * A denial check (`*.crossDenied.*`, `*.read.cross`, `*.write.cross`, `*.neverGrantable`) that passes
 * while the same session positive control failed is a VACUOUS pass (nothing ran to be refused) and is
 * also an integrity violation. Checks with verdict `info` are evidence only: shown, never gated, never
 * counted as a pass (e.g. orchestrator impersonation results, which are not a running child).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { outDir } from './mxc-lib.mts';

type Check = { id: string; expect: string; observed: string; verdict: 'pass' | 'fail' | 'info'; detail?: unknown };
type Receipt = {
  kind?: string;
  verdict?: string;
  checks?: Check[];
  identity?: Record<string, unknown>;
  conclusion?: string;
  probeFacts?: Record<string, unknown>;
  psecCreateClose?: { available?: boolean };
};

const read = (name: string): Receipt | undefined => {
  const path = join(outDir(), name);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Receipt) : undefined;
};

const icon = (v?: string): string => (v === 'pass' ? '✅' : v === 'info' ? 'ℹ️ info (not gated)' : '❌');

/**
 * Vacuous-denial detection: a passing denial whose same-session positive control did not pass.
 * `fallback.write.crossDenied.AtoB` pairs with `fallback.write.ownAllowed.A`; `isoSession.read.cross`
 * pairs with every `isoSession.control.*`; `fallback.read.neverGrantable` pairs with both read controls.
 */
const vacuousDenials = (checks: Check[]): string[] => {
  const byId = new Map(checks.map((c) => [c.id, c]));
  const passed = (id: string): boolean => byId.get(id)?.verdict === 'pass';
  const out: string[] = [];
  for (const c of checks) {
    if (c.verdict !== 'pass') {
      continue;
    }
    const cross = /^(.*)\.crossDenied\.([A-Za-z0-9]+)to[A-Za-z0-9]+$/.exec(c.id);
    if (cross) {
      const control = `${cross[1]}.ownAllowed.${cross[2]}`;
      if (!passed(control)) {
        out.push(`\`${c.id}\` passes but its positive control \`${control}\` did not (vacuous denial)`);
      }
      continue;
    }
    if (/\.neverGrantable$/.test(c.id)) {
      const prefix = c.id.replace(/\.neverGrantable$/, '');
      const controls = checks.filter((x) => x.id.startsWith(`${prefix}.ownAllowed.`));
      if (controls.length === 0 || controls.some((x) => x.verdict !== 'pass')) {
        out.push(`\`${c.id}\` passes without passing own-root positive controls (vacuous denial)`);
      }
      continue;
    }
    if (/^isoSession\.(read|write)\.cross$/.test(c.id)) {
      const controls = checks.filter((x) => x.id.startsWith('isoSession.control.'));
      if (controls.length === 0 || controls.some((x) => x.verdict !== 'pass')) {
        out.push(`\`${c.id}\` passes without passing positive controls (vacuous denial)`);
      }
    }
  }
  return out;
};

/**
 * Receipt integrity: the prose narrative MUST agree with the structured facts. Returns the list of
 * contradictions found (empty == consistent). Applied to every receipt that carries a conclusion.
 */
const integrityViolations = (label: string, r: Receipt): string[] => {
  const v: string[] = [];
  const concl = typeof r.conclusion === 'string' ? r.conclusion : '';
  const facts = r.probeFacts;
  if (facts && concl) {
    // The generated conclusion echoes each boolean fact verbatim (key=value); a stale or hand-written
    // narrative will not, which is exactly how the cc3b970b contradiction is caught.
    for (const key of ['baseContainerApiPresent', 'baseContainerSupportsDenyPaths', 'isolationSessionAvailable']) {
      if (key in facts) {
        const expected = `${key}=${String(Boolean(facts[key]))}`;
        if (!concl.includes(expected)) {
          v.push(`conclusion does not echo structured fact \`${expected}\` (possible stale/hand-written narrative)`);
        }
      }
    }
    if (Boolean(facts['baseContainerApiPresent']) === true) {
      if (
        /e_notimpl|not present|not enabled|api[^.]*absent|psec[^.]*absent/i.test(concl) &&
        !/live-exercise|is present/i.test(concl)
      ) {
        v.push('conclusion claims PSEC absent / E_NOTIMPL while `baseContainerApiPresent=true`');
      }
    }
  }
  // A create/close live-success must not coexist with an API-absent narrative.
  if (
    r.psecCreateClose?.available === true &&
    concl &&
    /not present|e_notimpl/i.test(concl) &&
    !/is present|live/i.test(concl)
  ) {
    v.push('conclusion claims API not present while `psecCreateClose.available=true`');
  }
  if (concl && /\bverdict\s*=\s*pass\b/i.test(concl) && r.verdict === 'fail') {
    v.push('conclusion says verdict=pass but receipt verdict=fail');
  }
  v.push(...vacuousDenials(r.checks ?? []));
  // A conclusion claiming an isolation is proven must agree with the gated checks.
  if (
    concl &&
    /\b(write|read)IsolationProven=true\b/.test(concl) &&
    r.verdict !== 'pass' &&
    (r.checks ?? []).some((c) => /crossDenied/.test(c.id) && c.verdict !== 'pass')
  ) {
    v.push('conclusion says an isolation is proven while a crossDenied check did not pass');
  }
  return v.map((m) => `${label}: ${m}`);
};

const lines: string[] = ['## Spike W2 — Windows MXC processcontainer + D14 PowerShell shell', ''];

const provision = read('provision.receipt.json');
const identity = (provision?.identity ??
  read('shell-identity.receipt.json')?.identity ??
  read('probe.receipt.json')?.identity) as
  | { mxc?: { sdk?: Record<string, unknown> }; os?: Record<string, unknown>; source?: Record<string, unknown> }
  | undefined;

const arch = String(identity?.os?.['arch'] ?? process.arch);
const isArm = arch === 'arm64';
let gateFail = false;

if (identity?.mxc?.sdk) {
  const sdk = identity.mxc.sdk;
  lines.push(
    `**MXC SDK** \`${String(sdk['name'])}@${String(sdk['installedVersion'])}\` (pinned \`${String(sdk['pinnedVersion'])}\`, licence ${String(sdk['license'])})  `,
    `**OS build** ${String(identity.os?.['build'] ?? 'unknown')} · **arch** \`${arch}\` · **user SID** ${String(identity.os?.['userSid'] ?? 'unknown')}  `,
    `**Source** ${String(identity.source?.['run'] ?? 'local')}`,
    '',
  );
} else {
  lines.push(`**arch** \`${arch}\``, '');
}

// Non-admin context (arm64 PRIMARY lane): prove the receipts were collected without elevation.
type NonAdminCtx = { standardUser?: string; isAdministrator?: boolean; row?: string };
const ctxPath = join(outDir(), 'nonadmin-context.json');
if (existsSync(ctxPath)) {
  const ctx = JSON.parse(readFileSync(ctxPath, 'utf8')) as NonAdminCtx;
  lines.push(
    `**Run-as** created local user \`${String(ctx.standardUser)}\`, administrator: ${ctx.isAdministrator === false ? 'no ✅' : '⚠️ ' + String(ctx.isAdministrator)}`,
    '',
  );
  if (ctx.isAdministrator !== false) {
    gateFail = true;
  }
}

// The non-admin launcher records this only when its own setup failed (user creation, logon, etc).
const launcherFail = join(outDir(), 'nonadmin-runner-failed.json');
if (existsSync(launcherFail)) {
  const f = JSON.parse(readFileSync(launcherFail, 'utf8')) as { reason?: string };
  lines.push(`### Non-admin launcher: ❌ failed`, '', `> ${String(f.reason ?? 'unknown')}`, '');
  gateFail = true;
}

// Honest scope: an arm64 PSEC receipt does NOT close the x64 or consumer-SKU rows.
if (isArm) {
  lines.push(
    '> **Scope caveat:** this is an **arm64** (Windows 11 Enterprise 25H2) receipt. A PSEC / isolation',
    '> result here does **NOT** close the **x64** package row (qualified separately in W8) or any',
    '> **consumer-SKU** row. It attests only the arm64 Enterprise host exercised above.',
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
  { label: 'isolation_session two-session', file: 'isolation-session.receipt.json', required: false },
  { label: 'Capability-SID fallback', file: 'fallback.receipt.json', required: false },
  { label: 'S2 PTY (plain non-admin user, no restricted token)', file: 's2-pty.receipt.json', required: false },
  { label: 'S2 PTY inside the fallback restricted token', file: 'fallback-s2-pty.receipt.json', required: false },
  { label: 'Sandbox-user provision', file: 'sandbox-provision.receipt.json', required: false },
];

const allViolations: string[] = [];

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
  const violations = integrityViolations(row.label, receipt);
  if (violations.length > 0) {
    gateFail = true;
    allViolations.push(...violations);
  }
  lines.push(
    `### ${row.label}: ${icon(receipt.verdict)} ${receipt.verdict ?? 'unknown'}${violations.length ? ' · ⚠️ INTEGRITY' : ''}`,
    '',
  );
  if (receipt.conclusion) {
    lines.push(`> ${receipt.conclusion}`, '');
  }
  lines.push('| check | expect | observed | verdict |', '| --- | --- | --- | --- |');
  for (const c of receipt.checks ?? []) {
    lines.push(`| \`${c.id}\` | ${c.expect} | ${c.observed} | ${icon(c.verdict)} |`);
  }
  lines.push('');
}

if (allViolations.length > 0) {
  lines.push('### ❌ Receipt-integrity violations (prose disagrees with structured facts)', '');
  for (const m of allViolations) {
    lines.push(`- ${m}`);
  }
  lines.push('');
}

// eslint-disable-next-line no-console
console.log(lines.join('\n'));
if (gateFail) {
  process.exitCode = 1;
}
