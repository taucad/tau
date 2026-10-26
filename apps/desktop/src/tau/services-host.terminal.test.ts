import { afterEach, describe, expect, it } from 'vitest';
import type { HostShell, ShellProbe, TerminalSession, TerminalSessionRequest } from '@taucad/host';
import { shellLimits } from '@taucad/host';
import { terminalHostFrameSchema, terminalLimits } from '@taucad/types/desktop-terminal';
import type { TerminalClientFrame, TerminalHostFrame } from '@taucad/types/desktop-terminal';

import { createTerminalConcern } from '#tau/services-host.terminal.js';
import type { TerminalConcern, TerminalConcernOptions, TerminalPort } from '#tau/services-host.terminal.js';

const flush = async (): Promise<void> => {
  for (let index = 0; index < 10; index++) {
    // oxlint-disable-next-line no-await-in-loop -- drains the concern's chained frame handlers.
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
};

/** A transferred port as `MessagePortMain` behaves: `{ data }` envelopes in, frames out, a close event. */
const createPort = () => {
  const listeners = {
    message: [] as Array<(message: unknown) => void>,
    close: [] as Array<(message: unknown) => void>,
  };
  const received: TerminalHostFrame[] = [];
  let closed = false;
  const port: TerminalPort = {
    postMessage(message) {
      received.push(terminalHostFrameSchema.parse(structuredClone(message)));
    },
    on(event, listener) {
      listeners[event].push(listener);
    },
    start() {
      /* Delivery is synchronous here. */
    },
    close() {
      closed = true;
    },
  };
  return {
    port,
    received,
    closed: () => closed,
    send(frame: TerminalClientFrame | Record<string, unknown>) {
      for (const listener of listeners.message) {
        listener({ data: structuredClone(frame) });
      }
    },
    disconnect() {
      for (const listener of listeners.close) {
        listener(undefined);
      }
    },
    of: <T extends TerminalHostFrame['type']>(type: T) =>
      received.filter((frame): frame is Extract<TerminalHostFrame, { type: T }> => frame.type === type),
  };
};

/** One fake PTY session whose output the test feeds and whose disposal stops it. */
const createSession = (request: TerminalSessionRequest) => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let wake: (() => void) | undefined;
  let ended = false;
  let pulled = 0;
  const writes: string[] = [];
  const sizes: unknown[] = [];
  const exit = Promise.withResolvers<{ exitCode: number }>();
  let disposed = false;
  const nextChunk = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      wake = resolve;
    });
  const end = (exitCode: number): void => {
    ended = true;
    wake?.();
    exit.resolve({ exitCode });
  };
  const session: TerminalSession = {
    id: `session-${Math.random().toString(16).slice(2)}`,
    access: request.access ?? { read: [], write: [], domains: [] },
    output: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const chunk = chunks.shift();
          if (chunk !== undefined) {
            pulled += chunk.byteLength;
            yield chunk;
            continue;
          }
          if (ended) {
            return;
          }
          // oxlint-disable-next-line no-await-in-loop -- waits for the test's next chunk.
          await nextChunk();
        }
      },
    },
    write(bytes) {
      writes.push(new TextDecoder().decode(bytes));
    },
    resize(size) {
      sizes.push(size);
    },
    exited: exit.promise,
    async [Symbol.asyncDispose]() {
      disposed = true;
      end(130);
      await exit.promise;
    },
  };
  return {
    session,
    request,
    writes,
    sizes,
    pulled: () => pulled,
    disposed: () => disposed,
    emit(data: string | Uint8Array<ArrayBuffer>) {
      chunks.push(typeof data === 'string' ? new TextEncoder().encode(data) : data);
      wake?.();
    },
    end,
  };
};

type FakeSession = ReturnType<typeof createSession>;

