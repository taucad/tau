/**
 * W2 D14 Windows ShellIdentity receipt (blueprint D14, Brain f1b7c6df) — the hosted-collectable
 * receipt on windows-2025. Runs the canonical shell-identity.ps1 for BOTH resolution branches:
 *   - default: pwsh 7 at %ProgramFiles%\PowerShell\7 wins (hosted windows-2025 ships it), and
 *   - -HidePwsh7: the forced Windows PowerShell 5.1 fallback (present on every Windows 11 / Server).
 * and binds the result to the lane identity. Every receipt records ShellIdentity.kind + version.
 *
 * The harness launches its OWN probe script with -ExecutionPolicy Bypass -File (harness
 * infrastructure, so a Restricted machine policy cannot block the spike itself). This is distinct
 * from the AGENT launch argv the probe RECORDS, which is the D14 `-NoLogo -NoProfile -NonInteractive
 * -Command` with NO -ExecutionPolicy override. shell-missing is a typed fail, never a green.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type Check,
  check,
  isWindows,
  laneIdentity,
  mxcDirectory,
  outDir,
  resolveWindowsShell,
  writeJson,
} from './mxc-lib.mts';

type IdentityJson = {
  kind: string;
  version?: string;
  path?: string;
  sha256?: string;
  executionPolicyOverride?: boolean;
  trusted?: boolean;
};

const runProbe = (
  shellExe: string,
  ps1: string,
  outPath: string,
  hidePwsh7: boolean,
): IdentityJson | { error: string } => {
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ps1,
    '-OutPath',
    outPath,
  ];
  if (hidePwsh7) {
    args.push('-HidePwsh7');
  }
  const result = spawnSync(shellExe, args, { encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  if (!existsSync(outPath)) {
    return {
      error: `probe produced no receipt (status=${String(result.status)}): ${(result.stderr ?? '').slice(0, 500)}`,
    };
  }
  return JSON.parse(readFileSync(outPath, 'utf8')) as IdentityJson;
};

const main = (): void => {
  const checks: Check[] = [];
  const out = outDir();
  const ps1 = join(mxcDirectory, 'shell-identity.ps1');

  if (!isWindows) {
    checks.push(
      check(
        'shell.platform.windows',
        'Windows host (D14 PowerShell resolution is Windows-only)',
        process.platform,
        false,
      ),
    );
    writeJson(join(out, 'shell-identity.receipt.json'), {
      kind: 'shell-identity',
      identity: laneIdentity(),
      checks,
      verdict: 'fail',
    });
    // eslint-disable-next-line no-console
    console.log('[mxc:shell-identity] fail — not a Windows host');
    process.exitCode = 1;
    return;
  }

  // Resolve a trusted shell to RUN the probe script (prefer the resolved one; fall back to 5.1).
  const launcher = resolveWindowsShell();
  const shellExe =
    launcher.path ??
    join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

  const def = runProbe(shellExe, ps1, join(out, 'shell-identity.default.json'), false);
  const forced = runProbe(shellExe, ps1, join(out, 'shell-identity.51.json'), true);

  const defKind = 'kind' in def ? def.kind : 'error';
  // Resolution success IS trust: shell-identity.ps1 only ever SELECTS a present+trusted candidate, so
  // a non-'shell-missing' kind means a trusted fixed-path shell was chosen. Do NOT additionally gate
  // on a top-level `trusted` (the ps1 records trust per-candidate, not top-level) — that was the
  // verdict bug that red-flagged a correctly-resolved pwsh7. version/sha256/SID are recorded as
  // evidence, never gated (a hosted image legitimately may lack one).
  const defTrusted = 'kind' in def && def.kind !== 'shell-missing';
  checks.push(
    check(
      'shell.default.resolved',
      'default branch resolves a trusted fixed-path PowerShell (pwsh7 preferred)',
      `${defKind} ${'version' in def ? (def.version ?? '') : ''}`.trim(),
      defTrusted,
      def,
    ),
  );
  checks.push(
    check(
      'shell.default.noExecPolicyOverride',
      'agent launch argv carries no -ExecutionPolicy override (D14)',
      'kind' in def && def.executionPolicyOverride === false ? 'no override' : 'override present?',
      'kind' in def && def.executionPolicyOverride === false,
    ),
  );

  const forcedKind = 'kind' in forced ? forced.kind : 'error';
  checks.push(
    check(
      'shell.hidePwsh7.fallback',
      '-HidePwsh7 falls back to Windows PowerShell 5.1 (fixed path)',
      `${forcedKind} ${'version' in forced ? (forced.version ?? '') : ''}`.trim(),
      forcedKind === 'windows-powershell-5.1',
      forced,
    ),
  );

  const receipt = {
    kind: 'shell-identity',
    identity: laneIdentity(),
    d14: { launchArgv: launcher.launchArgv, ptyArgv: launcher.ptyArgv, fixedPathsOnly: true, gitBashOffered: false },
    default: def,
    hidePwsh7: forced,
    checks,
    verdict: checks.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
  };
  writeJson(join(out, 'shell-identity.receipt.json'), receipt);
  // eslint-disable-next-line no-console
  console.log(`[mxc:shell-identity] ${receipt.verdict} — default=${defKind} hidePwsh7=${forcedKind}`);
  if (receipt.verdict !== 'pass') {
    process.exitCode = 1;
  }
};

main();
