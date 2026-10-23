/**
 * W2 T02-pwsh grammar cases (D14): PowerShell shell-semantics, the Windows half of the T02 split
 * (T02-bash covers macOS 3.2 / Linux 5.x elsewhere). Containment cases stay language-neutral in
 * isolation.mts; THESE are language-specific and run directly against the resolved shell with the
 * D14 agent argv (-NoLogo -NoProfile -NonInteractive -Command), decided by external stdout/exit
 * comparison. The tool is named `shell`; its description names the host language + major version.
 *
 * Stable cases (here-string, pipeline, subexpression, exit code) gate the receipt. `&&`/`||`
 * chaining and Unicode encoding legitimately DIFFER between pwsh 7 and 5.1 (D14), so they are
 * recorded as characterization, not gated.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { type Check, check, isWindows, laneIdentity, outDir, resolveWindowsShell, writeJson } from './mxc-lib.mts';

const main = (): void => {
  const checks: Check[] = [];
  const out = outDir();
  const shell = resolveWindowsShell();

  if (!isWindows || !shell.path) {
    checks.push(
      check(
        't02-pwsh.prerequisite',
        'Windows host with a trusted D14 PowerShell',
        isWindows ? (shell.reason ?? 'shell-missing') : process.platform,
        false,
      ),
    );
    writeJson(join(out, 'grammar.receipt.json'), {
      kind: 't02-pwsh',
      identity: laneIdentity(),
      shell,
      checks,
      verdict: 'fail',
    });
    // eslint-disable-next-line no-console
    console.log('[mxc:grammar] fail — no Windows PowerShell');
    process.exitCode = 1;
    return;
  }

  const run = (script: string): { stdout: string; status: number | null } => {
    const r = spawnSync(shell.path as string, [...shell.launchArgv, script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    });
    return { stdout: (r.stdout ?? '').replaceAll('\r\n', '\n').trim(), status: r.status };
  };

  // Stable, gated cases.
  const here = run("@'\nline1\nline2\n'@");
  checks.push(
    check(
      't02-pwsh.herestring',
      'here-string preserves literal lines',
      JSON.stringify(here.stdout),
      here.stdout === 'line1\nline2',
      here,
    ),
  );

  const pipe = run("'a b c' -split ' ' | Measure-Object | ForEach-Object Count");
  checks.push(check('t02-pwsh.pipeline', 'pipeline counts 3 tokens', pipe.stdout, pipe.stdout === '3', pipe));

  const sub = run('Write-Output "val=$(2 + 3)"');
  checks.push(
    check('t02-pwsh.subexpression', 'subexpression $(2 + 3) evaluates to 5', sub.stdout, sub.stdout === 'val=5', sub),
  );

  const ec = run('exit 7');
  checks.push(
    check('t02-pwsh.exitcode', 'explicit exit code propagates (7)', `status=${String(ec.status)}`, ec.status === 7, ec),
  );

  // Characterization (non-gating): documents the pwsh7 vs 5.1 language differences D14 calls out.
  const chain = run('Write-Output one && Write-Output two');
  const chainSupported = chain.stdout.includes('one') && chain.stdout.includes('two');
  checks.push(
    check(
      't02-pwsh.chain',
      shell.kind === 'pwsh7'
        ? '&&/|| chaining supported (pwsh 7)'
        : '&&/|| chaining NOT a 5.1 operator (documented difference)',
      chainSupported ? 'chained' : 'not chained',
      true,
      { kind: shell.kind, chainSupported, raw: chain },
    ),
  );

  const uni = run("Write-Output 'café-☃'");
  checks.push(
    check(
      't02-pwsh.unicode',
      'Unicode round-trips through -Command stdout (encoding differs 5.1 vs 7)',
      uni.stdout,
      true,
      { kind: shell.kind, raw: uni },
    ),
  );

  const gated = checks.filter((c) =>
    ['t02-pwsh.herestring', 't02-pwsh.pipeline', 't02-pwsh.subexpression', 't02-pwsh.exitcode'].includes(c.id),
  );
  const receipt = {
    kind: 't02-pwsh',
    tool: 'shell',
    identity: laneIdentity(),
    shell,
    checks,
    verdict: gated.every((c) => c.verdict === 'pass') ? 'pass' : 'fail',
  };
  writeJson(join(out, 'grammar.receipt.json'), receipt);
  // eslint-disable-next-line no-console
  console.log(
    `[mxc:grammar] ${receipt.verdict} — ${shell.kind} (${gated.filter((c) => c.verdict === 'pass').length}/${gated.length} gated)`,
  );
  if (receipt.verdict !== 'pass') {
    process.exitCode = 1;
  }
};

main();
