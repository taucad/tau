/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are the platform's. */
import { describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent, MessagePortMain } from 'electron';
import { desktopAgentSignInChannels } from '@taucad/types/desktop-agent-sign-in';
import type { AgentSignInHostFrame } from '@taucad/types/desktop-agent-sign-in';
import { terminalLimits } from '@taucad/types/desktop-terminal';

import { registerAgentSignIn } from '#main/agent-sign-in.js';
import type {
  AgentSignInLaunch,
  AgentSignInOptions,
  AgentSignInPty,
  AgentSignInPtyBinding,
} from '#main/agent-sign-in.js';

/** A profile-driven agent no vendor ships: nothing below is keyed by a real agent id. */
const launch: AgentSignInLaunch = {
  file: '/Users/someone/.acme/bin/acme',
  args: ['account', 'sign-in'],
  env: { PATH: '/usr/bin', HOME: '/Users/someone', ACME_HOME: '/tmp/empty-acme', UNSET: undefined },
  commandLine: "'/Users/someone/.acme/bin/acme' account sign-in",
};

/** One end of a fake `MessageChannelMain`, recording what main posts. */
const fakePort = () => {
  const listeners = new Map<string, Array<(message: unknown) => void>>();
  const posted: AgentSignInHostFrame[] = [];
  const port = {
    posted,
    closed: false,
    postMessage: (message: AgentSignInHostFrame) => {
      posted.push(message);
    },
    on: (event: string, listener: (message: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return port;
    },
    start: vi.fn(),
    close: () => {
      port.closed = true;
    },
    /** What the page's end would send. */
    send: (data: unknown) => {
      for (const listener of listeners.get('message') ?? []) {
        listener({ data });
      }
    },
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) {
        listener(undefined);
      }
    },
  };
  return port;
};

/** A fake node-pty terminal. */
const fakePty = () => {
  let data: ((chunk: string) => void) | undefined;
  let exit: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  const pty = {
    onData: (listener: (chunk: string) => void) => {
      data = listener;
    },
    onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
      exit = listener;
    },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    print: (chunk: string) => data?.(chunk),
    exit: (exitCode: number, signal?: number) => exit?.(signal === undefined ? { exitCode } : { exitCode, signal }),
  } satisfies AgentSignInPty & Record<string, unknown>;
  return pty;
};

const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const setup = (overrides: Partial<AgentSignInOptions> = {}) => {
  let handler: ((event: IpcMainEvent, payload: unknown) => void) | undefined;
  const pty = fakePty();
  const spawn = vi.fn<AgentSignInPtyBinding['spawn']>(() => pty);
  const log = vi.fn<AgentSignInOptions['log']>();
  const ports: Array<ReturnType<typeof fakePort>> = [];
  const launchOf = vi.fn((agentId: string) => (agentId === 'acme' ? launch : undefined));
  const relay = registerAgentSignIn({
    ipcMain: {
      on: ((channel: string, listener: (event: IpcMainEvent, payload: unknown) => void) => {
        expect(channel).toBe(desktopAgentSignInChannels.open);
        handler = listener;
      }) as AgentSignInOptions['ipcMain']['on'],
    },
    trusted: (frame) => (frame as { trusted?: boolean } | undefined)?.trusted === true,
    launchOf,
    loadPty: async () => ({ spawn }),
    createChannel: () => {
      const port1 = fakePort();
      const port2 = fakePort();
      ports.push(port1);
      return { port1: port1 as unknown as MessagePortMain, port2: port2 as unknown as MessagePortMain };
    },
    home: '/Users/fallback',
    log,
    ...overrides,
  });
  const destroyed: Array<() => void> = [];
  const ask = (payload: unknown, trusted = true) => {
    const postMessage = vi.fn();
    handler!(
      {
        senderFrame: { trusted, postMessage },
        sender: { once: (_event: string, listener: () => void) => destroyed.push(listener) },
      } as unknown as IpcMainEvent,
      payload,
    );
    return postMessage;
  };
  return { ask, spawn, pty, log, ports, relay, launchOf, destroyed };
};

