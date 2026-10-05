import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type * as Electron from 'electron';
import type { IpcMain, IpcMainEvent, MessagePortMain, UtilityProcess, WebContents, WebFrameMain } from 'electron';
import type { _electron as electron, BrowserContext, ElectronApplication, Page } from 'playwright';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { desktopDescendants, installDesktopRuntimeLeaseObservation, launchDesktopApp } from '#support/desktop-app.js';
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
  vi.restoreAllMocks();
  state.tauE2eRestoreRuntimeLeases?.();
  delete state.tauE2eRuntimeLeases;
});

const startupRoot = resolve(import.meta.dirname, '../../../../out/test-results/desktop-e2e');
const startupEntries = async (): Promise<Set<string>> => {
  const entries = await readdir(startupRoot).catch(() => []);
  return new Set(entries.filter((entry) => entry.startsWith('startup-')));
};

const mockedLaunch = (firstWindow: () => Promise<Page>) => {
  const child = mock<ChildProcess>({ pid: 12_345, exitCode: null, signalCode: null, stdout: null, stderr: null });
  const application = mock<ElectronApplication>();
  application.process.mockReturnValue(child);
  application.context.mockReturnValue(mock<BrowserContext>());
  application.firstWindow.mockImplementation(firstWindow);
  const launch = vi.fn<typeof electron.launch>().mockResolvedValue(application);
  return { application, child, launch };
};

