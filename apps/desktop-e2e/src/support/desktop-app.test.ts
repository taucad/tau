import { EventEmitter } from 'node:events';
import type * as Electron from 'electron';
import type { IpcMain, IpcMainEvent, MessagePortMain, UtilityProcess, WebContents, WebFrameMain } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { desktopDescendants, installDesktopRuntimeLeaseObservation } from '#support/desktop-app.js';
import type { DesktopRuntimeLease } from '#support/desktop-app.js';

const state = globalThis as typeof globalThis & {
  tauE2eRuntimeLeases?: DesktopRuntimeLease[];
  tauE2eRestoreRuntimeLeases?: () => void;
};
const channel = 'taucad:connect-runtime';
const kernel = { serviceName: 'tau-kernel-host' };
const runtime = { taucadRuntime: true, runtimePortIndex: 0 };

const childFixture = (pid?: number) => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- Electron UtilityProcess requires native synchronous once/off listeners.
  const events = new EventEmitter();
  const post = vi.fn<UtilityProcess['postMessage']>();
  const child = mock<UtilityProcess>({ pid, postMessage: post });
  child.once.mockImplementation((kind, listener) => {
    events.once(kind, listener);
    return child;
  });
  child.off.mockImplementation((kind, listener) => {
    events.off(kind, listener);
    return child;
  });
  return { child, events, post };
};

const mainFixture = () => {
  // oxlint-disable-next-line unicorn/prefer-event-target -- Electron ipcMain.emit dispatches synchronous nested broker requests.
  const events = new EventEmitter();
  const ipcMain = mock<IpcMain>({ emit: events.emit.bind(events) });
  const utilityProcess = mock<typeof Electron.utilityProcess>();
  const children: Array<ReturnType<typeof childFixture>> = [];
  utilityProcess.fork.mockImplementation(() => {
    const child = childFixture(children.length === 1 ? undefined : 100 + children.length);
    children.push(child);
    return child.child;
  });
  const event = (id: number) =>
    mock<IpcMainEvent>({
      sender: mock<WebContents>({ id }),
      senderFrame: mock<WebFrameMain>({ processId: 20 + id, routingId: 40 + id }),
    });
  return { events, ipcMain, utilityProcess, children, event };
};

const relay = (event: IpcMainEvent, requestId: string, hostId: string): void => {
  event.senderFrame?.postMessage(`${channel}:port`, { requestId, hostId }, [mock<MessagePortMain>()]);
};

afterEach(() => {
  state.tauE2eRestoreRuntimeLeases?.();
  delete state.tauE2eRuntimeLeases;
});

