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
  parts: [
    { type: 'text', text },
    { type: 'file', url: 'data:image/png;base64,AA==', mediaType: 'image/png' },
  ],
});

const tau: CadAgentExecution = { kind: 'tau', model: 'openai/gpt-5.5', hostId: 'desktop' };
const acp: CadAgentExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex', model: 'gpt-5' };

const memoryClient = (initial?: string) => {
  let bytes = initial;
  return {
    readFile: vi.fn(async (path: string, encoding: 'utf8') => {
      expect(path).toBe('/.tau/composers/new-project.json');
      expect(encoding).toBe('utf8');
      if (bytes === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return bytes;
    }),
    writeFile: vi.fn(async (path: string, next: string) => {
      expect(path).toBe('/.tau/composers/new-project.json');
      bytes = next;
    }),
    bytes: () => bytes,
  };
};

describe('new-project composer file store', () => {
  it('pins the sole pre-project record outside projects and chats', () => {
    expect(newProjectComposerFilePath).toBe('/.tau/composers/new-project.json');
    expect(newProjectComposerFilePath).not.toMatch(
      /\/projects\/|\.tau\/chats|homepage_main_chat_resource|chat_homepage_main/,
    );
  });

  it('treats a missing file as an absent record', async () => {
    const client = memoryClient();
    await expect(createNewProjectComposerFileStore(client).read()).resolves.toEqual({ status: 'absent' });
    expect(client.readFile).toHaveBeenCalledWith(newProjectComposerFilePath, 'utf8');
  });

  it.each([
    ['malformed JSON', '{'],
    ['wrong version', '{"version":2}'],
    ['non-user message', JSON.stringify({ version: 1, draft: { id: 'draft', role: 'assistant', parts: [] } })],
    ['invalid execution', JSON.stringify({ version: 1, execution: { kind: 'tau', model: '' } })],
    ['unknown credentials', JSON.stringify({ version: 1, token: 'secret' })],
  ])('returns invalid for %s', async (_name, bytes) => {
    const result = await createNewProjectComposerFileStore(memoryClient(bytes)).read();
    expect(result.status).toBe('invalid');
  });

  it('round-trips draft images and Tau/ACP executions with stable bytes', async () => {
    const client = memoryClient();
    const store = createNewProjectComposerFileStore(client);
    await store.patchDraft(draft('split clamp'));
    await store.patchExecution(tau);
    await expect(store.read()).resolves.toEqual({
      status: 'valid',
      record: { version: 1, draft: draft('split clamp'), execution: tau },
    });
    expect(client.bytes()).toMatch(/^{\n/);
    expect(client.bytes()).toMatch(/\n}\n$/);

    await store.patchExecution(acp);
    await expect(store.read()).resolves.toEqual({
      status: 'valid',
      record: { version: 1, draft: draft('split clamp'), execution: acp },
    });
  });

  it('preserves both fields across 100 concurrent draft/execution interleavings', async () => {
    await Promise.all(
      Array.from({ length: 100 }, async (_, index) => {
        const client = memoryClient();
        const first = createNewProjectComposerFileStore(client);
        const second = createNewProjectComposerFileStore(client);
        await Promise.all([
          first.patchDraft(draft(`draft ${index}`)),
          second.patchExecution(index % 2 === 0 ? tau : acp),
        ]);
        await expect(first.read()).resolves.toEqual({
          status: 'valid',
          record: { version: 1, draft: draft(`draft ${index}`), execution: index % 2 === 0 ? tau : acp },
        });
      }),
    );
  });

  it('closes out a cleared draft while preserving the execution', async () => {
    const client = memoryClient();
    const store = createNewProjectComposerFileStore(client);
    await store.patchExecution(tau);
    await store.patchDraft(draft('split clamp'));
    await store.patchDraft({ ...draft(''), parts: [] });
    expect(JSON.parse(client.bytes() ?? '')).toEqual({ version: 1, execution: tau });
    await expect(store.read()).resolves.toEqual({ status: 'valid', record: { version: 1, execution: tau } });
    expect(client.writeFile.mock.calls.flat().join(' ')).not.toMatch(/\/projects\/|\.tau\/chats/);
  });

  it('reads a previously persisted cleared draft as no draft', async () => {
    const bytes = JSON.stringify({ version: 1, draft: { ...draft(''), parts: [] }, execution: acp });
    await expect(createNewProjectComposerFileStore(memoryClient(bytes)).read()).resolves.toEqual({
      status: 'valid',
      record: { version: 1, execution: acp },
    });
  });

  it('propagates read I/O failures and does not overwrite them', async () => {
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const client = {
      readFile: vi.fn(async () => {
        throw error;
      }),
      writeFile: vi.fn(async () => undefined),
    };
    const store = createNewProjectComposerFileStore(client);
    await expect(store.read()).rejects.toBe(error);
    await expect(store.patchDraft(draft('do not write'))).rejects.toBe(error);
    expect(client.writeFile).not.toHaveBeenCalled();
  });
});