describe('agent sign-in relay', () => {
  it('should hand the page a port and the filled-in command, and start nothing before Enter', async () => {
    const { ask, spawn, ports } = setup();

    const answer = ask({ requestId: 'sign-in-1', agentId: 'acme' });
    await settle();

    expect(answer).toHaveBeenCalledWith(desktopAgentSignInChannels.port, { requestId: 'sign-in-1' }, [
      expect.anything(),
    ]);
    expect(ports[0]?.posted).toEqual([{ type: 'ready', commandLine: launch.commandLine }]);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("should not pass typed input anywhere before the person's Enter starts the CLI", async () => {
    const { ask, spawn, pty, ports } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });

    ports[0]?.send({ type: 'input', data: 'x' });
    await settle();

    expect(spawn).not.toHaveBeenCalled();
    expect(pty.write).not.toHaveBeenCalled();
  });

  it("should start the agent's own CLI with the launch's file, arguments and environment, never a shell", async () => {
    const { ask, spawn, ports, launchOf } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });

    ports[0]?.send({ type: 'start', size: { columns: 100, rows: 30 } });
    await settle();

    expect(launchOf).toHaveBeenCalledTimes(2);
    expect(spawn).toHaveBeenCalledWith(launch.file, launch.args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: '/Users/someone',
      env: {
        PATH: '/usr/bin',
        HOME: '/Users/someone',
        ACME_HOME: '/tmp/empty-acme',
        TERM: 'xterm-256color',
      },
    });
  });

  it('should write nothing to the CLI itself, no newline included, and relay only what the person types', async () => {
    const { ask, pty, ports } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    expect(pty.write).not.toHaveBeenCalled();
    ports[0]?.send({ type: 'input', data: 'pasted-code\r' });
    expect(pty.write).toHaveBeenCalledExactlyOnceWith('pasted-code\r');
  });

  it('should relay output to the page and never into the log', async () => {
    const { ask, pty, ports, log } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    pty.print('Open https://vendor.example/oauth?code=secret-value\r\n');
    ports[0]?.send({ type: 'input', data: 'typed-secret\r' });
    pty.exit(0);

    expect(ports[0]?.posted).toContainEqual({
      type: 'output',
      data: 'Open https://vendor.example/oauth?code=secret-value\r\n',
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('vendor.example');
    expect(logged).not.toContain('secret-value');
    expect(logged).not.toContain('typed-secret');
  });

  it('should never split an emoji that straddles the output bound', async () => {
    const { ask, pty, ports } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    pty.print(`${'a'.repeat(terminalLimits.outputCharacters - 1)}😀`);

    const pieces = ports[0]?.posted.filter((frame) => frame.type === 'output').map((frame) => frame.data) ?? [];
    expect(pieces).toEqual(['a'.repeat(terminalLimits.outputCharacters - 1), '😀']);
  });

  it('should ignore a resize after the terminal has already closed', async () => {
    const { ask, pty, ports } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();
    pty.resize.mockImplementation(() => {
      throw new Error('ioctl(2) failed, EBADF');
    });

    expect(() => {
      ports[0]?.send({ type: 'resize', size: { columns: 100, rows: 30 } });
    }).not.toThrow();
    expect(ports[0]?.closed).toBe(false);
  });

  it('should end the tab when the CLI exits and allow a new sign-in afterwards', async () => {
    const { ask, pty, ports, relay } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    pty.exit(0);

    expect(ports[0]?.posted.at(-1)).toEqual({ type: 'exited', exitCode: 0, signal: null });
    expect(ports[0]?.closed).toBe(true);
    expect(relay.sessions()).toBe(0);
    const again = ask({ requestId: 'sign-in-2', agentId: 'acme' });
    expect(again.mock.calls[0]?.[1]).toEqual({ requestId: 'sign-in-2' });
  });

  it('should allow one running sign-in per agent at a time', async () => {
    const { ask, ports, spawn } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    const second = ask({ requestId: 'sign-in-2', agentId: 'acme' });

    expect(second.mock.calls[0]?.[1]).toMatchObject({ refusal: { code: 'already-signing-in' } });
    expect(spawn).toHaveBeenCalledOnce();
  });

  it('should replace a tab that never ran its CLI, so only one sign-in per agent is ever open', () => {
    const { ask, ports, relay } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });

    const second = ask({ requestId: 'sign-in-2', agentId: 'acme' });

    expect(second.mock.calls[0]?.[1]).toEqual({ requestId: 'sign-in-2' });
    expect(ports[0]?.closed).toBe(true);
    expect(relay.sessions()).toBe(1);
  });

  it('should refuse an agent this computer has not discovered', () => {
    const { ask, spawn } = setup();

    const answer = ask({ requestId: 'sign-in-1', agentId: 'unknown' });

    expect(answer.mock.calls[0]?.[1]).toMatchObject({ refusal: { code: 'agent-not-found' } });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('should refuse at Enter when the CLI vanished after the tab opened', async () => {
    const { ask, spawn, ports, launchOf } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    launchOf.mockImplementation(() => {
      throw Object.assign(new Error('/Users/someone/.acme/bin/acme is gone.'), { code: 'CLI_NOT_FOUND' });
    });

    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    expect(spawn).not.toHaveBeenCalled();
    expect(ports[0]?.posted.at(-1)).toMatchObject({ type: 'refused', code: 'cli-not-found' });
    expect(JSON.stringify(ports[0]?.posted.at(-1))).not.toContain('/Users/someone');
  });

  it('should stop the CLI when its window closes', async () => {
    const { ask, pty, ports, destroyed, relay } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    for (const listener of destroyed) {
      listener();
    }

    expect(pty.kill).toHaveBeenCalled();
    expect(relay.sessions()).toBe(0);
  });

  it('should report a CLI a signal ended by its signal, never as exit 0', async () => {
    const { ask, pty, ports, log } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    pty.exit(0, 15);

    expect(ports[0]?.posted.at(-1)).toEqual({ type: 'exited', exitCode: null, signal: '15' });
    expect(log).toHaveBeenCalledWith('info', 'agent-sign-in.exited', { agentId: 'acme', exitCode: null, signal: '15' });
  });

  it('should log a CLI Tau stopped as stopped, not as an exit', async () => {
    const { ask, pty, ports, log } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    ports[0]?.emit('close');
    pty.exit(0, 1);

    expect(log).toHaveBeenCalledWith('info', 'agent-sign-in.stopped', { agentId: 'acme' });
    expect(log.mock.calls.some(([, event]) => event === 'agent-sign-in.exited')).toBe(false);
  });

  it("should stop the CLI when the page's port closes", async () => {
    const { ask, pty, ports } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    ports[0]?.emit('close');

    expect(pty.kill).toHaveBeenCalled();
  });

  it('should stop every CLI on quit', async () => {
    const { ask, pty, ports, relay } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    relay.closeAll();

    expect(pty.kill).toHaveBeenCalled();
    expect(relay.sessions()).toBe(0);
  });

  it('should start the CLI at most once', async () => {
    const { ask, spawn, ports } = setup();
    ask({ requestId: 'sign-in-1', agentId: 'acme' });

    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    ports[0]?.send({ type: 'start', size: { columns: 80, rows: 24 } });
    await settle();

    expect(spawn).toHaveBeenCalledOnce();
  });

  it('should ignore a document that is not the app', () => {
    const { ask, launchOf } = setup();

    const answer = ask({ requestId: 'sign-in-1', agentId: 'acme' }, false);

    expect(answer).not.toHaveBeenCalled();
    expect(launchOf).not.toHaveBeenCalled();
  });
});