const createShell = (refuse?: string) => {
  const sessions: FakeSession[] = [];
  const shell: HostShell = {
    identity: { platform: 'linux', kind: 'bash', shellVersion: '5.2', shellDigest: 'sha256:0', provider: 'fake' },
    run: async () => {
      throw new Error('not under test');
    },
    openTerminal: async (request) => {
      if (refuse !== undefined) {
        return { status: 'refused', code: 'access-unsupported', message: refuse, recovery: 'Choose another folder.' };
      }
      const fake = createSession(request);
      sessions.push(fake);
      return { status: 'opened', session: fake.session };
    },
  };
  return { shell, sessions };
};

const projectRoot = '/projects/bracket';
const size = { columns: 80, rows: 24 };
let concern: TerminalConcern | undefined;

const setup = (overrides: Partial<TerminalConcernOptions> & { trusted?: Set<string> } = {}) => {
  const { shell, sessions } = createShell();
  const trusted = overrides.trusted ?? new Set([projectRoot]);
  let clock = 0;
  concern = createTerminalConcern({
    shell: async (): Promise<ShellProbe> => ({ status: 'available', shell }),
    isTrustedRoot: (root) => trusted.has(root),
    canonicalRoot: (root) => root,
    log: () => undefined,
    now: () => clock,
    ...overrides,
  });
  const connect = (windowId = '1', root = projectRoot) => {
    const port = createPort();
    concern!.serve(port.port, { projectRoot: root, windowId });
    return port;
  };
  return {
    concern,
    sessions,
    trusted,
    connect,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
  };
};

const opened = async (port: ReturnType<typeof createPort>): Promise<void> => {
  port.send({ type: 'open', size });
  await flush();
  expect(port.of('opened')).toHaveLength(1);
};

afterEach(async () => {
  await concern?.closeAll();
  concern = undefined;
});

