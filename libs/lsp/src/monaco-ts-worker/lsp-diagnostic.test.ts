import { describe, expect, it, vi } from 'vitest';

import { LspDiagnostic } from '#monaco-ts-worker/lsp-diagnostic.js';

describe('LspDiagnostic', () => {
  it('records counts per (category, outcome) bucket', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, autoDumpEvery: 0, enabled: true });

    diag.record({ category: 'getScriptText', outcome: 'mirror', fileName: 'file:///main.ts' });
    diag.record({ category: 'getScriptText', outcome: 'mirror', fileName: 'file:///main.ts' });
    diag.record({ category: 'getScriptText', outcome: 'sync', fileName: 'file:///lib/cube.ts' });
    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'file:///lib/cylinder.js' });

    const summary = diag.dump();
    expect(summary.counts['getScriptText:mirror']).toBe(2);
    expect(summary.counts['getScriptText:sync']).toBe(1);
    expect(summary.counts['fileExists:miss']).toBe(1);
    expect(summary.total).toBe(4);
  });

  it('inline-logs only the first N unique fileNames per bucket', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, uniqueSampleLimit: 2, autoDumpEvery: 0, enabled: true });

    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'a' });
    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'b' });
    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'c' });
    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'a' });

    const inlineLogs = log.mock.calls.filter(([first]) => typeof first === 'string' && first.startsWith('[lsp:'));
    expect(inlineLogs).toHaveLength(2);
    expect(inlineLogs[0]?.[1]).toBe('a');
    expect(inlineLogs[1]?.[1]).toBe('b');
  });

  it('skips recording when disabled', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, autoDumpEvery: 0, enabled: false });

    diag.record({ category: 'getScriptText', outcome: 'sync', fileName: 'file:///foo.ts' });
    expect(log).not.toHaveBeenCalled();
    expect(diag.dump().total).toBe(0);

    diag.setEnabled(true);
    diag.record({ category: 'getScriptText', outcome: 'sync', fileName: 'file:///foo.ts' });
    expect(diag.dump().total).toBe(1);
  });

  it('auto-dumps every K probes', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, autoDumpEvery: 3, uniqueSampleLimit: 0, enabled: true });

    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'a' });
    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'b' });
    expect(log).not.toHaveBeenCalledWith('[lsp:diagnostic:summary]', expect.anything());
    diag.record({ category: 'fileExists', outcome: 'miss', fileName: 'c' });
    expect(log).toHaveBeenCalledWith('[lsp:diagnostic:summary]', expect.objectContaining({ total: 3 }));
  });

  it('honours the `prefix` option for inline log lines and summaries', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({
      log,
      prefix: 'sync-fs-host',
      autoDumpEvery: 0,
      suppressedOutcomes: [],
      enabled: true,
    });

    diag.record({ category: 'directoryExists', outcome: 'static', fileName: '/node_modules/replicad' });
    expect(log).toHaveBeenCalledWith('[sync-fs-host:directoryExists:static]', '/node_modules/replicad');

    diag.dump();
    expect(log).toHaveBeenCalledWith('[sync-fs-host:diagnostic:summary]', expect.objectContaining({ total: 1 }));
  });

  it('suppresses inline logs for default static and mirror outcomes but still counts them', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, autoDumpEvery: 0, enabled: true });

    diag.record({ category: 'getScriptText', outcome: 'mirror', fileName: 'a' });
    const inline = log.mock.calls.filter(([first]) => typeof first === 'string' && first.startsWith('[lsp:'));
    expect(inline).toHaveLength(0);
    expect(diag.dump().counts['getScriptText:mirror']).toBe(1);
  });

  it('setSuppressedOutcomes controls inline logging', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, autoDumpEvery: 0, suppressedOutcomes: [], enabled: true });
    diag.record({ category: 'fileExists', outcome: 'mirror', fileName: 'x' });
    expect(log.mock.calls.filter(([first]) => typeof first === 'string' && first.startsWith('[lsp:')).length).toBe(1);
    log.mockClear();
    diag.setSuppressedOutcomes(['mirror']);
    diag.record({ category: 'fileExists', outcome: 'mirror', fileName: 'y' });
    expect(log.mock.calls.filter(([first]) => typeof first === 'string' && first.startsWith('[lsp:')).length).toBe(0);
  });

  it('reset() clears counts and samples but preserves enabled state', () => {
    const log = vi.fn();
    const diag = new LspDiagnostic({ log, autoDumpEvery: 0, enabled: true });

    diag.record({ category: 'getScriptText', outcome: 'mirror', fileName: 'a' });
    diag.reset();
    expect(diag.dump().total).toBe(0);
    expect(diag.isEnabled()).toBe(true);
  });
});
