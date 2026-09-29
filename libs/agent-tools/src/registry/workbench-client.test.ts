import { describe, expect, it, vi } from 'vitest';

import { createRuntimeWorkbenchClient } from '#registry/workbench-client.js';

describe('createRuntimeWorkbenchClient', () => {
  it('offers no model extensions without a runtime', async () => {
    expect(await createRuntimeWorkbenchClient().isModelFile('main.ts')).toBe(false);
  });

  it('connects before reading the kernel extension map and accepts compound case-insensitive extensions', async () => {
    let capabilities: { registrations: ReadonlyArray<{ kind: string; extensions: readonly string[] }> } | undefined;
    const connect = vi.fn(async () => {
      capabilities = {
        registrations: [
          { kind: 'transcoder', extensions: ['md'] },
          { kind: 'kernel', extensions: ['mesh.xml'] },
        ],
      };
    });
    const runtime = {
      connect,
      get capabilities() {
        return capabilities;
      },
    };
    const client = createRuntimeWorkbenchClient(async () => runtime);
    expect(await client.isModelFile('models/part.MESH.XML')).toBe(true);
    expect(await client.isModelFile('notes.md')).toBe(false);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