describe('terminal concern', () => {
  it('should keep the wire access bound equal to the shell service limit', () => {
    expect(terminalLimits.accessEntries).toBe(shellLimits.accessEntries);
  });

  it('should open a session and carry input, resize and acknowledged output', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    expect(port.of('opened')[0]?.session.projectLabel).toBe('bracket');
    expect(sessions[0]?.request.projectRoot).toBe(projectRoot);
    expect(sessions[0]?.request.size).toEqual(size);

    port.send({ type: 'input', data: 'echo hé\r' });
    port.send({ type: 'resize', size: { columns: 120, rows: 40 } });
    sessions[0]!.emit('hé\r\n');
    await flush();

    expect(sessions[0]?.writes).toEqual(['echo hé\r']);
    expect(sessions[0]?.sizes).toEqual([{ columns: 120, rows: 40 }]);
    expect(port.of('output')).toEqual([{ type: 'output', data: 'hé\r\n', offset: 5 }]);
  });

  it('should decode a character split across chunks once', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    const bytes = new TextEncoder().encode('é');
    sessions[0]!.emit(bytes.slice(0, 1));
    sessions[0]!.emit(bytes.slice(1));
    await flush();
    expect(
      port
        .of('output')
        .map((frame) => frame.data)
        .join(''),
    ).toBe('é');
    expect(port.of('output').at(-1)?.offset).toBe(2);
  });

  it('should allow one Terminal per project and window', async () => {
    const { connect, sessions } = setup();
    const first = connect('1');
    await opened(first);
    const second = connect('1');
    second.send({ type: 'open', size });
    await flush();
    expect(second.of('refused')[0]?.code).toBe('session-limit');
    expect(second.closed()).toBe(true);
    const otherWindow = connect('2');
    await opened(otherWindow);
    expect(sessions).toHaveLength(2);
    expect(first.closed()).toBe(false);
  });

  it('should refuse a project main no longer admits before starting anything', async () => {
    const { connect, sessions } = setup({ trusted: new Set(), admissionMilliseconds: 0 });
    const port = connect();
    port.send({ type: 'open', size });
    await flush();
    expect(port.of('refused')[0]?.code).toBe('project-not-admitted');
    expect(sessions).toHaveLength(0);
  });

  it('should wait for main to admit a just-created project, then open its shell', async () => {
    const { concern: terminals, connect, sessions, trusted } = setup({ trusted: new Set() });
    const port = connect();
    port.send({ type: 'open', size });
    await flush();
    expect(port.of('refused')).toEqual([]);
    expect(port.closed()).toBe(false);
    expect(sessions).toHaveLength(0);
    /* An unrelated allowlist update while the start waits ends nothing. */
    terminals.revokeUntrusted();
    await flush();
    expect(port.closed()).toBe(false);
    /* The services host applies main's `allowRoots` frame: the waiting start goes on. */
    trusted.add(projectRoot);
    terminals.revokeUntrusted();
    await flush();
    expect(port.of('refused')).toEqual([]);
    expect(port.of('opened')).toHaveLength(1);
    expect(sessions).toHaveLength(1);
  });

  it('should refuse project-not-admitted once the admission bound passes without main admitting it', async () => {
    const { connect, sessions, advance } = setup({ trusted: new Set(), admissionMilliseconds: 20 });
    const port = connect();
    port.send({ type: 'open', size });
    await flush();
    expect(port.of('refused')).toEqual([]);
    advance(20);
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
    await flush();
    expect(port.of('refused')[0]?.code).toBe('project-not-admitted');
    expect(sessions).toHaveLength(0);
  });

  it('should refuse with the probe reason when the shell is unavailable', async () => {
    const { connect } = setup({
      shell: async () => ({
        status: 'unavailable',
        code: 'sandbox-unavailable',
        message: 'The Windows shell sandbox is not part of this Tau build.',
        recovery: 'Use Tau on macOS or Linux.',
      }),
    });
    const port = connect();
    port.send({ type: 'open', size });
    await flush();
    expect(port.of('refused')).toEqual([
      {
        type: 'refused',
        code: 'sandbox-unavailable',
        message: 'The Windows shell sandbox is not part of this Tau build.',
        recovery: 'Use Tau on macOS or Linux.',
      },
    ]);
  });

  it('should refuse when the desktop has no shell composed', async () => {
    const { connect } = setup({ shell: undefined });
    const port = connect();
    port.send({ type: 'open', size });
    await flush();
    expect(port.of('refused')[0]?.code).toBe('sandbox-unavailable');
  });

  it('should close a port whose context main did not mint', () => {
    setup();
    const port = createPort();
    concern!.serve(port.port, { projectRoot });
    expect(port.closed()).toBe(true);
  });

  it('should end the session on an invalid frame', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    port.send({ type: 'input', data: 'x', approved: true });
    await flush();
    expect(port.of('refused')[0]?.code).toBe('invalid-frame');
    expect(sessions[0]?.disposed()).toBe(true);
    expect(port.closed()).toBe(true);
  });

  it('should refuse an acknowledgement beyond what was sent', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    port.send({ type: 'ack', offset: 1 });
    await flush();
    expect(port.of('refused')[0]?.code).toBe('invalid-frame');
    expect(sessions[0]?.disposed()).toBe(true);
  });

  it('should stop the shell before it reports a closed session', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    port.send({ type: 'close' });
    await flush();
    expect(sessions[0]?.disposed()).toBe(true);
    expect(port.of('exited')).toEqual([{ type: 'exited', exitCode: 130, signal: null, reason: 'closed' }]);
    expect(port.closed()).toBe(true);
    expect(concern!.sessions()).toBe(0);
  });

  it('should stop the shell when the pane disconnects', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    port.disconnect();
    await flush();
    expect(sessions[0]?.disposed()).toBe(true);
    const again = connect();
    await opened(again);
  });

  it('should deliver the last output before the shell exit', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    sessions[0]!.emit('bye\r\n');
    sessions[0]!.end(0);
    await flush();
    expect(port.received.slice(1)).toEqual([
      { type: 'output', data: 'bye\r\n', offset: 5 },
      { type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' },
    ]);
    expect(port.closed()).toBe(true);
  });

  it('should stop pulling output past the unacknowledged bound until the pane acknowledges', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    const chunk = new Uint8Array(64 * 1024).fill(0x61);
    for (let index = 0; index < 8; index++) {
      sessions[0]!.emit(new Uint8Array(chunk));
    }
    await flush();
    /* Five chunks pass 256 KiB; the sixth is not pulled. */
    expect(sessions[0]?.pulled()).toBe(5 * 64 * 1024);
    port.send({ type: 'ack', offset: port.of('output').at(-1)!.offset });
    await flush();
    expect(sessions[0]?.pulled()).toBe(8 * 64 * 1024);
    expect(port.of('output').every((frame) => frame.data.length <= terminalLimits.outputCharacters)).toBe(true);
  });

  it('should open a fresh session for an allowed access request without replaying input', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    const access = { read: ['/suppliers/catalog'], write: [], domains: ['registry.npmjs.org'] };
    port.send({ type: 'input', data: 'typed before\r' });
    port.send({ type: 'request-access', access });
    await flush();
    const [requested] = port.of('access-requested');
    expect(requested?.access).toEqual(access);

    port.send({ type: 'decide-access', requestId: requested!.requestId, decision: 'allow' });
    port.send({ type: 'input', data: 'typed during replacement\r' });
    await flush();

    expect(sessions[0]?.disposed()).toBe(true);
    expect(port.of('exited')[0]?.reason).toBe('replaced');
    expect(sessions[1]?.request.access).toEqual(access);
    expect(port.of('opened')).toHaveLength(2);
    expect(port.of('opened')[1]?.session.access).toEqual(access);
    expect(sessions[1]?.writes).toEqual([]);
    sessions[0]!.emit('late output from the old shell');
    port.send({ type: 'input', data: 'after\r' });
    await flush();
    expect(sessions[1]?.writes).toEqual(['after\r']);
    expect(port.of('output')).toEqual([]);
  });

  it('should spend an access request id once', async () => {
    const { connect, sessions } = setup();
    const port = connect();
    await opened(port);
    port.send({ type: 'request-access', access: { read: [], write: ['/out'], domains: [] } });
    await flush();
    const { requestId } = port.of('access-requested')[0]!;
    port.send({ type: 'decide-access', requestId, decision: 'deny' });
    port.send({ type: 'decide-access', requestId, decision: 'allow' });
    await flush();
    expect(port.of('refused')).toEqual([expect.objectContaining({ code: 'request-expired' })]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.disposed()).toBe(false);
    expect(port.closed()).toBe(false);
  });

  it('should refuse a forged or expired access decision and keep the shell', async () => {
    const { connect, sessions, advance } = setup({ accessRequestMilliseconds: 1000 });
    const port = connect();
    await opened(port);
    port.send({ type: 'decide-access', requestId: 'forged', decision: 'allow' });
    port.send({ type: 'request-access', access: { read: ['/a'], write: [], domains: [] } });
    await flush();
    advance(1001);
    port.send({ type: 'decide-access', requestId: port.of('access-requested')[0]!.requestId, decision: 'allow' });
    await flush();
    expect(port.of('refused').map((frame) => frame.code)).toEqual(['request-expired', 'request-expired']);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.disposed()).toBe(false);
  });

  it('should not let another port answer a request it did not receive', async () => {
    const { connect, sessions } = setup();
    const first = connect('1');
    await opened(first);
    first.send({ type: 'request-access', access: { read: ['/a'], write: [], domains: [] } });
    await flush();
    const second = connect('2');
    await opened(second);
    second.send({ type: 'decide-access', requestId: first.of('access-requested')[0]!.requestId, decision: 'allow' });
    await flush();
    expect(second.of('refused')[0]?.code).toBe('request-expired');
    expect(sessions).toHaveLength(2);
  });

  it('should end a session whose project grant was revoked', async () => {
    const { connect, sessions, trusted } = setup();
    const port = connect();
    await opened(port);
    trusted.clear();
    concern!.revokeUntrusted();
    await flush();
    expect(sessions[0]?.disposed()).toBe(true);
    expect(port.of('exited')[0]?.reason).toBe('project-changed');
  });

  it('should stop every shell on quit before resolving', async () => {
    const { connect, sessions } = setup();
    const first = connect('1');
    const second = connect('2');
    await opened(first);
    await opened(second);
    await concern!.closeAll();
    expect(sessions.every((session) => session.disposed())).toBe(true);
    expect([...first.of('exited'), ...second.of('exited')].map((frame) => frame.reason)).toEqual([
      'host-stopped',
      'host-stopped',
    ]);
  });

  it('should stop a shell that finished starting after its pane left', async () => {
    const gate = Promise.withResolvers<void>();
    const { shell, sessions } = createShell();
    const { connect } = setup({
      shell: async () => {
        await gate.promise;
        return { status: 'available', shell };
      },
    });
    const port = connect();
    port.send({ type: 'open', size });
    await flush();
    port.send({ type: 'close' });
    gate.resolve();
    await flush();
    expect(sessions).toHaveLength(0);
    expect(port.of('opened')).toHaveLength(0);
    expect(port.of('exited')[0]?.reason).toBe('closed');
  });

  describe('quit (T15)', () => {
    it('should count only connections whose shell runs or is starting, not idle or ending ones', async () => {
      const gate = Promise.withResolvers<void>();
      const { shell } = createShell();
      const { concern: owner, connect } = setup({
        shell: async () => {
          await gate.promise;
          return { status: 'available', shell };
        },
      });
      const idle = connect('1');
      expect(owner.sessions()).toBe(0);
      const starting = connect('2');
      starting.send({ type: 'open', size });
      await flush();
      expect(owner.sessions()).toBe(1);
      gate.resolve();
      await flush();
      expect(starting.of('opened')).toHaveLength(1);
      expect(owner.sessions()).toBe(1);
      /* Ending counts as gone at once, before the shell has finished stopping. */
      starting.send({ type: 'close' });
      expect(owner.sessions()).toBe(0);
      await flush();
      expect(idle.closed()).toBe(false);
      expect(owner.sessions()).toBe(0);
    });

    it('should hold a start while quit holds starts, and open it once the quit is called off', async () => {
      const { concern: owner, connect, sessions } = setup();
      const running = connect('1');
      await opened(running);
      owner.holdStarts();
      expect(owner.sessions()).toBe(1);

      const late = connect('2');
      late.send({ type: 'open', size });
      await flush();
      /* The count quit asked about cannot grow: nothing opened, nothing refused. */
      expect(sessions).toHaveLength(1);
      expect(late.of('opened')).toHaveLength(0);
      expect(late.of('refused')).toHaveLength(0);
      expect(owner.sessions()).toBe(1);

      owner.releaseStarts();
      await flush();
      expect(late.of('opened')).toHaveLength(1);
      expect(owner.sessions()).toBe(2);
    });

    it('should open nothing held when quit stops every Terminal', async () => {
      const { concern: owner, connect, sessions } = setup();
      owner.holdStarts();
      const late = connect();
      late.send({ type: 'open', size });
      await flush();
      await owner.closeAll();
      await flush();
      expect(sessions).toHaveLength(0);
      expect(late.of('opened')).toHaveLength(0);
      expect(late.of('exited')[0]?.reason).toBe('host-stopped');
    });

    it('should keep holding starts after quit stops every Terminal, until the quit is called off', async () => {
      const { concern: owner, connect, sessions } = setup();
      const running = connect('1');
      await opened(running);
      await owner.closeAll();
      expect(running.of('exited')[0]?.reason).toBe('host-stopped');

      /* A pane that connects during the rest of quiesce and exit opens nothing that would be stopped unasked. */
      const late = connect('2');
      late.send({ type: 'open', size });
      await flush();
      expect(sessions).toHaveLength(1);
      expect(late.of('opened')).toHaveLength(0);
      expect(late.of('refused')).toHaveLength(0);
      expect(owner.sessions()).toBe(0);

      owner.releaseStarts();
      await flush();
      expect(late.of('opened')).toHaveLength(1);
      expect(sessions).toHaveLength(2);
    });

    it('should open at once when nothing holds starts (control)', async () => {
      const { connect, sessions } = setup();
      const port = connect();
      port.send({ type: 'open', size });
      await flush();
      expect(sessions).toHaveLength(1);
      expect(port.of('opened')).toHaveLength(1);
    });
  });
});
