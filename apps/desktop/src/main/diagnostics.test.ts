import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDiagnosticsLog,
  forwardRendererDiagnostics,
  forwardUtilityDiagnostics,
  kernelUtilityDiagnostics,
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

  it('should hide debug and collapse consecutive duplicate terminal records without dropping file records', () => {
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

  it('rotates once the file passes its threshold', () => {
    const directory = logDirectory();
    const log = createDiagnosticsLog({ directory, echo: false, maxBytes: 32 });
    writeFileSync(log.filePath, 'x'.repeat(64));
    log.log('info', 'after.rotation');
    expect(existsSync(join(directory, 'desktop.1.log'))).toBe(true);
    expect(readFileSync(log.filePath, 'utf8')).toContain('after.rotation');
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
      recover,
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
