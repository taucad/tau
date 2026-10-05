import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type * as Electron from 'electron';
import type { IpcMain, IpcMainEvent, MessagePortMain, UtilityProcess, WebContents, WebFrameMain } from 'electron';
import type { _electron as electron, BrowserContext, ElectronApplication, Frame, Page } from 'playwright';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { desktopDescendants, installDesktopRuntimeLeaseObservation, launchDesktopApp } from '#support/desktop-app.js';
// oxlint-disable-next-line no-restricted-imports -- The standalone runner has no configured project import alias.
import { createProtocolMetadataCollector } from '../../scripts/run-completed-artifact.mts';

import type { DesktopRuntimeLease } from '#support/desktop-app.js';

describe('opt-in protocol metadata collector', () => {
  const send = (body: Record<string, unknown>): string =>
    `2026-10-06T00:00:00.000Z pw:protocol SEND ► ${JSON.stringify(body)}`;
  const receive = (body: Record<string, unknown>): string =>
    `2026-10-06T00:00:00.000Z pw:protocol ◀ RECV ${JSON.stringify(body)}`;

  it('should settle only a uniquely qualified session command and discard protocol bodies', () => {
    const collector = createProtocolMetadataCollector();
    expect(collector.consume('ordinary diagnostic')).toBe(false);
    expect(
      collector.consume(
        send({ id: 1, method: 'Runtime.evaluate', sessionId: 'frame-A', params: { expression: 'private' } }),
      ),
    ).toBe(true);
    expect(
      collector.consume(
        send({ id: 1, method: 'Runtime.evaluate', sessionId: 'frame-B', params: { expression: 'private' } }),
      ),
    ).toBe(true);
    collector.consume(receive({ id: 1, sessionId: 'frame-B', result: { value: 'private' } }));
    const result = collector.snapshot();
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]?.settledAt).toBeUndefined();
    expect(result.commands[1]?.outcome).toBe('ok');
    expect(result.commands[0]?.sessionHash).not.toBe(result.commands[1]?.sessionHash);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('frame-A');
  });

  it('should refuse clipped and oversized records before any pending command is created', () => {
    const collector = createProtocolMetadataCollector();
    collector.consume(
      `${send({ id: 2, method: 'Runtime.evaluate', sessionId: 'frame-A' })} <<<<<( LOG TRUNCATED )>>>>>`,
    );
    collector.consume(`${send({ id: 3, method: 'Runtime.evaluate', sessionId: 'frame-A' })}${'x'.repeat(131_073)}`);
    collector.consume(`${send({ id: 5, method: 'Runtime.evaluate', sessionId: 'frame-A' })}${'😀'.repeat(32_769)}`);
    collector.consume('pw:protocol SEND ► malformed');
    collector.consume(send({ id: 4, method: 'Runtime.evaluate' }));
    collector.consume(receive({ id: 4, result: {} }));
    expect(collector.snapshot()).toMatchObject({ counts: { refused: 4, unqualified: 2 }, commands: [] });
  });

  it('should refuse ambiguous session matches and keep the command ring bounded', () => {
    const collector = createProtocolMetadataCollector();
    collector.consume(send({ id: 5, method: 'Runtime.evaluate', sessionId: 'same' }));
    collector.consume(send({ id: 5, method: 'Runtime.evaluate', sessionId: 'same' }));
    collector.consume(receive({ id: 5, sessionId: 'same', result: {} }));
    for (let id = 6; id < 266; id++) {
      collector.consume(send({ id, method: 'Runtime.evaluate', sessionId: 'same' }));
    }
    const result = collector.snapshot();
    expect(result.counts).toMatchObject({ refused: 1, dropped: 6 });
    expect(result.commands).toHaveLength(256);
    expect(result.commands[0]?.id).toBe(10);
  });
});

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
    context.pages.mockReturnValue([page]);
    page.frames.mockReturnValue([]);
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
    context.pages.mockReturnValue([page]);
    page.frames.mockReturnValue([]);
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
          traceEnter: number;
          mainIpc: Array<{ enter: number; exit: number }>;
        };
        expect(report.status).toBe('selected');
        expect(report.samples).toHaveLength(2);
        expect(report.traceEnter).toBeGreaterThanOrEqual(0);
        expect(report.mainIpc).toHaveLength(2);
        expect(report.mainIpc.every(({ enter, exit }) => exit >= enter && enter >= report.traceEnter)).toBe(true);
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

  it('should retain the same pending trace and cleanup while the finite control sends no main IPC', async () => {
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
    context.pages.mockReturnValue([page]);
    page.frames.mockReturnValue([]);
    const { application, child, launch } = mockedLaunch(async () => page);
    const original = new Error('original trace refusal');
    const result = (async (): Promise<unknown> => {
      try {
        await launchDesktopApp({
          token: 'unit-test-only',
          profileRoot,
          startupDiagnostic: true,
          startupDiagnosticNoMainIpc: true,
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
            mainIpc: unknown[];
          };
          expect(report).toMatchObject({ status: 'control-no-main-ipc', samples: [], mainIpc: [] });
        },
        { timeout: 6000 },
      );
      expect(application.evaluate).toHaveBeenCalledOnce(); // The required pre-trace main override only.
      rejectTracing?.(original);
      expect(await result).toMatchObject({ cause: original });
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      const settled = JSON.parse(await readFile(join(startupRoot, created!, 'trace-settled.json'), 'utf8')) as {
        status: string;
        elapsed: number;
      };
      expect(settled.status).toBe('rejected');
      expect(settled.elapsed).toBeGreaterThanOrEqual(0);
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
  }, 9000);

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
      context.pages.mockReturnValue([page]);
      page.frames.mockReturnValue([]);
      const { application, child, launch } = mockedLaunch(async () => page);
      const lateEvaluation = status === 'main-evaluate-timeout' ? Promise.withResolvers<unknown>() : undefined;
      application.evaluate
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(lateEvaluation ? async () => lateEvaluation.promise : mainEvaluation);
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
              mainIpc: Array<{ enter: number; exit?: number; raceSettled?: number }>;
            };
            expect(report.status).toBe(status);
            expect(report.samples).toEqual([]);
            expect(report.mainIpc).toHaveLength(1);
            expect(report.mainIpc[0]?.raceSettled).toBeGreaterThanOrEqual(report.mainIpc[0]!.enter);
            if (status === 'main-evaluate-refused') {
              expect(report.errorName).toBe('Error');
              expect(report.mainIpc[0]?.exit).toBeLessThanOrEqual(report.mainIpc[0]!.raceSettled!);
            } else {
              expect(report.mainIpc[0]).not.toHaveProperty('exit');
            }
          },
          { timeout: 9000 },
        );
        if (lateEvaluation) {
          lateEvaluation.resolve('late main result');
          await vi.waitFor(async () => {
            const report = JSON.parse(await readFile(join(startupRoot, created!, 'trace-pending.json'), 'utf8')) as {
              status: string;
              mainIpc: Array<{ exit?: number; raceSettled: number }>;
            };
            expect(report.status).toBe('main-evaluate-timeout');
            expect(report.mainIpc[0]?.exit).toBeGreaterThanOrEqual(report.mainIpc[0]!.raceSettled);
          });
        }
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

  it('should retain other pages and subframe lifecycle while tracing is pending, then remove listeners', async () => {
    const profileRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-startup-test-'));
    const before = await startupEntries();
    const original = new Error('trace refused after context observation');
    const tracingStarted = Promise.withResolvers<void>();
    const tracing = mock<BrowserContext['tracing']>();
    tracing.start.mockReturnValue(tracingStarted.promise);
    const context = mock<BrowserContext>({ tracing });
    // oxlint-disable-next-line unicorn/prefer-event-target -- Playwright pages expose Node-style on/off event names.
    const contextEvents = new EventEmitter();
    context.on.mockImplementation((event, listener) => {
      contextEvents.on(event, listener);
      return context;
    });
    context.off.mockImplementation((event, listener) => {
      contextEvents.off(event, listener);
      return context;
    });
    const page = mock<Page>();
    const otherPage = mock<Page>();
    // oxlint-disable-next-line unicorn/prefer-event-target -- Playwright pages expose Node-style on/off event names.
    const otherEvents = new EventEmitter();
    otherPage.on.mockImplementation((event, listener) => {
      otherEvents.on(event, listener);
      return otherPage;
    });
    otherPage.off.mockImplementation((event, listener) => {
      otherEvents.off(event, listener);
      return otherPage;
    });
    const mainFrame = mock<Frame>();
    mainFrame.url.mockReturnValue('app://tau/');
    mainFrame.parentFrame.mockReturnValue(null);
    const childFrame = mock<Frame>();
    childFrame.url.mockReturnValue('about:blank');
    childFrame.parentFrame.mockReturnValue(mainFrame);
    page.context.mockReturnValue(context);
    page.frames.mockReturnValue([]);
    otherPage.frames.mockReturnValue([mainFrame, childFrame]);
    otherPage.frames.mockReturnValueOnce([
      mainFrame,
      childFrame,
      ...Array.from({ length: 15 }, () => {
        const frame = mock<Frame>();
        frame.url.mockReturnValue('about:blank');
        frame.parentFrame.mockReturnValue(mainFrame);
        return frame;
      }),
    ]);
    const excessPages = Array.from({ length: 7 }, () => {
      const extra = mock<Page>();
      extra.frames.mockReturnValue([]);
      return extra;
    });
    context.pages.mockReturnValue([page, otherPage, ...excessPages]);
    const { child, launch } = mockedLaunch(async () => page);
    const result = launchDesktopApp({
      token: 'unit-test-only',
      profileRoot,
      startupDiagnostic: true,
      startupDiagnosticNoMainIpc: true,
      launchElectron: launch,
    });
    // oxlint-disable-next-line promise/prefer-await-to-then -- Observe an early launch failure while assertions await trace entry.
    const observedResult = result.catch(() => undefined);
    let created: string | undefined;
    try {
      await vi.waitFor(() => {
        expect(tracing.start).toHaveBeenCalledOnce();
      });
      expect(otherEvents.listenerCount('frameattached')).toBe(1);
      context.pages.mockReturnValue([page, otherPage]);
      otherEvents.emit('frameattached', childFrame);
      for (let index = 0; index < 71; index++) {
        otherEvents.emit('framenavigated', childFrame);
      }
      otherEvents.emit('close');
      await vi.waitFor(
        async () => {
          const entries = [...(await startupEntries())].filter((entry) => !before.has(entry));
          expect(entries).toHaveLength(1);
          created = entries[0];
          const report = JSON.parse(await readFile(join(startupRoot, created!, 'trace-pending.json'), 'utf8')) as {
            status: string;
            context: {
              initial: { pageCount: number; truncatedPages: number; pages: Array<{ frameCount: number }> };
              current: {
                pageCount: number;
                everPageOverflow: boolean;
                everFrameOverflow: boolean;
                droppedEvents: number;
                events: Array<{ kind: string; page: number; frame?: number }>;
              };
            };
          };
          expect(report.status).toBe('control-no-main-ipc');
          expect(report.context.initial.pageCount).toBe(9);
          expect(report.context.initial.truncatedPages).toBe(1);
          expect(report.context.initial.pages.slice(0, 2).map(({ frameCount }) => frameCount)).toEqual([0, 17]);
          expect(report.context.current.pageCount).toBe(2);
          expect(report.context.current.everPageOverflow).toBe(true);
          expect(report.context.current.everFrameOverflow).toBe(true);
          expect(report.context.current.events).toHaveLength(64);
          expect(report.context.current.droppedEvents).toBe(9);
          expect(report.context.current.events.at(-1)?.kind).toBe('page-closed');
          expect(report.context.current.events[0]?.kind).toBe('frame-navigated');
          expect(report.context.current.events[0]?.frame).toBe(report.context.current.events[62]?.frame);
        },
        { timeout: 6000 },
      );
      tracingStarted.reject(original);
      await expect(result).rejects.toMatchObject({ cause: original });
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      expect(contextEvents.listenerCount('page')).toBe(0);
      expect(otherEvents.listenerCount('frameattached')).toBe(0);
      expect(otherEvents.listenerCount('framenavigated')).toBe(0);
      expect(otherEvents.listenerCount('close')).toBe(0);
    } finally {
      tracingStarted.reject(original);
      await observedResult;
      if (created) {
        await rm(join(startupRoot, created), { recursive: true, force: true });
      }
      const picked = launch.mock.calls[0]?.[0]?.env?.['TAU_E2E_PICK_DIRECTORY'];
      if (picked) {
        await rm(dirname(picked), { recursive: true, force: true });
      }
      await rm(profileRoot, { recursive: true, force: true });
    }
  }, 9000);
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
