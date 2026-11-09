/**
 * Failure evidence for a CDP attach that never completes.
 *
 * Playwright's `connectOverCDP` can reach `<ws connected>` and then wait until its timeout for every existing target
 * to answer its initialisation (run 42536450184 macos-zip-arm64 `c/reinstall-ui`). The call log cannot say which
 * target stopped answering or why. This records the debugging endpoint's own target list, whether each page target
 * answers one trivial command on its own socket, and, on macOS, a stack sample of the app and its helper processes.
 * Everything is read-only, bounded, and only gathered after the attach has already failed.
 */
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

type Target = {
  readonly id?: string;
  readonly type?: string;
  readonly url?: string;
  readonly webSocketDebuggerUrl?: string;
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  return response.json();
};

/**
 * Send one command on a target's own debugging socket and report whether it answered.
 * @param url - The target's `webSocketDebuggerUrl`.
 * @param timeout - How long to wait for the socket and the answer together, in milliseconds.
 * @returns What happened, with the elapsed time.
 */
export const probeTarget = async (
  url: string,
  timeout = 5000,
): Promise<{
  readonly outcome: 'answered' | 'error' | 'timeout';
  readonly elapsed: number;
  readonly detail?: string;
}> => {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    const finish = (outcome: 'answered' | 'error' | 'timeout', detail?: string): void => {
      clearTimeout(timer);
      socket.close();
      resolve({ outcome, elapsed: Date.now() - started, ...(detail ? { detail } : {}) });
    };
    const timer = setTimeout(() => {
      finish('timeout');
    }, timeout);
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.readyState' } }));
    });
    socket.addEventListener('message', (event) => {
      finish('answered', String(event.data).slice(0, 300));
    });
    socket.addEventListener('error', () => {
      finish('error', 'socket error');
    });
  });
};

/** The pid itself and its direct children, from `ps`, so an Electron app's helper processes are included. */
const processFamily = async (pid: number): Promise<Array<{ pid: number; command: string }>> => {
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,comm='], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
  return stdout
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .filter((match) => Number(match[1]) === pid || Number(match[2]) === pid)
    .map((match) => ({ pid: Number(match[1]), command: match[3]!.trim() }));
};

/**
 * Record why an attach to the app's debugging endpoint stalled. Never rejects.
 * @param input - The debugging port, the app's main pid when known, and the path prefix for the evidence files.
 */
export const recordCdpAttachFailure = async (input: {
  readonly port: number;
  readonly pid: number | undefined;
  readonly output: string;
}): Promise<void> => {
  const base = `http://127.0.0.1:${input.port}`;
  const [version, list] = await Promise.allSettled([fetchJson(`${base}/json/version`), fetchJson(`${base}/json/list`)]);
  const targets = list.status === 'fulfilled' && Array.isArray(list.value) ? (list.value as Target[]) : [];
  const probes = await Promise.all(
    targets
      .filter((target) => target.webSocketDebuggerUrl)
      .slice(0, 20)
      .map(async (target) => ({
        id: target.id,
        type: target.type,
        url: target.url?.slice(0, 300),
        probe: await probeTarget(target.webSocketDebuggerUrl!),
      })),
  );
  const family =
    input.pid === undefined
      ? []
      : await processFamily(input.pid).catch((error: unknown) => [{ pid: -1, command: String(error) }]);
  const samples: Record<string, string> = {};
  if (process.platform === 'darwin') {
    /* `sample` stops the process briefly to read every thread's stack; three seconds names a stuck main thread. */
    await Promise.all(
      family
        .filter(({ pid }) => pid > 0)
        .slice(0, 12)
        .map(async ({ pid }) => {
          const file = `${input.output}.sample-${pid}.txt`;
          samples[pid] = await execute('/usr/bin/sample', [String(pid), '3', '-file', file], { timeout: 60_000 }).then(
            () => file,
            (error: unknown) => `sample failed: ${String(error).slice(0, 300)}`,
          );
        }),
    );
    await execute('/usr/sbin/screencapture', ['-x', `${input.output}.screen.png`], { timeout: 30_000 }).catch(
      () => undefined,
    );
  }
  await writeFile(
    `${input.output}.attach-failure.json`,
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        version: version.status === 'fulfilled' ? version.value : String(version.reason),
        targets: list.status === 'fulfilled' ? list.value : String(list.reason),
        probes,
        processes: family,
        samples,
      },
      undefined,
      2,
    ),
    { flag: 'wx' },
  ).catch((error: unknown) => {
    console.error('Could not save CDP attach failure observations', error);
  });
};
