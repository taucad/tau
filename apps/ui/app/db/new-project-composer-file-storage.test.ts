import { describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import {
  createNewProjectComposerFileStore,
  newProjectComposerFilePath,
} from '#db/new-project-composer-file-storage.js';

const draft = (text: string): MyUIMessage => ({
  id: 'draft',
  role: 'user',
  metadata: { createdAt: 1, status: 'pending' },
  parts: [{ type: 'text', text }],
});

const tau: CadAgentExecution = {
  kind: 'tau',
  model: 'openai/gpt-5.5',
  hostId: 'desktop',
};

/** Only the two members the Home seam reaches; the record family's own suite covers the rest. */
const memoryClient = () => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    files,
    text: (path: string): string => new TextDecoder().decode(files.get(path) ?? new Uint8Array()),
    readFile: vi.fn(async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      const bytes = files.get(path);
      if (bytes === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return bytes;
    }),
    writeFile: vi.fn(async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
      files.set(path, data);
    }),
    exists: async (path: string): Promise<boolean> => files.has(path),
    readdir: async (): Promise<string[]> => [],
    unlink: async (): Promise<void> => undefined,
    rmdir: async (): Promise<void> => undefined,
  };
};

describe('new-project composer file store', () => {
  it('should pin the sole pre-project record outside projects and chats', () => {
    expect(newProjectComposerFilePath).toBe('/.tau/composers/new-project.json');
    expect(newProjectComposerFilePath).not.toMatch(/\/projects\/|\.tau\/chats/);
  });

  it('should map the Home seam onto the shared composer record', async () => {
    const client = memoryClient();
    const store = createNewProjectComposerFileStore(client);

    await expect(store.read()).resolves.toEqual({ status: 'absent' });
    await store.patchDraft(draft('split clamp'));
    await store.patchExecution(tau);

    await expect(store.read()).resolves.toEqual({
      status: 'valid',
      record: { version: 1, draft: draft('split clamp'), execution: tau },
    });
    expect([...client.files.keys()]).toEqual([newProjectComposerFilePath]);
  });

  it('should close out a cleared draft while preserving the execution', async () => {
    const client = memoryClient();
    const store = createNewProjectComposerFileStore(client);

    await store.patchExecution(tau);
    await store.patchDraft(draft('split clamp'));
    await store.patchDraft({ ...draft(''), parts: [] });

    expect(JSON.parse(client.text(newProjectComposerFilePath))).toEqual({
      version: 1,
      execution: tau,
    });
  });
});
