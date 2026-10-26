// @vitest-environment node
/*
 * The desktop Terminal's conformance rows (`desktop:test:terminal-conformance`; blueprint W5, A09, A11, A14, A24).
 * Each row drives the real services host — the utility's own `createServicesHost`, its root allowlist frame and its
 * `terminal` concern frame — over a transferred port speaking the validated wire, into the real shell service, the
 * real sandbox provider and the machine's own Bash in a PTY. Teardown rows judge "no writer left" by the bytes a
 * background writer leaves in the project, read outside the sandbox.
 *
 * Off unless `TAU_SHELL_CONFORMANCE=1`, which only the noncacheable Nx target sets. `TAU_SHELL_CONFORMANCE_ROW` names
 * the row, `TAU_SHELL_CONFORMANCE_RECEIPT` where the JSON receipt goes and, on Linux, `TAU_SHELL_CONFORMANCE_BWRAP`
 * the installed, profiled bubblewrap. On macOS the provider runs with its default, so the PTY rows are recorded
 * `unverified` until the operator's own-pty run (ruling 2026-10-24T20:45Z); agents never run that probe. macOS runs
 * the probe (pipes) and the refusal rows.
 */
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { probeHostShell } from '@taucad/host';
import type { ShellProbe } from '@taucad/host';
import { createSandboxShellProvider } from '@taucad/native-process-core/shell';
import { terminalHostFrameSchema } from '@taucad/types/desktop-terminal';
import type { TerminalClientFrame, TerminalHostFrame } from '@taucad/types/desktop-terminal';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { ServicesHost, UtilityPort } from '#tau/services-host.impl.js';

const enabled = process.env['TAU_SHELL_CONFORMANCE'] === '1';
const row = process.env['TAU_SHELL_CONFORMANCE_ROW'] ?? 'unnamed';
const bwrapPath = process.env['TAU_SHELL_CONFORMANCE_BWRAP'] ?? '/usr/bin/bwrap';
const ptyRows = process.platform === 'linux';

type RowResult = Readonly<{ id: string; title: string; status: 'pass' | 'fail' | 'unverified'; detail?: string }>;
const results: RowResult[] = [];

type RowSpec = Readonly<{ id: string; title: string; pty: boolean }>;

