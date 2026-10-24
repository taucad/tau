/** Observe the native worker process tree independently of application-written diagnostic records. */
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
// oxlint-disable-next-line no-restricted-imports -- Native driver contract is script-owned.
import type { QualificationProcesses } from './qualification-platform-types.mjs';

export const discoverQualificationProcesses = (
  mainPid: number,
  rendererPid: number,
): QualificationProcesses & { nativeAncestry: Array<{ pid: number; parent: number; command: string }> } => {
  if (!Number.isSafeInteger(mainPid) || mainPid < 1 || !Number.isSafeInteger(rendererPid) || rendererPid < 1) {
    throw new Error('Qualification requires live process identifiers');
  }
  const records =
    process.platform === 'win32'
      ? z
          .array(z.object({ pid: z.number(), parent: z.number(), command: z.string() }))
          .parse(
            JSON.parse(
              execFileSync(
                'powershell.exe',
                [
                  '-NoProfile',
                  '-NonInteractive',
                  '-Command',
                  '@(Get-CimInstance Win32_Process | ForEach-Object { @{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;command=[string]$_.CommandLine} }) | ConvertTo-Json -Compress',
                ],
                { encoding: 'utf8', timeout: 30_000 },
              ),
            ),
          )
      : execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 30_000 })
          .trim()
          .split('\n')
          .flatMap((line) => {
            const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
            return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? '' }] : [];
          });
  const byPid = new Map(records.map((record) => [record.pid, record]));
  const descendant = (pid: number): boolean => {
    const seen = new Set<number>();
    let current = byPid.get(pid);
    while (current && !seen.has(current.pid)) {
      if (current.parent === mainPid) {
        return true;
      }
      seen.add(current.pid);
      current = byPid.get(current.parent);
    }
    return false;
  };
  if (!byPid.has(mainPid) || !descendant(rendererPid)) {
    throw new Error('Renderer is not a live descendant of the installed application');
  }
  const nativeChildPids = records
    .filter(
      (record) =>
        descendant(record.pid) && /(?:[/\\]|\b)python(?:3(?:\.\d+)?)?(?:\.exe)?(?:\s|"|$)/iu.test(record.command),
    )
    .map((record) => record.pid);
  if (nativeChildPids.length === 0) {
    throw new Error('No live native Python worker descendant was observed');
  }
  return {
    mainPid,
    rendererPids: [rendererPid],
    nativeChildPids,
    nativeAncestry: records.filter((record) => descendant(record.pid)),
  };
};
