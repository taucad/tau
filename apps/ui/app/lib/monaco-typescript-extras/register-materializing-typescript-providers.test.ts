import { describe, it, expect, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import { awaitTypescriptFamilyWorker } from '#lib/monaco-typescript-extras/register-materializing-typescript-providers.client.js';

describe('awaitTypescriptFamilyWorker', () => {
  it('retries TypeScript family until worker accessor resolves', async () => {
    let calls = 0;
    const workerFunction = vi.fn(async (): Promise<Record<string, unknown>> => ({}));
    const monaco = {
      typescript: {
        getTypeScriptWorker: vi.fn(async () => {
          calls += 1;
          if (calls < 3) {
            throw new Error('TypeScript not registered!');
          }
          return workerFunction;
        }),
        getJavaScriptWorker: vi.fn(),
      },
    } as unknown as typeof Monaco;

    await awaitTypescriptFamilyWorker(monaco, 'typescript');
    expect(calls).toBe(3);
  });

  it('retries JavaScript family until worker accessor resolves', async () => {
    let calls = 0;
    const workerFunction = vi.fn(async (): Promise<Record<string, unknown>> => ({}));
    const monaco = {
      typescript: {
        getJavaScriptWorker: vi.fn(async () => {
          calls += 1;
          if (calls < 3) {
            throw new Error('JavaScript not registered!');
          }
          return workerFunction;
        }),
        getTypeScriptWorker: vi.fn(),
      },
    } as unknown as typeof Monaco;

    await awaitTypescriptFamilyWorker(monaco, 'javascript');
    expect(calls).toBe(3);
  });
});