/** One row; a PTY row is recorded `unverified` where the PTY is not validated yet (macOS). */
const define = ({ id, title, pty }: RowSpec, body: () => Promise<void>): void => {
  if (pty && !ptyRows) {
    it.skip(`${id}: ${title} (unverified on ${process.platform})`, () => undefined);
    results.push({ id, title, status: 'unverified', detail: 'macOS PTY awaits the operator own-pty run' });
    return;
  }
  it(`${id}: ${title}`, { timeout: 90_000 }, async () => {
    try {
      await body();
      results.push({ id, title, status: 'pass' });
    } catch (error) {
      results.push({ id, title, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  });
};

const conformance = (id: string, title: string, body: () => Promise<void>): void => {
  define({ id, title, pty: true }, body);
};

/** A row that runs on every platform: the probe (pipes) and the refusal paths. */
const anyRow = (id: string, title: string, body: () => Promise<void>): void => {
  define({ id, title, pty: false }, body);
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

let root = '';
let project = '';
let other = '';
let appData = '';
let home = '';
let sessions = '';
let probe: ShellProbe;
let host: ServicesHost;
let windows = 0;

/** One pane: the renderer's end of a `terminal` port, acknowledging what it reads as a painted pane would. */
const openPane = (projectRoot = project) => {
  const channel = new MessageChannel();
  const frames: TerminalHostFrame[] = [];
  let text = '';
  const waiters = new Set<() => void>();
  const pane: MessagePort = channel.port2;
  pane.on('message', (raw: unknown) => {
    const frame = terminalHostFrameSchema.parse(raw);
    frames.push(frame);
    if (frame.type === 'output') {
      text += frame.data;
      pane.postMessage({ type: 'ack', offset: frame.offset } satisfies TerminalClientFrame);
    }
    for (const wake of waiters) {
      wake();
    }
  });
  /* `MessagePortMain` hands `{ data }` envelopes to its listeners; worker ports hand the bare value. */
  const served = channel.port1;
  const utilityPort = {
    postMessage: (message: unknown) => {
      served.postMessage(message);
    },
    on: (event: string, listener: (message: unknown) => void) => {
      served.on(
        event,
        event === 'message'
          ? (data: unknown) => {
              listener({ data });
            }
          : listener,
      );
      return utilityPort;
    },
    start: () => {
      served.start();
    },
    close: () => {
      served.close();
    },
  } as unknown as UtilityPort;
  windows += 1;
  host.handleMessage({
    data: { type: 'concern', concern: 'terminal', context: { projectRoot, windowId: String(windows) } },
    ports: [utilityPort],
  });
  const send = (frame: TerminalClientFrame): void => {
    pane.postMessage(frame);
  };
  const until = async (predicate: () => boolean, what: string, milliseconds = 20_000): Promise<void> => {
    const deadline = Date.now() + milliseconds;
    while (!predicate()) {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${what}; output so far: ${JSON.stringify(text.slice(-400))}`);
      }
      // oxlint-disable-next-line no-await-in-loop -- waits for the next frame or a short tick.
      await new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        setTimeout(wake, 100);
      });
    }
  };
  return {
    frames,
    send,
    text: () => text,
    until,
    /** Type a line and wait for a marker only the shell's own expansion can print. */
    run: async (line: string, marker: string): Promise<void> => {
      send({ type: 'input', data: `${line}\r` });
      await until(() => text.includes(marker), marker);
    },
    of: <T extends TerminalHostFrame['type']>(type: T) =>
      frames.filter((frame): frame is Extract<TerminalHostFrame, { type: T }> => frame.type === type),
    disconnect: () => {
      pane.close();
    },
  };
};

const opened = async (pane: ReturnType<typeof openPane>): Promise<void> => {
  pane.send({ type: 'open', size: { columns: 80, rows: 24 } });
  await pane.until(() => pane.frames.some((frame) => frame.type === 'opened' || frame.type === 'refused'), 'opened');
  expect(pane.of('refused')).toEqual([]);
};

/** A background writer inside the sandbox appending to a project file; judged by its size outside. */
const startWriter = async (pane: ReturnType<typeof openPane>, name: string): Promise<string> => {
  const file = join(project, name);
  await pane.run(`(while :; do echo tick >> ${name}; sleep 0.1; done) & echo WRITER-$((40+2))`, 'WRITER-42');
  const deadline = Date.now() + 10_000;
  while (!existsSync(file) || statSync(file).size === 0) {
    if (Date.now() > deadline) {
      throw new Error('the positive control never wrote');
    }
    // oxlint-disable-next-line no-await-in-loop -- polls the positive control.
    await delay(100);
  }
  return file;
};

const expectStill = async (file: string): Promise<void> => {
  const before = statSync(file).size;
  await delay(1500);
  expect(statSync(file).size).toBe(before);
};

describe.runIf(enabled)('desktop terminal conformance', () => {
  beforeAll(async () => {
    if (process.platform !== 'linux' && process.platform !== 'darwin') {
      throw new Error(`${process.platform} is not a row of this suite yet.`);
    }
    if (process.platform === 'linux' && !existsSync(bwrapPath)) {
      throw new Error(`no bubblewrap at ${bwrapPath}; a conformance row never falls back to another one.`);
    }
    root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-terminal-conformance-')));
    project = join(root, 'projects', 'bracket');
    other = join(root, 'projects', 'other');
    appData = join(root, 'app-data');
    home = join(root, 'home');
    sessions = join(root, 'sessions');
    for (const directory of [join(project, 'models'), other, appData, home, sessions]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(other, 'canary.txt'), 'OTHER-PROJECT\n');
    probe = await probeHostShell({
      provider: createSandboxShellProvider({
        bwrapPath,
        home,
        custody: { directory: join(appData, 'shell-custody'), sessionDirectory: sessions },
      }),
      checkouts: new Map(),
      appDataRoots: [appData],
      projectRoots: () => [project, other],
      sessionDirectory: sessions,
      home,
    });
    host = createServicesHost({ terminalShell: async () => probe, log: () => undefined });
    host.handleMessage({ data: { type: 'allowRoots', roots: [project, other] }, ports: [] });
  }, 120_000);

  afterAll(() => {
    try {
      host.dispose();
    } catch {
      /* T10 already disposed it. */
    }
    const receipt = process.env['TAU_SHELL_CONFORMANCE_RECEIPT'];
    if (receipt !== undefined && receipt !== '') {
      mkdirSync(dirname(receipt), { recursive: true });
      writeFileSync(
        receipt,
        `${JSON.stringify(
          {
            suite: 'desktop:test:terminal-conformance',
            row,
            platform: process.platform,
            arch: process.arch,
            node: process.versions.node,
            source: {
              sha: process.env['GITHUB_SHA'],
              runId: process.env['GITHUB_RUN_ID'],
              repository: process.env['GITHUB_REPOSITORY'],
            },
            shell: probe.status === 'available' ? probe.shell.identity : probe,
            results,
          },
          undefined,
          2,
        )}\n`,
      );
    }
    if (root !== '') {
      rmSync(root, { recursive: true, force: true });
    }
  });

  anyRow('P01', 'the shell probe passes on this row (pipes)', async () => {
    expect(probe.status).toBe('available');
  });

  anyRow('R01', 'a project main no longer admits is refused before anything starts', async () => {
    const pane = openPane(join(root, 'projects', 'unadmitted'));
    pane.send({ type: 'open', size: { columns: 80, rows: 24 } });
    await pane.until(() => pane.of('refused').length > 0, 'refused');
    expect(pane.of('refused')[0]?.code).toBe('project-not-admitted');
    expect(pane.of('opened')).toEqual([]);
  });

  anyRow('R02', 'a forged frame ends the session with invalid-frame', async () => {
    const pane = openPane();
    pane.send({ type: 'open', size: { columns: 80, rows: 24 }, approved: true } as unknown as TerminalClientFrame);
    await pane.until(() => pane.of('refused').length > 0, 'refused');
    expect(pane.of('refused')[0]?.code).toBe('invalid-frame');
  });

  if (!ptyRows) {
    anyRow(
      'R03',
      'macOS without the operator-validated own-pty rule refuses the Terminal as pty-unavailable',
      async () => {
        const pane = openPane();
        pane.send({ type: 'open', size: { columns: 80, rows: 24 } });
        await pane.until(() => pane.of('refused').length > 0, 'refused');
        expect(pane.of('refused')[0]?.code).toBe('pty-unavailable');
      },
    );
  }

  conformance('T01', 'the shell reads a TTY and starts in the project', async () => {
    const pane = openPane();
    await opened(pane);
    await pane.run('test -t 0 && test -t 1 && echo TTY-$((1+1))', 'TTY-2');
    await pane.run('echo "PWD-$(pwd)-END"', `PWD-${project}-END`);
    await pane.run('cat ../other/canary.txt 2>/dev/null || echo DENIED-$((3+4))', 'DENIED-7');
    pane.send({ type: 'close' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
  });

  conformance('T02', 'the shell sees the size after a resize', async () => {
    const pane = openPane();
    await opened(pane);
    await pane.run('echo "SIZE-$(stty size | tr " " x)"', 'SIZE-24x80');
    pane.send({ type: 'resize', size: { columns: 132, rows: 43 } });
    await delay(300);
    await pane.run('echo "SIZE-$(stty size | tr " " x)"', 'SIZE-43x132');
    pane.send({ type: 'close' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
  });

  conformance('T03', 'Ctrl-C interrupts the foreground job and the shell survives', async () => {
    const pane = openPane();
    await opened(pane);
    pane.send({ type: 'input', data: 'sleep 60\r' });
    await delay(800);
    pane.send({ type: 'input', data: '\u0003' });
    await pane.run('echo "INT-$?-$((5*5))"', 'INT-130-25');
    pane.send({ type: 'close' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
  });

  conformance('T04', 'Ctrl-Z stops the foreground job and fg resumes it (job control)', async () => {
    const pane = openPane();
    await opened(pane);
    pane.send({ type: 'input', data: 'sleep 60\r' });
    await delay(800);
    pane.send({ type: 'input', data: '\u001A' });
    await pane.run('jobs -s | grep -c sleep | sed "s/^/STOPPED-/"', 'STOPPED-1');
    pane.send({ type: 'input', data: 'fg\r' });
    await delay(800);
    pane.send({ type: 'input', data: '\u0003' });
    await pane.run('echo "FG-$?-$((6*7))"', 'FG-130-42');
    pane.send({ type: 'close' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
  });

  conformance('T05', 'Ctrl-D at an empty prompt ends the shell with its own status', async () => {
    const pane = openPane();
    await opened(pane);
    /* The prompt only exists once expanded, so the typed line never matches; EOF waits for it. */
    await pane.run('p=PROMPT; PS1="$p-SET> "; echo READY-$((2+3))', 'READY-5');
    const ready = pane.text().indexOf('READY-5');
    await pane.until(() => pane.text().includes('PROMPT-SET> ', ready), 'the prompt before EOF');
    pane.send({ type: 'input', data: '\u0004' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
    expect(pane.of('exited')[0]).toMatchObject({ reason: 'shell-exited', exitCode: 0 });
  });

  conformance('T06', 'closing the pane leaves no writer', async () => {
    const pane = openPane();
    await opened(pane);
    const file = await startWriter(pane, 'close-writer.txt');
    pane.send({ type: 'close' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
    expect(pane.of('exited')[0]?.reason).toBe('closed');
    await expectStill(file);
  });

  conformance('T07', 'a pane that disconnects (renderer gone) leaves no writer', async () => {
    const pane = openPane();
    await opened(pane);
    const file = await startWriter(pane, 'disconnect-writer.txt');
    pane.disconnect();
    await delay(6000);
    await expectStill(file);
  });

  conformance('T08', 'a revoked project grant ends the session and leaves no writer', async () => {
    const pane = openPane();
    await opened(pane);
    const file = await startWriter(pane, 'revoke-writer.txt');
    host.handleMessage({ data: { type: 'allowRoots', roots: [other] }, ports: [] });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
    expect(pane.of('exited')[0]?.reason).toBe('project-changed');
    host.handleMessage({ data: { type: 'allowRoots', roots: [project, other] }, ports: [] });
    await expectStill(file);
  });

  conformance('T09', 'one Terminal per project and window', async () => {
    const pane = openPane();
    await opened(pane);
    const channel = new MessageChannel();
    const frames: unknown[] = [];
    channel.port2.on('message', (frame: unknown) => frames.push(frame));
    const served = channel.port1;
    const same = {
      postMessage: (message: unknown) => {
        served.postMessage(message);
      },
      on: (event: string, listener: (message: unknown) => void) => {
        served.on(
          event,
          event === 'message'
            ? (data: unknown) => {
                listener({ data });
              }
            : listener,
        );
      },
      start: () => {
        served.start();
      },
      close: () => {
        served.close();
      },
    } as unknown as UtilityPort;
    host.handleMessage({
      data: { type: 'concern', concern: 'terminal', context: { projectRoot: project, windowId: String(windows) } },
      ports: [same],
    });
    channel.port2.postMessage({ type: 'open', size: { columns: 80, rows: 24 } });
    await pane.until(() => frames.length > 0, 'session-limit');
    expect(frames[0]).toMatchObject({ type: 'refused', code: 'session-limit' });
    channel.port2.close();
    pane.send({ type: 'close' });
    await pane.until(() => pane.of('exited').length > 0, 'exited');
  });

  conformance('T10', 'quitting the services host leaves no writer', async () => {
    const pane = openPane();
    await opened(pane);
    const file = await startWriter(pane, 'quit-writer.txt');
    host.dispose();
    await pane.until(() => pane.of('exited').length > 0, 'exited', 15_000);
    expect(pane.of('exited')[0]?.reason).toBe('host-stopped');
    await expectStill(file);
  });
});