describe('actual desktop runtime lease observation', () => {
  it('should roll back the fork patch when dispatch instrumentation cannot be installed', () => {
    const main = mainFixture();
    const originalFork = main.utilityProcess.fork;
    const originalEmit = main.ipcMain.emit;
    Object.defineProperty(main.ipcMain, 'emit', { value: originalEmit, writable: false });
    expect(() => {
      installDesktopRuntimeLeaseObservation(main);
    }).toThrow(TypeError);
    expect(main.utilityProcess.fork).toBe(originalFork);
    expect(main.ipcMain.emit).toBe(originalEmit);
    expect(state.tauE2eRuntimeLeases).toBeUndefined();
    expect(state.tauE2eRestoreRuntimeLeases).toBeUndefined();
  });

  it('should correlate adopted children across nested requests without selecting replacement spares', () => {
    const main = mainFixture();
    const originalFork = main.utilityProcess.fork;
    const originalEmit = main.ipcMain.emit;
    installDesktopRuntimeLeaseObservation(main);
    const warmed = main.utilityProcess.fork('real-kernel.mjs', [], kernel);
    const first = main.event(1);
    const second = main.event(2);
    const firstRelay = first.senderFrame!.postMessage;
    const secondRelay = second.senderFrame!.postMessage;
    let replacement: UtilityProcess | undefined;
    main.events.on(channel, (event: IpcMainEvent, request: { requestId: string }) => {
      if (request.requestId === 'outer') {
        warmed.postMessage(runtime, [mock<MessagePortMain>()]);
        replacement = main.utilityProcess.fork('real-kernel.mjs', [], kernel);
        replacement.pid = undefined;
        main.ipcMain.emit(channel, second, { requestId: 'inner', context: { purpose: 'ephemeral' } });
        relay(event, request.requestId, 'host-warmed');
      } else {
        if (!replacement) {
          throw new Error('The outer request did not create its replacement spare.');
        }
        replacement.postMessage(runtime, [mock<MessagePortMain>()]);
        main.utilityProcess.fork('real-kernel.mjs', [], kernel);
        relay(event, request.requestId, 'host-replacement');
      }
    });
    main.ipcMain.emit(channel, first, { requestId: 'outer', context: { projectRoot: '/admitted/project' } });
    replacement!.pid = 101;
    main.children[1]!.events.emit('spawn');
    expect(state.tauE2eRuntimeLeases).toEqual([
      {
        requestId: 'outer',
        hostId: 'host-warmed',
        pid: 100,
        webContentsId: 1,
        frameProcessId: 21,
        frameRoutingId: 41,
        context: { projectRoot: '/admitted/project' },
      },
      {
        requestId: 'inner',
        hostId: 'host-replacement',
        pid: 101,
        webContentsId: 2,
        frameProcessId: 22,
        frameRoutingId: 42,
        context: { purpose: 'ephemeral' },
      },
    ]);
    expect(main.children[0]!.post).toHaveBeenCalledOnce();
    expect(main.children[1]!.post).toHaveBeenCalledOnce();
    expect(main.children[2]!.post).not.toHaveBeenCalled();
    expect(first.senderFrame!.postMessage).toBe(firstRelay);
    expect(second.senderFrame!.postMessage).toBe(secondRelay);
    main.children[0]!.events.emit('exit', 0);
    warmed.pid = undefined;
    main.children[1]!.events.emit('exit', 9);
    replacement!.pid = undefined;
    main.children[2]!.events.emit('exit', 17);
    expect(state.tauE2eRuntimeLeases?.map(({ hostId, pid, exitCode }) => ({ hostId, pid, exitCode }))).toEqual([
      { hostId: 'host-warmed', pid: 100, exitCode: 0 },
      { hostId: 'host-replacement', pid: 101, exitCode: 9 },
    ]);
    state.tauE2eRestoreRuntimeLeases?.();
    expect(main.utilityProcess.fork).toBe(originalFork);
    expect(main.ipcMain.emit).toBe(originalEmit);
    for (const { child, events, post } of main.children) {
      expect(child.postMessage).toBe(post);
      expect(events.listenerCount('spawn')).toBe(0);
      expect(events.listenerCount('exit')).toBe(0);
    }
  });

  it('should reject an unobserved startup child and a handoff delivered after synchronous dispatch', () => {
    const main = mainFixture();
    const startup = main.utilityProcess.fork('real-kernel.mjs', [], kernel);
    installDesktopRuntimeLeaseObservation(main);
    const event = main.event(1);
    const originalRelay = event.senderFrame!.postMessage;
    let late: (() => void) | undefined;
    main.events.on(channel, (incoming: IpcMainEvent, request: { requestId: string }) => {
      if (request.requestId === 'startup') {
        startup.postMessage(runtime, [mock<MessagePortMain>()]);
        main.utilityProcess.fork('real-kernel.mjs', [], kernel);
        relay(incoming, request.requestId, 'host-startup');
      } else {
        const child = main.utilityProcess.fork('real-kernel.mjs', [], kernel);
        late = () => {
          child.postMessage(runtime, [mock<MessagePortMain>()]);
          relay(incoming, request.requestId, 'host-late');
        };
      }
    });
    main.ipcMain.emit(channel, event, { requestId: 'startup' });
    main.ipcMain.emit(channel, event, { requestId: 'late' });
    late!();
    expect(state.tauE2eRuntimeLeases).toEqual([
      {
        requestId: 'startup',
        hostId: 'host-startup',
        gap: 'unobserved-child',
        webContentsId: 1,
        frameProcessId: 21,
        frameRoutingId: 41,
        context: {},
      },
      {
        requestId: 'late',
        gap: 'no-synchronous-served-handoff',
        webContentsId: 1,
        frameProcessId: 21,
        frameRoutingId: 41,
        context: {},
      },
    ]);
    expect(event.senderFrame!.postMessage).toBe(originalRelay);
  });

  it('should restore frame observation on refusal or broker exception and leave non-kernel forks untouched', () => {
    const main = mainFixture();
    installDesktopRuntimeLeaseObservation(main);
    const event = main.event(1);
    const originalRelay = event.senderFrame!.postMessage;
    main.events.on(channel, (incoming: IpcMainEvent, request: { requestId: string }) => {
      if (request.requestId === 'exception') {
        throw new TypeError('real broker failure');
      }
      const services = main.utilityProcess.fork('real-services.mjs', [], { serviceName: 'tau-services-host' });
      services.postMessage(runtime, [mock<MessagePortMain>()]);
      incoming.senderFrame?.postMessage(`${channel}:port`, { requestId: request.requestId, error: 'refused' });
    });
    main.ipcMain.emit(channel, event, { requestId: 'refused' });
    expect(main.children[0]!.child.postMessage).toBe(main.children[0]!.post);
    expect(event.senderFrame!.postMessage).toBe(originalRelay);
    const failure = (): void => {
      main.ipcMain.emit(channel, event, { requestId: 'exception' });
    };
    expect(failure).toThrow(TypeError);
    expect(failure).toThrow('real broker failure');
    expect(() => main.ipcMain.emit(channel, event, { requestId: 'exception-2' })).not.toThrow();
    expect(event.senderFrame!.postMessage).toBe(originalRelay);
    expect(
      state.tauE2eRuntimeLeases?.every(({ gap, pid }) => gap === 'no-synchronous-served-handoff' && pid === undefined),
    ).toBe(true);
  });

  it('should keep unavailable frame instrumentation from throwing into the real broker', () => {
    const main = mainFixture();
    installDesktopRuntimeLeaseObservation(main);
    const event = main.event(1);
    const originalRelay = event.senderFrame!.postMessage;
    Object.defineProperty(event.senderFrame, 'postMessage', { value: originalRelay, writable: false });
    main.events.on(channel, (incoming: IpcMainEvent) => {
      const child = main.utilityProcess.fork('real-kernel.mjs', [], kernel);
      child.postMessage(runtime, [mock<MessagePortMain>()]);
      relay(incoming, 'unavailable', 'host-real');
    });
    expect(() => main.ipcMain.emit(channel, event, { requestId: 'unavailable' })).not.toThrow();
    expect(originalRelay).toHaveBeenCalledExactlyOnceWith(
      `${channel}:port`,
      { requestId: 'unavailable', hostId: 'host-real' },
      expect.any(Array),
    );
    expect(state.tauE2eRuntimeLeases?.[0]?.gap).toBe('frame-restoration-failed');
  });
});

