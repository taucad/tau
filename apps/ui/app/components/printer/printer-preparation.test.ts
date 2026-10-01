import { describe, expect, it, vi } from 'vitest';
import type { PrinterPreparation, PrinterPreparationResult } from '#components/printer/printer-preparation.js';
import { createPrinterPreparation } from '#components/printer/printer-preparation.js';
import { loadPrinterProgram } from '#components/printer/printer-program.js';
import { fixtureGcode } from '#components/printer/testing/toolpath-fixture.js';

const bytes = new TextEncoder().encode(fixtureGcode({ layers: 2 }));
describe('shared printer preparation', () => {
  it('should coalesce subscribers, cancel only the last subscriber and reuse the resident result', async () => {
    let finish!: () => void;
    const execute = vi.fn(
      async (request: Parameters<PrinterPreparation['prepare']>[0]): Promise<PrinterPreparationResult> => {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        request.signal.throwIfAborted();
        return { kind: 'ready', value: loadPrinterProgram(request.bytes, request.kind), preparationDuration: 1 };
      },
    );
    const preparation = createPrinterPreparation(execute);
    const first = new AbortController();
    const second = new AbortController();
    const one = preparation.prepare({ bytes, kind: 'gcode', signal: first.signal });
    const two = preparation.prepare({ bytes, kind: 'gcode', signal: second.signal });
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
    });
    first.abort();
    await expect(one).rejects.toMatchObject({ name: 'AbortError' });
    expect(execute.mock.calls[0]![0].signal.aborted).toBe(false);
    finish();
    const result = await two;
    const cached = await preparation.prepare({ bytes, kind: 'gcode', signal: new AbortController().signal });
    expect(cached.kind).toBe('ready');
    if (result.kind === 'ready' && cached.kind === 'ready') {
      expect(cached.value).toBe(result.value);
    }
    expect(execute).toHaveBeenCalledTimes(1);
    expect(preparation.diagnostics().residentBytes).toBeGreaterThan(0);
  });
});

describe('preparation ownership', () => {
  it('should hash an immutable snapshot, release sources and reject use after disposal', async () => {
    const mutable = new Uint8Array(bytes);
    const execute = vi.fn(
      async (request: Parameters<PrinterPreparation['prepare']>[0]): Promise<PrinterPreparationResult> => ({
        kind: 'ready',
        value: loadPrinterProgram(request.bytes, request.kind),
        preparationDuration: 0,
      }),
    );
    const preparation = createPrinterPreparation(execute);
    const result = preparation.prepare({ bytes: mutable, kind: 'gcode', signal: new AbortController().signal });
    mutable.fill(0);
    const prepared = await result;
    expect(prepared.kind).toBe('ready');
    await vi.waitFor(() => {
      expect(preparation.diagnostics().sourceBytes).toBe(0);
    });
    preparation.dispose();
    expect(preparation.diagnostics()).toMatchObject({ residentBytes: 0, pending: 0, completed: 0 });
    await expect(preparation.prepare({ bytes, kind: 'gcode', signal: new AbortController().signal })).rejects.toThrow(
      'disposed',
    );
  });
});

describe('preparation admission', () => {
  it('should preserve serial admission after cancelling a queued job, and release active view ownership', async () => {
    let finish!: () => void;
    const execute = vi.fn(
      async (request: Parameters<PrinterPreparation['prepare']>[0]): Promise<PrinterPreparationResult> => {
        if (execute.mock.calls.length === 1) {
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        }
        request.signal.throwIfAborted();
        return { kind: 'ready', value: loadPrinterProgram(request.bytes, request.kind), preparationDuration: 0 };
      },
    );
    const preparation = createPrinterPreparation(execute);
    const first = new AbortController();
    const second = new AbortController();
    const third = new AbortController();
    const one = preparation.prepare({ bytes, kind: 'gcode', signal: first.signal });
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
    });
    const different = new TextEncoder().encode(`${fixtureGcode({ layers: 2 })}\n; second`);
    const two = preparation.prepare({ bytes: different, kind: 'gcode', signal: second.signal });
    await vi.waitFor(() => {
      expect(preparation.diagnostics().pending).toBe(2);
    });
    second.abort();
    await expect(two).rejects.toMatchObject({ name: 'AbortError' });
    const three = preparation.prepare({
      bytes: new TextEncoder().encode(`${fixtureGcode({ layers: 2 })}\n; third`),
      kind: 'gcode',
      signal: third.signal,
    });
    await vi.waitFor(() => {
      expect(preparation.diagnostics().pending).toBe(2);
    });
    expect(execute).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([one, three]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(preparation.diagnostics().active).toBe(2);
    first.abort();
    third.abort();
    expect(preparation.diagnostics().active).toBe(0);
    await vi.waitFor(() => {
      expect(preparation.diagnostics().sourceBytes).toBe(0);
    });
    preparation.dispose();
  });
});

it('should allow preparation service creation without browser event globals during SSR', () => {
  vi.stubGlobal('addEventListener', undefined);
  try {
    const service = createPrinterPreparation();
    expect(service.diagnostics().pending).toBe(0);
    service.dispose();
  } finally {
    vi.unstubAllGlobals();
  }
});
