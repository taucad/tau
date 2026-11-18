import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it } from 'vitest';
import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { desktopAgentSignInChannels } from '@taucad/types/desktop-agent-sign-in';
import type { AgentSignInHostFrame } from '@taucad/types/desktop-agent-sign-in';

import { createAgentSignInBridge } from '#preload/agent-sign-in-bridge.js';

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
});

const setup = () => {
  const sent: Array<{ channel: string; payload: Record<string, unknown> }> = [];
  let onPort: ((event: IpcRendererEvent, payload: unknown) => void) | undefined;
  const bridge = createAgentSignInBridge(
    {
      send: ((channel: string, payload: Record<string, unknown>) => {
        sent.push({ channel, payload });
      }) as unknown as IpcRenderer['send'],
      on: ((channel: string, listener: (event: IpcRendererEvent, payload: unknown) => void) => {
        expect(channel).toBe(desktopAgentSignInChannels.port);
        onPort = listener;
      }) as unknown as IpcRenderer['on'],
    },
    { answerMilliseconds: 1000 },
  );
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
    };
  };
  const open = (agentId = 'acme') => {
    const frames: AgentSignInHostFrame[] = [];
    const session = bridge.open(agentId, (frame) => frames.push(frame));
    return { session, frames };
  };
  return { sent, answer, open };
};

describe('agent sign-in bridge', () => {
  it('should send main the agent id and nothing it could run', () => {
    const { sent, open } = setup();

    open('acme');

    expect(sent).toEqual([
      { channel: desktopAgentSignInChannels.open, payload: { requestId: 'agent-sign-in-1', agentId: 'acme' } },
    ]);
  });

  it('should deliver the filled-in command and output, and send start and input only when the page asks', async () => {
    const { answer, open } = setup();
    const { session, frames } = open();
    const host = answer('agent-sign-in-1');

    host?.post({ type: 'ready', commandLine: 'acme account sign-in' });
    await flush();
    expect(frames).toEqual([{ type: 'ready', commandLine: 'acme account sign-in' }]);
    expect(host?.host).toEqual([]);

    session.start({ columns: 80, rows: 24 });
    session.input('\r');
    host?.post({ type: 'output', data: 'Signed in.' });
    await flush();

    expect(host?.host).toEqual([
      { type: 'start', size: { columns: 80, rows: 24 } },
      { type: 'input', data: '\r' },
    ]);
    expect(frames.at(-1)).toEqual({ type: 'output', data: 'Signed in.' });
  });

  it("should deliver main's refusal and end the session", () => {
    const { answer, open } = setup();
    const { frames } = open();

    answer('agent-sign-in-1', { code: 'already-signing-in', message: 'A sign-in for this agent is already open.' });

    expect(frames).toEqual([
      { type: 'refused', code: 'already-signing-in', message: 'A sign-in for this agent is already open.' },
    ]);
  });

  it('should refuse a frame the wire does not allow', async () => {
    const { answer, open } = setup();
    const { frames } = open();
    const host = answer('agent-sign-in-1');

    host?.post({ type: 'output', data: 'x', extra: true });
    await flush();

    expect(frames).toEqual([expect.objectContaining({ type: 'refused', code: 'invalid-frame' })]);
  });

  it('should refuse an empty agent id without asking main', async () => {
    const { sent, open } = setup();
    const { frames } = open('');
    await flush();

    expect(sent).toEqual([]);
    expect(frames).toEqual([expect.objectContaining({ type: 'refused', code: 'invalid-frame' })]);
  });
});
