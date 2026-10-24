/**
 * W2 capability-SID fallback driver. Invokes `fallback.ps1` (the real Windows restricted-token +
 * capability-SID + deny-read-ACE probe) and stamps lane identity onto its receipt. Run this ONLY on
 * a row where the MXC probe failed — it proves the Codex elevated-backend fallback instead. On a
 * non-Windows host it records a typed prerequisite failure (the fallback is Windows-only) and exits
 * non-zero; it never goes green.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { check, isWindows, laneIdentity, mxcDirectory, outDir, resolveWindowsShell, writeJson } from './mxc-lib.mts';

const main = (): void => {
  const receiptPath = join(outDir(), 'fallback.receipt.json');
  if (!isWindows) {
    writeJson(receiptPath, {
      kind: 'capability-sid-fallback',
      identity: laneIdentity(),
      checks: [
        check(
          'fallback.platform.windows',
          'Windows host (restricted tokens / capability SIDs are Windows-only)',
          process.platform,
          false,
        ),
      ],
      verdict: 'fail',
    });
    // eslint-disable-next-line no-console
    console.log('[mxc:fallback] fail — not a Windows host');
    process.exitCode = 1;
    return;
  }
  const script = join(mxcDirectory, 'fallback.ps1');
  // The D14 shell at its fixed trusted path (never a PATH lookup); its absence is a typed failure.
  const shell = resolveWindowsShell();
  if (!shell.path) {
    writeJson(receiptPath, {
      kind: 'capability-sid-fallback',
      identity: laneIdentity(),
      checks: [check('fallback.shell', 'trusted PowerShell at a fixed path', shell.reason ?? 'missing', false)],
      verdict: 'fail',
    });
    process.exitCode = 1;
    return;
  }
  const result = spawnSync(shell.path, ['-NoProfile', '-NonInteractive', '-File', script], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, MXC_FALLBACK_OUT: receiptPath },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // Stamp lane identity onto the PowerShell receipt so every receipt in this lane binds the same way.
  if (existsSync(receiptPath)) {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
    writeJson(receiptPath, { ...receipt, identity: laneIdentity() });
  } else {
    writeJson(receiptPath, {
      kind: 'capability-sid-fallback',
      identity: laneIdentity(),
      checks: [
        check('fallback.run', 'fallback.ps1 produced a receipt', 'no receipt written', false, {
          status: result.status,
        }),
      ],
      verdict: 'fail',
    });
  }
  if (result.status !== 0) {
    process.exitCode = 1;
  }
};

main();
