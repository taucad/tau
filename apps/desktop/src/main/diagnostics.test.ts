import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { createDiagnosticsLog, forwardRendererDiagnostics, forwardUtilityDiagnostics } from '#main/diagnostics.js';

const logDirectory = (): string => mkdtempSync(join(tmpdir(), 'tau-diagnostics-'));

describe('createDiagnosticsLog', () => {
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
  it('forwards every renderer failure signal main can observe', () => {
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
    handlers.get('did-fail-load')?.({}, -6, 'ERR_FILE_NOT_FOUND', 'app://tau/');
    handlers.get('render-process-gone')?.({}, { reason: 'crashed' });
    handlers.get('console-message')?.({ level: 'error', message: 'Missing TAU_API_URL' });

    expect(log.log.mock.calls.map(([, event]: readonly unknown[]) => event)).toEqual([
      'renderer.did-fail-load',
      'renderer.render-process-gone',
      'renderer.console',
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
});
