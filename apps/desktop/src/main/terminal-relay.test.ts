import { describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent, MessagePortMain } from 'electron';
import { desktopTerminalChannels } from '@taucad/types/desktop-terminal';

import { registerTerminalRelay } from '#main/terminal-relay.js';
import type { TerminalRelayOptions } from '#main/terminal-relay.js';

class QuitRefusal extends Error {}

const setup = (overrides: Partial<TerminalRelayOptions> = {}) => {
  let handler: ((event: IpcMainEvent, payload: unknown) => void) | undefined;
  const port = { close: vi.fn() } as unknown as MessagePortMain;
  const connect = vi.fn((_context: Readonly<{ projectRoot: string; windowId: string }>) => port);
  registerTerminalRelay({
    ipcMain: {
      on: ((channel: string, listener: (event: IpcMainEvent, payload: unknown) => void) => {
        expect(channel).toBe(desktopTerminalChannels.open);
        handler = listener;
      }) as TerminalRelayOptions['ipcMain']['on'],
    },
    trusted: (frame) => (frame as { trusted?: boolean } | undefined)?.trusted === true,
    isTrustedRoot: (root) => root === '/projects/bracket',
    windowIdOf: () => 7,
    connect,
    isQuiescing: (error) => error instanceof QuitRefusal,
    log: () => undefined,
    ...overrides,
  });
  const ask = (payload: unknown, trusted = true) => {
    const postMessage = vi.fn();
    handler!({ senderFrame: { trusted, postMessage }, sender: {} } as unknown as IpcMainEvent, payload);
    return postMessage;
  };
  return { ask, connect, port };
};

describe('terminal relay', () => {
  it('should mint a port with the window id main read, not one the renderer named', () => {
    const { ask, connect, port } = setup();
    const answer = ask({ requestId: 'terminal-1', projectRoot: '/projects/bracket', windowId: '99' });
    expect(connect).toHaveBeenCalledWith({ projectRoot: '/projects/bracket', windowId: '7' });
    expect(answer).toHaveBeenCalledWith(desktopTerminalChannels.port, { requestId: 'terminal-1' }, [port]);
  });

  it('should refuse a root the registry never admitted without reaching the services host', () => {
    const { ask, connect } = setup();
    const answer = ask({ requestId: 'terminal-1', projectRoot: '/elsewhere' });
    expect(connect).not.toHaveBeenCalled();
    expect(answer).toHaveBeenCalledWith(
      desktopTerminalChannels.port,
      {
        requestId: 'terminal-1',
        refusal: expect.objectContaining({ code: 'project-not-admitted' }) as unknown,
      },
      undefined,
    );
  });

  it('should ignore a document that is not the app', () => {
    const { ask, connect } = setup();
    const answer = ask({ requestId: 'terminal-1', projectRoot: '/projects/bracket' }, false);
    expect(connect).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });

  it('should refuse a malformed root', () => {
    const { ask, connect } = setup();
    const answer = ask({ requestId: 'terminal-1', projectRoot: 'relative/path' });
    expect(connect).not.toHaveBeenCalled();
    expect(answer.mock.calls[0]?.[1]).toMatchObject({ refusal: { code: 'invalid-frame' } });
  });

  it('should answer a quit refusal instead of leaving the request pending', () => {
    const { ask } = setup({
      connect: () => {
        throw new QuitRefusal();
      },
    });
    const answer = ask({ requestId: 'terminal-1', projectRoot: '/projects/bracket' });
    expect(answer.mock.calls[0]?.[1]).toMatchObject({
      refusal: { code: 'sandbox-unavailable', message: 'Tau is quitting and starts no new Terminal.' },
    });
  });

  it('should close the port when the asking document is gone', () => {
    const { connect, port } = setup();
    let handler: ((event: IpcMainEvent, payload: unknown) => void) | undefined;
    registerTerminalRelay({
      ipcMain: {
        on: ((_channel: string, listener: (event: IpcMainEvent, payload: unknown) => void) => {
          handler = listener;
        }) as TerminalRelayOptions['ipcMain']['on'],
      },
      trusted: () => true,
      isTrustedRoot: () => true,
      windowIdOf: () => 1,
      connect,
      isQuiescing: () => false,
      log: () => undefined,
    });
    handler!(
      {
        senderFrame: {
          postMessage: () => {
            throw new Error('Render frame was disposed');
          },
        },
        sender: {},
      } as unknown as IpcMainEvent,
      { requestId: 'terminal-1', projectRoot: '/projects/bracket' },
    );
    expect(port.close).toHaveBeenCalled();
  });
});