describe('desktop process ownership', () => {
  const snapshot =
    '100 1 Tau\n101 100 renderer\n102 101 PicoGK Worker\n103 102 PicoGK Nested Viewer\n200 1 PicoGK Foreign Viewer\n300 301 cycle\n301 300 PicoGK Cycle Viewer';

  it('should ignore foreign Viewers and retain every owned descendant command', () => {
    expect(desktopDescendants(100, '100 1 Tau\n101 100 PicoGK Direct Viewer')).toEqual([
      { pid: 101, command: 'PicoGK Direct Viewer' },
    ]);
    expect(desktopDescendants(100, snapshot)).toEqual([
      { pid: 101, command: 'renderer' },
      { pid: 102, command: 'PicoGK Worker' },
      { pid: 103, command: 'PicoGK Nested Viewer' },
    ]);
    expect(
      desktopDescendants(100, snapshot)
        .map(({ command }) => command)
        .join('\n'),
    ).toMatch(/PicoGK.*Viewer/u);
    expect(
      desktopDescendants(100, '100 1 Tau\n101 100 renderer\n200 1 PicoGK Foreign Viewer')
        .map(({ command }) => command)
        .join('\n'),
    ).not.toMatch(/PicoGK.*Viewer/u);
  });

  it.each([undefined, 0, -1, Number.NaN, 1.5, 999])('should refuse invalid or absent owner %s', (owner) => {
    expect(() => desktopDescendants(owner, snapshot)).toThrow('Electron owner is absent or invalid');
    expect(() => desktopDescendants(owner, snapshot)).toThrow(Error);
  });
});
