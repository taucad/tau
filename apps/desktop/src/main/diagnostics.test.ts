/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDiagnosticsLog,
  forwardRendererDiagnostics,
  forwardUtilityDiagnostics,
  kernelUtilityDiagnostics,
  pagesThatCanSave,
  watchRendererHangs,
} from '#main/diagnostics.js';

const logDirectory = (): string => mkdtempSync(join(tmpdir(), 'tau-diagnostics-'));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('createDiagnosticsLog', () => {
  it('should format console levels like the API while keeping the file plain and detailed', () => {
    vi.stubEnv('TAU_DEBUG', 'true');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = createDiagnosticsLog({ directory: logDirectory() });
    const hash = '050cd13ce2b252a2dcd93bdad7d42eee9719a2de31953aca8c9e4589fa65395d';
    const detail = {
      message: `[Kernel:worker] cache computed for ${hash}`,
      source: 'http://localhost:3001/worker.ts',
      line: 7,
    };

    log.log('debug', 'renderer.console', detail);
    log.log('info', 'renderer.console', detail);
    log.log('warn', 'renderer.console', detail);
    log.log('error', 'renderer.console', detail);

    const outputs = [debug, info, warn, error].map((spy) => String(spy.mock.calls[0]?.[0]));
    expect(outputs).toEqual([
      expect.stringContaining('\u001B[34mDEBUG\u001B[39m:'),
      expect.stringContaining('\u001B[32mINFO\u001B[39m:'),
      expect.stringContaining('\u001B[33mWARN\u001B[39m:'),
      expect.stringContaining('\u001B[31mERROR\u001B[39m:'),
    ]);
    for (const output of outputs) {
      expect(output).toMatch(/^\[desktop\] \[\d{2}:\d{2}:\d{2}\.\d{3}\]/u);
      expect(output).toContain('[Kernel:worker] cache computed for 050cd13c…');
      expect(output).not.toContain('[renderer.console]');
      expect(output).not.toContain(hash);
      expect(output).not.toContain('localhost');
    }

    const file = readFileSync(log.filePath, 'utf8');
    expect(file).toContain(
      `DEBUG renderer.console {"message":"[Kernel:worker] cache computed for ${hash}","source":"http://localhost:3001/worker.ts","line":7}`,
    );
    expect(file).not.toContain('\u001B');
  });

  it('should hide debug and collapse consecutive duplicate terminal records without dropping file records', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = createDiagnosticsLog({ directory: logDirectory(), producer: 'services' });

    log.log('debug', 'services.starting');
    log.log('warn', 'renderer.console', { message: 'duplicate warning' });
    log.log('warn', 'renderer.console', { message: 'duplicate warning' });
    log.log('warn', 'renderer.console', { message: 'duplicate warning' });
    log.log('info', 'services.agent-host-served');

    expect(debug).not.toHaveBeenCalled();
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('duplicate warning'),
      expect.stringContaining('↳ repeated ×2'),
    ]);
    expect(String(info.mock.calls[0]?.[0])).toContain('[agent-host-served]');
    await log.flush();
    expect(readFileSync(log.filePath, 'utf8').match(/duplicate warning/gu)).toHaveLength(3);
  });

  it('records level, event, and detail on one line', () => {
    const directory = logDirectory();
    const log = createDiagnosticsLog({ directory, echo: false });
    log.log('error', 'renderer.did-fail-load', { errorCode: -6, url: 'app://tau/' });
    const [line] = readFileSync(log.filePath, 'utf8').trim().split('\n');
    expect(line).toMatch(/ERROR renderer\.did-fail-load \{"errorCode":-6,"url":"app:\/\/tau\/"\}$/u);
  });

  it('unwraps an Error rather than serialising it to {}', () => {
    const directory = logDirectory();
    const log = createDiagnosticsLog({ directory, echo: false });
    log.log('error', 'kernel.broker', new Error('untrusted project root'));
    expect(readFileSync(log.filePath, 'utf8')).toContain('untrusted project root');
  });

  it('rotates once the file passes its threshold', async () => {
    const directory = logDirectory();
    const log = createDiagnosticsLog({ directory, echo: false, maxBytes: 32 });
    writeFileSync(log.filePath, 'x'.repeat(64));
    log.log('info', 'after.rotation');
    await log.flush();
    expect(existsSync(join(directory, 'desktop.1.log'))).toBe(true);
    expect(readFileSync(log.filePath, 'utf8')).toContain('after.rotation');
  });

  it('should keep three rotated generations and drop the oldest', async () => {
    const directory = logDirectory();
    const log = createDiagnosticsLog({ directory, echo: false, maxBytes: 32 });
    for (let generation = 1; generation <= 4; generation += 1) {
      writeFileSync(log.filePath, `generation ${String(generation)} `.padEnd(64, 'x'));
      log.log('info', 'after.rotation', { generation });
      // oxlint-disable-next-line no-await-in-loop -- each rotation must land before the next file is written
      await log.flush();
    }
    expect(readFileSync(join(directory, 'desktop.1.log'), 'utf8')).toContain('generation 4');
    expect(readFileSync(join(directory, 'desktop.2.log'), 'utf8')).toContain('generation 3');
    expect(readFileSync(join(directory, 'desktop.3.log'), 'utf8')).toContain('generation 2');
    expect(existsSync(join(directory, 'desktop.4.log'))).toBe(false);
  });

  it('should open the log under the system temporary folder when its directory cannot be created', () => {
    const parent = logDirectory();
    /* A file where the log directory's parent should be: `mkdir` fails whatever the account's privileges. */
    const blocked = join(parent, 'not-a-directory');
    writeFileSync(blocked, 'occupied');
    let log: ReturnType<typeof createDiagnosticsLog> | undefined;
    expect(() => {
      log = createDiagnosticsLog({ directory: join(blocked, 'logs'), echo: false });
    }).not.toThrow();
    expect(log?.filePath.startsWith(tmpdir())).toBe(true);
    log?.log('error', 'main.bootstrap-failed', { step: 'home-directory' });
    expect(readFileSync(log!.filePath, 'utf8')).toContain('main.bootstrap-failed');
  });

  it('should fall back when the log file cannot be opened for append in a directory that exists', () => {
    const directory = logDirectory();
    /* A directory where the log file should be: the open fails whatever the account's privileges. */
    mkdirSync(join(directory, 'desktop.log'));
    const log = createDiagnosticsLog({ directory, echo: false });
    expect(log.filePath.startsWith(tmpdir())).toBe(true);
    expect(dirname(log.filePath)).not.toBe(directory);
    log.log('error', 'main.bootstrap-failed');
    expect(readFileSync(log.filePath, 'utf8')).toContain('main.bootstrap-failed');
  });

  it('should keep the fallback log in a fresh private folder no other account can name in advance', () => {
    const parent = logDirectory();
    const blocked = join(parent, 'not-a-directory');
    writeFileSync(blocked, 'occupied');
    const first = createDiagnosticsLog({ directory: join(blocked, 'logs'), echo: false });
    const second = createDiagnosticsLog({ directory: join(blocked, 'logs'), echo: false });
    first.log('error', 'main.bootstrap-failed');
    const folder = dirname(first.filePath);
    expect(folder).not.toBe(dirname(second.filePath));
    expect(lstatSync(folder).isSymbolicLink()).toBe(false);
    expect(lstatSync(folder).mode % 0o1000).toBe(0o700);
    expect(statSync(first.filePath).mode % 0o1000).toBe(0o600);
  });

  it('never throws when the log cannot be written', () => {
    const log = createDiagnosticsLog({ directory: logDirectory(), echo: false });
    expect(() => {
      log.log(
        'info',
        'cyclic',
        (() => {
          const value: Record<string, unknown> = {};
          value['self'] = value;
          return value;
        })(),
      );
    }).not.toThrow();
  });
});