describe('desktop startup ownership before a session is returned', () => {
  it('should retain the failing startup stage and terminate the launched child without replacing the cause', async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-startup-test-'));
    const before = await startupEntries();
    const primary = new Error('first window failed');
    const { child, launch } = mockedLaunch(async () => {
      throw primary;
    });
    try {
      await expect(
        launchDesktopApp({ token: 'unit-test-only', profileRoot, launchElectron: launch }),
      ).rejects.toMatchObject({
        cause: primary,
      });
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      const created = [...(await startupEntries())].filter((entry) => !before.has(entry));
      expect(created).toHaveLength(1);
      const stage = JSON.parse(await readFile(join(startupRoot, created[0]!, 'stage.json'), 'utf8')) as {
        stage: string;
        status: string;
        /** Milliseconds. */
        elapsed: number;
        pid: number;
      };
      expect(stage).toMatchObject({ stage: 'first-window', status: 'failed', pid: 12_345 });
      expect(stage.elapsed).toBeGreaterThanOrEqual(0);
      await rm(join(startupRoot, created[0]!), { recursive: true, force: true });
    } finally {
      const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
      if (picked) {
        await rm(dirname(picked), { recursive: true, force: true });
      }
      await rm(profileRoot, { recursive: true, force: true });
    }
  });

  it('should terminate the launched child on test finish when no session was handed to the caller', async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-startup-test-'));
    const before = await startupEntries();
    let rejectFirstWindow: ((error: Error) => void) | undefined;
    const pendingCause = new Error('owned child terminated');
    const firstWindow = new Promise<Page>((_resolve, reject) => {
      rejectFirstWindow = reject;
    });
    const { application, child, launch } = mockedLaunch(async () => firstWindow);
    child.kill.mockImplementation(() => {
      rejectFirstWindow?.(pendingCause);
      return true;
    });
    const observation: { failure?: Promise<unknown> } = {};
    onTestFinished(async () => {
      if (!observation.failure) {
        throw new Error('Startup observation was never initiated.');
      }
      const error: unknown = await observation.failure;
      expect(error).toMatchObject({ cause: pendingCause });
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      const created = [...(await startupEntries())].filter((entry) => !before.has(entry));
      expect(created).toHaveLength(1);
      const stage = JSON.parse(await readFile(join(startupRoot, created[0]!, 'stage.json'), 'utf8')) as {
        stage: string;
        status: string;
        pid: number;
      };
      expect(stage).toMatchObject({ stage: 'first-window', status: 'failed', pid: 12_345 });
      await rm(join(startupRoot, created[0]!), { recursive: true, force: true });
      const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
      if (picked) {
        await rm(dirname(picked), { recursive: true, force: true });
      }
      await rm(profileRoot, { recursive: true, force: true });
    });
    observation.failure = (async (): Promise<unknown> => {
      try {
        await launchDesktopApp({ token: 'unit-test-only', profileRoot, launchElectron: launch });
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    await vi.waitFor(() => {
      expect(application.firstWindow).toHaveBeenCalledOnce();
    });
  });

  it('should refuse a session when tracing resolves after test finish killed its child', async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-startup-test-'));
    const before = await startupEntries();
    let resolveTracing: (() => void) | undefined;
    const tracingStarted = new Promise<void>((resolve) => {
      resolveTracing = resolve;
    });
    const tracing = mock<BrowserContext['tracing']>();
    tracing.start.mockReturnValue(tracingStarted);
    const context = mock<BrowserContext>({ tracing });
    const page = mock<Page>();
    page.context.mockReturnValue(context);
    const { child, launch } = mockedLaunch(async () => page);
    const observation: { result?: Promise<unknown> } = {};
    onTestFinished(async () => {
      try {
        resolveTracing?.();
        const error: unknown = await observation.result;
        expect(error).toMatchObject({
          cause: new Error('Desktop startup finished before a session was returned.'),
        });
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');
        const created = [...(await startupEntries())].filter((entry) => !before.has(entry));
        expect(created).toHaveLength(1);
        const stage = JSON.parse(await readFile(join(startupRoot, created[0]!, 'stage.json'), 'utf8')) as {
          stage: string;
          status: string;
          pid: number;
        };
        expect(stage).toMatchObject({ stage: 'trace-start', status: 'failed', pid: 12_345 });
        const report = JSON.parse(await readFile(join(startupRoot, created[0]!, 'trace-pending.json'), 'utf8')) as {
          status: string;
          samples: unknown[];
        };
        expect(report).toMatchObject({ status: 'test-finished', samples: [] });
        await rm(join(startupRoot, created[0]!), { recursive: true, force: true });
      } finally {
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
        await rm(profileRoot, { recursive: true, force: true });
      }
    });
    observation.result = (async (): Promise<unknown> => {
      try {
        await launchDesktopApp({
          token: 'unit-test-only',
          profileRoot,
          startupDiagnostic: true,
          launchElectron: launch,
        });
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    await vi.waitFor(() => {
      expect(tracing.start).toHaveBeenCalledOnce();
    });
    const created = [...(await startupEntries())].filter((entry) => !before.has(entry));
    expect(created).toHaveLength(1);
    const pending = JSON.parse(await readFile(join(startupRoot, created[0]!, 'stage.json'), 'utf8')) as {
      stage: string;
      status: string;
    };
    expect(pending).toMatchObject({ stage: 'trace-start', status: 'pending' });
  });

  it('should retain two renderer CPU samples with the same process identity while tracing remains pending', async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-startup-test-'));
    const before = await startupEntries();
    let resolveTracing: (() => void) | undefined;
    const tracingStarted = new Promise<void>((resolve) => {
      resolveTracing = resolve;
    });
    const tracing = mock<BrowserContext['tracing']>();
    tracing.start.mockReturnValue(tracingStarted);
    const context = mock<BrowserContext>({ tracing });
    const page = mock<Page>();
    page.context.mockReturnValue(context);
    const { application, child, launch } = mockedLaunch(async () => page);
    const sample = (cpu: number) => ({
      status: 'selected',
      windowCount: 1,
      webContentsId: 7,
      rendererPid: 31,
      creationTime: 42,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Electron's CPU fields keep their external names.
      cpu: { percentCPUUsage: cpu, cumulativeCPUUsage: cpu },
    });
    application.evaluate
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(sample(0))
      .mockResolvedValueOnce(sample(1.25));
    const observation: { result?: Promise<unknown> } = {};
    onTestFinished(async () => {
      try {
        resolveTracing?.();
        const error: unknown = await observation.result;
        expect(error).toMatchObject({
          cause: new Error('Desktop startup finished before a session was returned.'),
        });
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');
        const created = [...(await startupEntries())].filter((entry) => !before.has(entry));
        expect(created).toHaveLength(1);
        const stage = JSON.parse(await readFile(join(startupRoot, created[0]!, 'stage.json'), 'utf8')) as {
          stage: string;
          status: string;
        };
        expect(stage).toMatchObject({ stage: 'trace-start', status: 'failed' });
        await rm(join(startupRoot, created[0]!), { recursive: true, force: true });
      } finally {
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
        await rm(profileRoot, { recursive: true, force: true });
      }
    });
    observation.result = (async (): Promise<unknown> => {
      try {
        await launchDesktopApp({
          token: 'unit-test-only',
          profileRoot,
          startupDiagnostic: true,
          launchElectron: launch,
        });
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    await vi.waitFor(
      async () => {
        const created = [...(await startupEntries())].filter((entry) => !before.has(entry));
        expect(created).toHaveLength(1);
        const report = JSON.parse(await readFile(join(startupRoot, created[0]!, 'trace-pending.json'), 'utf8')) as {
          status: string;
          samples: Array<{ rendererPid: number; creationTime: number; cpu: { cumulativeCPUUsage: number } }>;
        };
        expect(report.status).toBe('selected');
        expect(report.samples).toHaveLength(2);
        expect(report.samples.map((sample) => [sample.rendererPid, sample.creationTime])).toEqual([
          [31, 42],
          [31, 42],
        ]);
        expect(report.samples.map((sample) => sample.cpu.cumulativeCPUUsage)).toEqual([0, 1.25]);
      },
      { timeout: 6000 },
    );
    const readMain = application.evaluate.mock.calls[1]?.[0];
    if (typeof readMain !== 'function') {
      throw new TypeError('The main-side observation callback was not installed.');
    }
    const electronMain = mockDeep<typeof Electron>();
    electronMain.BrowserWindow.getAllWindows.mockReturnValue([]);
    expect(readMain(electronMain, undefined)).toEqual({ status: 'missing-window', windowCount: 0 });
    electronMain.BrowserWindow.getAllWindows.mockReturnValue([
      mock<Electron.BrowserWindow>(),
      mock<Electron.BrowserWindow>(),
    ]);
    expect(readMain(electronMain, undefined)).toEqual({ status: 'ambiguous-window', windowCount: 2 });
  }, 10_000);

  it.each([
    [
      'main-evaluate-refused',
      async (): Promise<never> => {
        throw new Error('private main refusal');
      },
    ],
    [
      'main-evaluate-timeout',
      async (): Promise<never> =>
        new Promise<never>(() => {
          // Deliberately unresolved: the bounded main-side observation must time out.
        }),
    ],
  ])(
    'should retain %s without replacing a later tracing failure',
    async (status, mainEvaluation) => {
      const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-startup-test-'));
      const before = await startupEntries();
      let rejectTracing: ((error: Error) => void) | undefined;
      const tracingStarted = new Promise<void>((_resolve, reject) => {
        rejectTracing = reject;
      });
      const tracing = mock<BrowserContext['tracing']>();
      tracing.start.mockReturnValue(tracingStarted);
      const context = mock<BrowserContext>({ tracing });
      const page = mock<Page>();
      page.context.mockReturnValue(context);
      const { application, child, launch } = mockedLaunch(async () => page);
      application.evaluate.mockResolvedValueOnce(undefined).mockImplementationOnce(mainEvaluation);
      const original = new Error('original trace failure');
      const result = (async (): Promise<unknown> => {
        try {
          await launchDesktopApp({
            token: 'unit-test-only',
            profileRoot,
            startupDiagnostic: true,
            launchElectron: launch,
          });
          return undefined;
        } catch (error) {
          return error;
        }
      })();
      let created: string | undefined;
      try {
        await vi.waitFor(
          async () => {
            const entries = [...(await startupEntries())].filter((entry) => !before.has(entry));
            expect(entries).toHaveLength(1);
            created = entries[0];
            const report = JSON.parse(await readFile(join(startupRoot, created!, 'trace-pending.json'), 'utf8')) as {
              status: string;
              samples: unknown[];
              errorName?: string;
            };
            expect(report.status).toBe(status);
            expect(report.samples).toEqual([]);
            if (status === 'main-evaluate-refused') {
              expect(report.errorName).toBe('Error');
            }
          },
          { timeout: 9000 },
        );
        rejectTracing?.(original);
        const failure = await result;
        expect(failure).toMatchObject({ cause: original });
        expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      } finally {
        rejectTracing?.(original);
        await result;
        if (created) {
          await rm(join(startupRoot, created), { recursive: true, force: true });
        }
        const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
        if (picked) {
          await rm(dirname(picked), { recursive: true, force: true });
        }
        await rm(profileRoot, { recursive: true, force: true });
      }
    },
    12_000,
  );
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
