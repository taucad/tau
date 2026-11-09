/**
 * Failure evidence for a CDP attach that never completes.
 *
 * Playwright's `connectOverCDP` can reach `<ws connected>` and then wait until its timeout for every existing target
 * to answer its initialisation (run 42536450184 macos-zip-arm64 `c/reinstall-ui`). The call log cannot say which
 * target stopped answering or why. This records the debugging endpoint's own target list, whether each page target
 * answers one trivial command on its own socket, the app's process tree, the payload store's links and closures,
 * and, on macOS, a stack sample of every process in the tree.
 * Everything is read-only, bounded, and only gathered after the attach has already failed.
 */
import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

/** The pid and all its descendants from `ps`, with CPU, memory and the full command, so helpers and kernels show. */
const processFamily = async (
  pid: number,
): Promise<Array<{ pid: number; ppid: number; cpu: string; rss: string; command: string }>> => {
  const { stdout } = await execute('ps', ['-axo', 'pid=,ppid=,%cpu=,rss=,command='], {
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const rows = stdout
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/u.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      cpu: match[3]!,
      rss: match[4]!,
      command: match[5]!.trim().slice(0, 500),
    }));
  const family = new Set([pid]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const row of rows) {
      if (!family.has(row.pid) && family.has(row.ppid)) {
        family.add(row.pid);
        grown = true;
      }
    }
  }
  return rows.filter((row) => family.has(row.pid));
};

/** The payload store's links (host path and closure keys only), sealed closures and staging, by name. */
const storeListing = async (profile: string): Promise<Record<string, unknown>> => {
  const store = join(profile, 'config', 'payloads');
  const names = async (path: string): Promise<string[] | string> => {
    try {
      const entries = await readdir(path);
      return entries.slice(0, 50);
    } catch (error) {
      return String(error).slice(0, 200);
    }
  };
  const linkNames = await names(join(store, 'links'));
  const links = Array.isArray(linkNames)
    ? await Promise.all(
        linkNames
          .filter((name) => name.endsWith('.json'))
          .map(async (name) => {
            try {
              const value = JSON.parse(await readFile(join(store, 'links', name), 'utf8')) as {
                hostPath?: unknown;
                closures?: unknown;
              };
              return { name, hostPath: value.hostPath, closures: value.closures };
            } catch (error) {
              return { name, error: String(error).slice(0, 200) };
            }
          }),
      )
    : linkNames;
  return {
    links,
    closures: await names(join(store, 'closures', 'sha256')),
    staging: await names(join(store, 'staging')),
  };
};

/** The debugging endpoint's target list now, to compare with the list after an attach fails. */
export const snapshotTargets = async (port: number): Promise<unknown> => {
  try {
    return { observedAt: new Date().toISOString(), value: await fetchJson(`http://127.0.0.1:${port}/json/list`) };
  } catch (error) {
    return { observedAt: new Date().toISOString(), error: String(error) };
  }
};

/**
 * Record why an attach to the app's debugging endpoint stalled. Never rejects.
 * @param input - The debugging port, the app's main pid when known, and the path prefix for the evidence files.
 */
export const recordCdpAttachFailure = async (input: {
  readonly port: number;
  readonly pid: number | undefined;
  readonly output: string;
  readonly profile: string;
  readonly beforeAttach: unknown;
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
      : await processFamily(input.pid).catch((error: unknown) => [
          { pid: -1, ppid: -1, cpu: '', rss: '', command: String(error) },
        ]);
  const store = await storeListing(input.profile).catch(String);
  const samples: Record<string, string> = {};
  if (process.platform === 'darwin') {
    /* `sample` stops the process briefly to read every thread's stack; three seconds names a stuck main thread. */
    await Promise.all(
      family
        .filter(({ pid }) => pid > 0)
        .slice(0, 16)
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
        beforeAttach: input.beforeAttach,
        targets: list.status === 'fulfilled' ? list.value : String(list.reason),
        probes,
        processes: family,
        store,
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