describe('createDiagnosticsLog main-thread cost', () => {
  it('should write no non-error record on the calling thread and the whole burst on flush', async () => {
    const log = createDiagnosticsLog({ directory: logDirectory(), echo: false });

    /* A chatty kernel's stderr arrives a chunk at a time on main's event loop. */
    for (let index = 0; index < 100; index += 1) {
      log.log('warn', 'kernel.stderr', { chunk: `line ${String(index)}` });
    }

    /* Opening the log creates the file empty; no record lands until the flush. */
    expect(readFileSync(log.filePath, 'utf8')).toBe('');
    await log.flush();
    const lines = readFileSync(log.filePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(100);
    expect(lines[0]).toContain('"line 0"');
    expect(lines.at(-1)).toContain('"line 99"');
  });

  it('should write an error record at once, after every record queued before it', () => {
    const log = createDiagnosticsLog({ directory: logDirectory(), echo: false });

    log.log('info', 'before.crash');
    log.log('error', 'kernel.broker', new Error('fatal'));

    const file = readFileSync(log.filePath, 'utf8');
    expect(file).toMatch(/^\S+ INFO before\.crash\n\S+ ERROR kernel\.broker Error: fatal\n/u);
  });
});

describe('forwarders', () => {
  it('logs renderer failures and recovers only from unexpected exits', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const log = { filePath: '', log: vi.fn() };
    const recover = vi.fn();
    forwardRendererDiagnostics(
      {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          handlers.set(event, listener);
        },
      },
      log,
      { recover },
    );
    handlers.get('did-fail-load')?.({}, -6, 'ERR_FILE_NOT_FOUND', 'app://tau/');
    handlers.get('render-process-gone')?.({}, { reason: 'crashed' });
    handlers.get('render-process-gone')?.({}, { reason: 'clean-exit' });
    for (const [lineNumber, level] of ['debug', 'info', 'warning', 'error', 'unknown'].entries()) {
      handlers.get('console-message')?.({
        level,
        message: `${level} message`,
        sourceId: 'app://tau/index.js',
        lineNumber,
      });
    }

    expect(log.log.mock.calls.map(([, event]: readonly unknown[]) => event)).toEqual([
      'renderer.did-fail-load',
      'renderer.render-process-gone',
      'renderer.render-process-gone',
      'renderer.console',
      'renderer.console',
      'renderer.console',
      'renderer.console',
      'renderer.console',
    ]);
    expect(log.log.mock.calls.slice(-5)).toEqual([
      ['debug', 'renderer.console', { message: 'debug message', source: 'app://tau/index.js', line: 0 }],
      ['info', 'renderer.console', { message: 'info message', source: 'app://tau/index.js', line: 1 }],
      ['warn', 'renderer.console', { message: 'warning message', source: 'app://tau/index.js', line: 2 }],
      ['error', 'renderer.console', { message: 'error message', source: 'app://tau/index.js', line: 3 }],
      ['info', 'renderer.console', { message: 'unknown message', source: 'app://tau/index.js', line: 4 }],
    ]);
    expect(recover).toHaveBeenCalledOnce();
  });

  it('should report a failed app load and an out-of-memory renderer, and nothing for a subframe or crash', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const report = vi.fn();
    forwardRendererDiagnostics(
      {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          handlers.set(event, listener);
        },
      },
      { filePath: '', log: vi.fn() },
      { report },
    );
    handlers.get('did-fail-load')?.({}, -6, 'ERR_FILE_NOT_FOUND', 'app://tau/', true);
    handlers.get('did-fail-load')?.({}, -6, 'ERR_FILE_NOT_FOUND', 'https://embed.example/', false);
    handlers.get('render-process-gone')?.({}, { reason: 'oom', exitCode: 9 });
    handlers.get('render-process-gone')?.({}, { reason: 'crashed' });

    const sent = report.mock.calls.map(
      ([signal]: readonly unknown[]) => (signal as { message: string } | undefined)?.message,
    );
    expect(sent).toEqual([
      'App document failed to load: ERR_FILE_NOT_FOUND',
      undefined,
      'Renderer gone: oom',
      undefined,
    ]);
  });

  it('should log every hang and report one that lasted longer than the threshold when it ends', () => {
    const handlers = new Map<string, () => void>();
    const log = { filePath: '', log: vi.fn() };
    const report = vi.fn();
    let now = 0;
    watchRendererHangs(
      {
        on: (event: string, listener: () => void) => {
          handlers.set(event, listener);
        },
      },
      log,
      { report, now: () => now },
    );

    handlers.get('responsive')?.();
    handlers.get('unresponsive')?.();
    now = 3000;
    handlers.get('unresponsive')?.();
    now = 9000;
    handlers.get('responsive')?.();

    expect(log.log.mock.calls).toEqual([
      ['warn', 'renderer.unresponsive'],
      ['warn', 'renderer.unresponsive'],
      ['info', 'renderer.responsive', { milliseconds: 9000 }],
    ]);
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0]?.[0]).toMatchObject({ message: 'Renderer unresponsive', tags: { hang_seconds: '9' } });
  });

  describe('the hang rule (T-B24.1)', () => {
    type Timer = { readonly callback: () => void; readonly at: number };
    const setup = (
      response: number | ((options: { readonly signal?: AbortSignal }) => Promise<{ response: number }>) = 0,
    ) => {
      const handlers = new Map<string, () => void>();
      const log = { filePath: '', log: vi.fn() };
      const report = vi.fn();
      const reload = vi.fn();
      const restartInSafeMode = vi.fn();
      const endHungPage = vi.fn();
      const showMessageBox = vi.fn(typeof response === 'function' ? response : async () => ({ response }));
      let now = 0;
      const timers = new Set<Timer>();
      watchRendererHangs(
        {
          on: (event: string, listener: () => void) => {
            handlers.set(event, listener);
          },
        },
        log,
        {
          report,
          now: () => now,
          hangRule: {
            setTimeout: (callback, milliseconds) => {
              const timer = { callback, at: now + milliseconds };
              timers.add(timer);
              return timer;
            },
            clearTimeout: (handle) => {
              timers.delete(handle as Timer);
            },
            showMessageBox,
            reload,
            restartInSafeMode,
            endHungPage,
          },
        },
      );
      const advance = async (milliseconds: number): Promise<void> => {
        now += milliseconds;
        for (const timer of timers) {
          if (timer.at <= now) {
            timers.delete(timer);
            timer.callback();
          }
        }
        await Promise.resolve();
        await Promise.resolve();
      };
      return { handlers, log, report, reload, restartInSafeMode, endHungPage, showMessageBox, advance, timers };
    };

    it('should report an ongoing hang at 30 s and offer Wait, Reload and Restart in Safe Mode', async () => {
      const { handlers, report, showMessageBox, advance } = setup();
      handlers.get('unresponsive')?.();
      await advance(29_999);
      expect(showMessageBox).not.toHaveBeenCalled();

      await advance(1);

      expect(report).toHaveBeenCalledOnce();
      expect(report.mock.calls[0]?.[0]).toMatchObject({
        level: 'error',
        fingerprint: ['desktop-renderer-hang'],
        tags: { hang_seconds: '30', ongoing: 'true' },
      });
      expect(showMessageBox).toHaveBeenCalledOnce();
      expect(showMessageBox.mock.calls[0]?.[0]).toMatchObject({
        buttons: ['Wait', 'Reload', 'Restart in Safe Mode'],
        cancelId: 0,
      });
    });

    it('should show nothing for a page that answers before 30 s', async () => {
      const { handlers, report, showMessageBox, advance, timers } = setup();
      handlers.get('unresponsive')?.();
      await advance(20_000);
      handlers.get('responsive')?.();
      await advance(60_000);

      expect(showMessageBox).not.toHaveBeenCalled();
      expect(timers.size).toBe(0);
      /* The ended hang is still reported as before, without `ongoing`. */
      expect(report).toHaveBeenCalledOnce();
      expect(report.mock.calls[0]?.[0]).toMatchObject({ tags: { hang_seconds: '20' } });
    });

    it('should reload or restart in safe mode as chosen', async () => {
      const reloading = setup(1);
      reloading.handlers.get('unresponsive')?.();
      await reloading.advance(30_000);
      expect(reloading.reload).toHaveBeenCalledOnce();
      expect(reloading.restartInSafeMode).not.toHaveBeenCalled();

      const restarting = setup(2);
      restarting.handlers.get('unresponsive')?.();
      await restarting.advance(30_000);
      expect(restarting.restartInSafeMode).toHaveBeenCalledOnce();
      expect(restarting.reload).not.toHaveBeenCalled();
    });

    it('should end the hung page before a safe-mode restart, so the quit owner never waits on it', async () => {
      const restarting = setup(2);
      restarting.handlers.get('unresponsive')?.();
      await restarting.advance(30_000);

      expect(restarting.endHungPage).toHaveBeenCalledOnce();
      expect(restarting.endHungPage.mock.invocationCallOrder[0]).toBeLessThan(
        restarting.restartInSafeMode.mock.invocationCallOrder[0]!,
      );

      const waiting = setup(0);
      waiting.handlers.get('unresponsive')?.();
      await waiting.advance(30_000);
      expect(waiting.endHungPage).not.toHaveBeenCalled();
    });

    it('should ask again after another 30 s when the person waits and the page still hangs, reporting once', async () => {
      const { handlers, report, showMessageBox, advance } = setup(0);
      handlers.get('unresponsive')?.();
      await advance(30_000);
      await advance(30_000);

      expect(showMessageBox).toHaveBeenCalledTimes(2);
      expect(report).toHaveBeenCalledOnce();
    });

    it('should close the choice when the page answers while it is showing', async () => {
      let signal: AbortSignal | undefined;
      const { handlers, advance, timers } = setup(
        async (options) =>
          new Promise<{ response: number }>((resolve) => {
            ({ signal } = options);
            signal?.addEventListener('abort', () => {
              resolve({ response: 0 });
            });
          }),
      );
      handlers.get('unresponsive')?.();
      await advance(30_000);
      expect(signal?.aborted).toBe(false);

      handlers.get('responsive')?.();
      await advance(0);

      expect(signal?.aborted).toBe(true);
      expect(timers.size).toBe(0);
    });
  });

  it("should leave a page that was ended or has crashed out of the quit owner's wait", () => {
    const page = (id: number, crashed = false) => ({ webContents: { id, isCrashed: () => crashed } });
    const live = page(1);
    const ended = page(2);
    const crashed = page(3, true);

    expect(pagesThatCanSave([live, ended, crashed], new Set([2]))).toStrictEqual([live]);
  });

  it('should collapse a renderer console message repeated back-to-back', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const log = { filePath: '', log: vi.fn() };
    forwardRendererDiagnostics(
      {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          handlers.set(event, listener);
        },
      },
      log,
    );
    const looping = {
      level: 'error',
      message: 'useProjectManager must be used within a ProjectManagerProvider',
      sourceId: 'http://localhost:3001/app/hooks/use-project-manager.tsx',
      lineNumber: 2335,
    };

    for (let repeat = 0; repeat < 100; repeat += 1) {
      handlers.get('console-message')?.(looping);
    }
    handlers.get('console-message')?.({ ...looping, message: 'another failure' });

    expect(log.log.mock.calls).toEqual([
      [
        'error',
        'renderer.console',
        {
          message: looping.message,
          source: looping.sourceId,
          line: looping.lineNumber,
        },
      ],
      ['error', 'renderer.console', { message: '↳ repeated ×99' }],
      ['error', 'renderer.console', { message: 'another failure', source: looping.sourceId, line: looping.lineNumber }],
    ]);
  });

  it('forwards a utility exit code and marks a non-zero one as an error', () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const log = { filePath: '', log: vi.fn() };
    forwardUtilityDiagnostics(
      'services',
      {
        on: (event: string, listener: (...args: unknown[]) => void) => {
          handlers.set(event, listener);
        },
      },
      log,
    );
    handlers.get('exit')?.(1);
    expect(log.log).toHaveBeenCalledWith('error', 'utility.exit', { name: 'services', code: 1 });
  });

  it('records a kernel utility fork, its stderr, and its exit', () => {
    const log = { filePath: '', log: vi.fn() };
    const hooks = kernelUtilityDiagnostics(log);

    hooks.onUtilityFork?.({ hostId: 'host-1', entry: '/dist/main/kernel-host.js' });
    hooks.onUtilityStderr?.({ hostId: 'host-1', chunk: 'Error: boot failed\n' });
    hooks.onUtilityExit?.({ hostId: 'host-1', exitCode: 1, released: false, stderrTail: 'Error: boot failed\n' });

    expect(log.log.mock.calls).toEqual([
      ['info', 'kernel.fork', { hostId: 'host-1', entry: '/dist/main/kernel-host.js' }],
      ['warn', 'kernel.stderr', { hostId: 'host-1', chunk: 'Error: boot failed' }],
      ['error', 'kernel.exit', { hostId: 'host-1', code: 1, released: false, stderrTail: 'Error: boot failed\n' }],
    ]);
  });

  it('should record how large a kernel utility grew when it exits', () => {
    const log = { filePath: '', log: vi.fn() };

    kernelUtilityDiagnostics(log).onUtilityExit?.({
      hostId: 'host-3',
      exitCode: 0,
      released: true,
      peakResidentBytes: 812_000_000,
    });

    expect(log.log).toHaveBeenCalledWith(
      'info',
      'kernel.exit',
      expect.objectContaining({ hostId: 'host-3', peakResidentBytes: 812_000_000 }),
    );
  });

  it('treats a kill main ordered as expected, whatever the exit code', () => {
    const log = { filePath: '', log: vi.fn() };

    kernelUtilityDiagnostics(log).onUtilityExit?.({ hostId: 'host-2', exitCode: 143, released: true });

    expect(log.log).toHaveBeenCalledWith('info', 'kernel.exit', {
      hostId: 'host-2',
      code: 143,
      released: true,
      stderrTail: undefined,
    });
  });
});
