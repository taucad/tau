import { afterAll, describe, expect, it, vi } from 'vitest';

type WorkerRequest = { id: number; method: 'validate' | 'complete' | 'hover' | 'format' | 'fold'; uri: string; text: string; version: number; jsonc: boolean; offset?: number };
type WorkerResponse = { id: number; result?: unknown; error?: string };

describe('JSON language worker', () => {
  const responses: WorkerResponse[] = [];
  let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
  vi.stubGlobal('self', {
    addEventListener(_name: string, callback: (event: MessageEvent<WorkerRequest>) => void) { listener = callback; },
    postMessage(response: WorkerResponse) { responses.push(response); },
  });

  afterAll(() => { vi.unstubAllGlobals(); });

  it('validates a tau.json schema field and permits JSONC comments', async () => {
    await import('#lib/json-language/json-language.worker.js');
    const send = (request: WorkerRequest): void => { listener?.({ data: request } as MessageEvent<WorkerRequest>); };
    send({ id: 1, method: 'validate', uri: 'file:///tau.json', text: '{"name": 42}', version: 1, jsonc: false });
    await vi.waitFor(() => { expect(responses.some((response) => response.id === 1)).toBe(true); });
    const invalid = responses.find((response) => response.id === 1);
    expect(invalid?.error).toBeUndefined();
    const diagnostics: unknown = invalid?.result;
    expect(Array.isArray(diagnostics)).toBe(true);
    if (Array.isArray(diagnostics)) { expect(diagnostics.length).toBeGreaterThan(0); }

    send({ id: 2, method: 'validate', uri: 'file:///sample.jsonc', text: '// allowed\n{"ok": true}', version: 1, jsonc: true });
    await vi.waitFor(() => { expect(responses.some((response) => response.id === 2)).toBe(true); });
    expect(responses.find((response) => response.id === 2)?.result).toEqual([]);
  }, 20_000);
});
