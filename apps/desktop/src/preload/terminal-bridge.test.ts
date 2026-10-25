import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { desktopTerminalChannels } from '@taucad/types/desktop-terminal';
import type { TerminalHostFrame } from '@taucad/types/desktop-terminal';

import { createTerminalBridge } from '#preload/terminal-bridge.js';

const flush = async (): Promise<void> => {
  for (let index = 0; index < 5; index++) {
    // oxlint-disable-next-line no-await-in-loop -- lets message ports deliver.
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  }
};

const channels: MessageChannel[] = [];
afterEach(() => {
  for (const channel of channels.splice(0)) {
    channel.port1.close();
    channel.port2.close();
  }
  vi.useRealTimers();
});

const setup = (answerMilliseconds = 1000) => {
  const sent: Array<{ channel: string; payload: Record<string, unknown> }> = [];
  let onPort: ((event: IpcRendererEvent, payload: unknown) => void) | undefined;
  const bridge = createTerminalBridge(
    {
      send: ((channel: string, payload: Record<string, unknown>) => {
        sent.push({ channel, payload });
      }) as unknown as IpcRenderer['send'],
      on: ((channel: string, listener: (event: IpcRendererEvent, payload: unknown) => void) => {
        expect(channel).toBe(desktopTerminalChannels.port);
        onPort = listener;
      }) as unknown as IpcRenderer['on'],
    },
    { answerMilliseconds },
  );
  /** Main's answer: a port whose host end the test drives, or a refusal. */
  const answer = (requestId: string, refusal?: unknown) => {
    if (refusal !== undefined) {
      onPort!({ ports: [] } as unknown as IpcRendererEvent, { requestId, refusal });
      return undefined;
    }
    const channel = new MessageChannel();
    channels.push(channel);
    const host: unknown[] = [];
    channel.port1.on('message', (frame: unknown) => host.push(frame));
    onPort!({ ports: [channel.port2] } as unknown as IpcRendererEvent, { requestId });
    return {
      host,
      post: (frame: unknown) => {
        channel.port1.postMessage(frame);
      },
      port: channel.port1,
    };
  };
  const open = (projectRoot = '/projects/bracket') => {
    const frames: TerminalHostFrame[] = [];
    const session = bridge.open({ projectRoot, size: { columns: 80, rows: 24 } }, (frame) => frames.push(frame));
    return { session, frames };
  };
  return { bridge, sent, answer, open };
};

describe('terminal bridge', () => {
  it('should ask main once and open the session on the relayed port', async () => {
    const { sent, answer, open } = setup();
    const { session, frames } = open();
    expect(sent).toEqual([
      { channel: desktopTerminalChannels.open, payload: { requestId: 'terminal-1', projectRoot: '/projects/bracket' } },
    ]);
    const host = answer('terminal-1')!;
    await flush();
    expect(host.host).toEqual([{ type: 'open', size: { columns: 80, rows: 24 } }]);
    host.post({ type: 'output', data: 'hi', offset: 2 });
    await flush();
    expect(frames).toEqual([{ type: 'output', data: 'hi', offset: 2 }]);
    session.input('ls\r');
    session.ack(2);
    await flush();
    expect(host.host.slice(1)).toEqual([
      { type: 'input', data: 'ls\r' },
      { type: 'ack', offset: 2 },
    ]);
  });

  it('should deliver a refusal from main as the one final frame', async () => {
    const { answer, open } = setup();
    const { frames } = open();
    answer('terminal-1', { code: 'project-not-admitted', message: 'Not open.', recovery: 'Open it.' });
    await flush();
    expect(frames).toEqual([
      { type: 'refused', code: 'project-not-admitted', message: 'Not open.', recovery: 'Open it.' },
    ]);
  });

  it('should refuse after the bound when main never answers', async () => {
    vi.useFakeTimers();
    const { open } = setup(500);
    const { frames } = open();
    vi.advanceTimersByTime(501);
    expect(frames).toEqual([expect.objectContaining({ type: 'refused', code: 'sandbox-unavailable' })]);
  });

  it('should refuse an invalid request without asking main', async () => {
    const { sent, open } = setup();
    const { frames } = open('relative');
    await flush();
    expect(sent).toEqual([]);
    expect(frames).toEqual([expect.objectContaining({ code: 'invalid-frame' })]);
  });

  it('should never post a frame the wire does not allow', async () => {
    const { answer, open } = setup();
    const { session, frames } = open();
    const host = answer('terminal-1')!;
    await flush();
    session.input('');
    await flush();
    expect(host.host.at(-1)).toEqual({ type: 'close' });
    expect(frames).toEqual([expect.objectContaining({ code: 'invalid-frame' })]);
    session.input('after');
    await flush();
    expect(host.host.at(-1)).toEqual({ type: 'close' });
  });

  it('should drop a host frame that fails the schema and end the session', async () => {
    const { answer, open } = setup();
    const { frames } = open();
    const host = answer('terminal-1')!;
    await flush();
    host.post({ type: 'output', data: '<b>', offset: -1 });
    host.post({ type: 'output', data: 'after', offset: 5 });
    await flush();
    expect(frames).toEqual([expect.objectContaining({ code: 'invalid-frame' })]);
  });

  it('should close a port that arrives after the pane closed', async () => {
    const { answer, open } = setup();
    const { session, frames } = open();
    session.close();
    expect(frames).toEqual([{ type: 'exited', exitCode: null, signal: null, reason: 'closed' }]);
    const host = answer('terminal-1')!;
    const closed = vi.fn();
    host.port.on('close', closed);
    await flush();
    expect(host.host).toEqual([]);
    expect(closed).toHaveBeenCalled();
  });

  it('should keep the session after a stale access decision and end it once', async () => {
    const { answer, open } = setup();
    const { frames } = open();
    const host = answer('terminal-1')!;
    await flush();
    host.post({ type: 'refused', code: 'request-expired', message: 'Expired.', recovery: 'Ask again.' });
    host.post({ type: 'exited', exitCode: 0, signal: null, reason: 'replaced' });
    host.post({ type: 'output', data: 'new shell', offset: 9 });
    host.post({ type: 'exited', exitCode: 0, signal: null, reason: 'shell-exited' });
    host.post({ type: 'output', data: 'never', offset: 14 });
    await flush();
    expect(frames.map((frame) => frame.type)).toEqual(['refused', 'exited', 'output', 'exited']);
  });
});
