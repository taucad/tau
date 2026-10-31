/**
 * Out-of-container canaries for the W2 MXC isolation receipt. Reusable by the later Win11 Eval VM
 * lane: these are standalone primitives with no MXC dependency.
 *
 *   - `reapingWriterCommand`: a shell command (Git Bash, per RQ6) that starts a SESSION-ESCAPING,
 *     TERM-ignoring background writer appending to a sentinel file, then returns the foreground
 *     process immediately. If MXC's kill-on-close job reaps the whole tree when the foreground
 *     exits, the sentinel STOPS growing. The verdict is decided by an external observer watching the
 *     file size — never by an in-container claim.
 *   - `observeGrowth`: external file-size observer over a window.
 *   - `digestOf` / `readIfPresent`: external file-digest helpers for the allow/deny assertions.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

import { type ShellIdentity, psLaunch, sha256, sleep } from './mxc-lib.mts';

/**
 * The D14 PowerShell reaping adversary: one foreground PowerShell that spawns THREE escaping writers
 * to `sentinel` and then exits at once. Only a kill-on-close job that reaps the ENTIRE descendant
 * tree stops all three:
 *   (a) a detached NATIVE .exe child (cmd.exe loop) — a non-PowerShell descendant,
 *   (b) a PowerShell background job (Start-Job),
 *   (c) a detached PowerShell via Start-Process.
 * The verdict is external: after the container closes, the sentinel must STOP growing. A foreground-
 * group-only kill would miss the Start-Process / native children, so this is the adversary case.
 */
export const reapingWriterCommand = (shell: ShellIdentity, sentinel: string): string => {
  const f = sentinel.replaceAll('\\', '/');
  // Single-quoted PowerShell literals only (no inner double quotes), so psLaunch's -Command wrapping
  // needs no escaping. Each writer appends forever until reaped.
  const script = [
    `$f = '${f}'`,
    // (a) native .exe child: cmd.exe infinite append loop, hidden/detached.
    `Start-Process -FilePath 'cmd.exe' -ArgumentList '/c',('for /L %i in (1,0,2) do (echo a>> ' + [char]34 + $f + [char]34 + ' & ping -n 1 127.0.0.1 >nul)') -WindowStyle Hidden`,
    // (b) PowerShell background job.
    `Start-Job -ScriptBlock { param($p) while ($true) { Add-Content -LiteralPath $p -Value 'j'; Start-Sleep -Milliseconds 100 } } -ArgumentList $f | Out-Null`,
    // (c) detached PowerShell via Start-Process.
    `Start-Process -FilePath '${shell.path ?? 'powershell.exe'}' -ArgumentList '-NoLogo','-NoProfile','-Command',('while($true){Add-Content -LiteralPath ' + [char]39 + $f + [char]39 + ' -Value ' + [char]39 + 'p' + [char]39 + '; Start-Sleep -Milliseconds 100}') -WindowStyle Hidden`,
    `exit 0`,
  ].join('; ');
  return psLaunch(shell, script);
};

/** Record file size at t0 and after `windowMs`; report whether it grew (external observation). */
export const observeGrowth = async (
  path: string,
  windowMs: number,
): Promise<{ grew: boolean; before: number; after: number }> => {
  const sizeOf = (): number => (existsSync(path) ? statSync(path).size : 0);
  const before = sizeOf();
  await sleep(windowMs);
  const after = sizeOf();
  return { grew: after > before, before, after };
};

export const readIfPresent = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, 'utf8') : undefined;

export const digestOf = (path: string): string | undefined => {
  const content = readIfPresent(path);
  return content === undefined ? undefined : sha256(content);
};
