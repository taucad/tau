import { describe, expect, it } from 'vitest';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import {
  composerRecordInputErrorCode,
  composerRecordPaths,
  createComposerRecordStore,
  isComposerRecordInputError,
} from '#db/composer-record-store.js';
import type { ComposerRecord, ComposerRecordPatch } from '#db/composer-record-store.js';

const imageHash = 'a'.repeat(64);
const documentHash = 'b'.repeat(64);

const userMessage = (parts: MyUIMessage['parts']): MyUIMessage => ({
  id: 'draft',
  role: 'user',
  metadata: { createdAt: 1, status: 'pending' },
  parts,
});

const draft = (text: string): MyUIMessage =>
  userMessage([
    { type: 'text', text },
    {
      type: 'file',
      url: `attachments/${imageHash}.jpg`,
      mediaType: 'image/jpeg',
    },
    {
      type: 'file',
      url: `attachments/${documentHash}.pdf`,
      mediaType: 'application/pdf',
      filename: 'bracket-spec.pdf',
    },
  ]);

const edit = (text: string): MyUIMessage => userMessage([{ type: 'text', text }]);

const tau: CadAgentExecution = {
  kind: 'tau',
  model: 'openai/gpt-5.5',
  hostId: 'desktop',
};

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** Records every path the store touches, so a test can prove nothing reaches a project or chat tree. */
const memoryClient = (initial?: Readonly<Record<string, string>>) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>(
    Object.entries(initial ?? {}).map(([path, text]) => [path, encode(text)]),
  );
  const touched: string[] = [];
  const under = (path: string): string[] =>
    [...files.keys()].filter((entry) => entry.startsWith(`${path}/`)).map((entry) => entry.slice(path.length + 1));

  return {
    files,
    touched,
    text: (path: string): string => new TextDecoder().decode(files.get(path) ?? new Uint8Array()),
    readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
      touched.push(path);
      const value = files.get(path);
      if (value === undefined) {
        throw notFound(path);
      }
      return value;
    },
    writeFile: async (path: string, data: Uint8Array<ArrayBuffer>): Promise<void> => {
      touched.push(path);
      files.set(path, data);
    },
    exists: async (path: string): Promise<boolean> => {
      touched.push(path);
      return files.has(path);
    },
    readdir: async (path: string): Promise<string[]> => {
      touched.push(path);
      const names = under(path);
      if (names.length === 0) {
        throw notFound(path);
      }
      return names;
    },
    unlink: async (path: string): Promise<void> => {
      touched.push(path);
      if (!files.delete(path)) {
        throw notFound(path);
      }
    },
    rmdir: async (path: string, options?: { recursive?: boolean }): Promise<void> => {
      touched.push(path);
      const names = under(path);
      if (names.length === 0) {
        throw notFound(path);
      }
      expect(options).toEqual({ recursive: true });
      for (const name of names) {
        files.delete(`${path}/${name}`);
      }
    },
  };
};

const chatPath = composerRecordPaths.chat('project-1', 'chat-1');

describe('composer record store', () => {
  describe('paths', () => {
    it('should pin both record families under the Home composers root', () => {
      expect(composerRecordPaths.newProject).toBe('/.tau/composers/new-project.json');
      expect(composerRecordPaths.chat('project-1', 'chat-1')).toBe('/.tau/composers/chats/project-1/chat-1.json');
      expect(composerRecordPaths.unread('project-1')).toBe('/.tau/composers/chats/project-1/unread.json');
      expect(composerRecordPaths.project('project-1')).toBe('/.tau/composers/chats/project-1');
    });

    it('should never touch a project tree or a chat ref tree', async () => {
      const client = memoryClient();
      const store = createComposerRecordStore(client, chatPath);

      await store.read();
      await store.patch({ draft: draft('split clamp') });
      await store.attachments.put(png, 'image/png', 'diagram.png');
      await store.read();
      await store.remove();

      expect(client.touched.length).toBeGreaterThan(0);
      for (const path of client.touched) {
        expect(path).not.toMatch(/\/projects\/|\.tau\/chats/);
        expect(path.startsWith('/.tau/composers/')).toBe(true);
      }
    });

    it('should root attachments beside the record it belongs to', async () => {
      const client = memoryClient();
      const stored = await createComposerRecordStore(client, chatPath).attachments.put(png, 'image/png');

      expect([...client.files.keys()]).toEqual([
        `/.tau/composers/chats/project-1/chat-1/attachments/${stored.hash}.png`,
      ]);
    });
  });

  describe('read', () => {
    it('should treat a missing file as an absent record', async () => {
      const client = memoryClient();
      await expect(createComposerRecordStore(client, chatPath).read()).resolves.toEqual({ status: 'absent' });
    });

    it.each([
      ['malformed JSON', '{'],
      ['wrong version', '{"version":2}'],
      ['a missing version', '{"draft":null}'],
      [
        'a non-user draft',
        JSON.stringify({
          version: 1,
          draft: { id: 'd', role: 'assistant', parts: [] },
        }),
      ],
      [
        'a non-user message edit',
        JSON.stringify({
          version: 1,
          messageEdits: {
            m1: {
              id: 'd',
              role: 'assistant',
              parts: [{ type: 'text', text: 'x' }],
            },
          },
        }),
      ],
      [
        'an unsupported attachment media type',
        JSON.stringify({
          version: 1,
          draft: userMessage([
            {
              type: 'file',
              url: `attachments/${imageHash}.jpg`,
              mediaType: 'image/svg+xml',
            },
          ]),
        }),
      ],
      [
        'an attachment URL outside the attachments directory',
        JSON.stringify({
          version: 1,
          draft: userMessage([
            {
              type: 'file',
              url: `../${imageHash}.jpg`,
              mediaType: 'image/jpeg',
            },
          ]),
        }),
      ],
      ['an invalid execution', JSON.stringify({ version: 1, execution: { kind: 'tau', model: '' } })],
      ['an unknown mode', JSON.stringify({ version: 1, mode: 'wander' })],
      ['an unknown key', JSON.stringify({ version: 1, token: 'secret' })],
    ])('should return invalid for %s', async (_name, bytes) => {
      const client = memoryClient({ [chatPath]: bytes });
      const result = await createComposerRecordStore(client, chatPath).read();
      expect(result.status).toBe('invalid');
    });

    it('should accept a legacy data URL attachment on read', async () => {
      const legacy = userMessage([
        {
          type: 'file',
          url: 'data:image/png;base64,AA==',
          mediaType: 'image/png',
        },
      ]);
      const client = memoryClient({
        [chatPath]: JSON.stringify({ version: 1, draft: legacy }),
      });

      await expect(createComposerRecordStore(client, chatPath).read()).resolves.toEqual({
        status: 'valid',
        record: { version: 1, draft: legacy },
      });
    });

    it('should propagate a read failure that is not an absence', async () => {
      const error = Object.assign(new Error('permission denied'), {
        code: 'EACCES',
      });
      const client = {
        ...memoryClient(),
        readFile: async (): Promise<Uint8Array<ArrayBuffer>> => {
          throw error;
        },
      };
      const store = createComposerRecordStore(client, chatPath);

      await expect(store.read()).rejects.toBe(error);
      await expect(store.patch({ mode: 'plan' })).rejects.toBe(error);
      // I/O is exactly what the retry curve exists for, so it must never carry the unrepairable code.
      expect(isComposerRecordInputError(error)).toBe(false);
      expect(client.files.size).toBe(0);
    });
  });

  describe('patch', () => {
    it('should round-trip every field with stable pretty-printed bytes', async () => {
      const client = memoryClient();
      const store = createComposerRecordStore(client, chatPath);

      await store.patch({ draft: draft('model the bracket per the spec') });
      await store.patch({ messageEdits: { msgOne: edit('…revised') } });
      await store.patch({ toolChoice: ['cad_execute'] });
      await store.patch({ mode: 'plan' });
      await store.patch({ unread: { chatTwo: true } });
      await store.patch({ execution: tau });

      await expect(store.read()).resolves.toEqual({
        status: 'valid',
        record: {
          version: 1,
          draft: draft('model the bracket per the spec'),
          messageEdits: { msgOne: edit('…revised') },
          toolChoice: ['cad_execute'],
          mode: 'plan',
          unread: { chatTwo: true },
          execution: tau,
        },
      });
      expect(client.text(chatPath)).toMatch(/^{\n {2}"version": 1,\n/);
      expect(client.text(chatPath)).toMatch(/\n}\n$/);
    });

    it.each([
      {
        name: 'draft',
        first: { draft: draft('first') },
        second: { draft: draft('second') },
        expected: { draft: draft('second') },
      },
      {
        name: 'messageEdits',
        first: { messageEdits: { msgOne: edit('first') } },
        second: { messageEdits: { msgOne: edit('second') } },
        expected: {
          messageEdits: { msgNine: edit('untouched'), msgOne: edit('second') },
        },
      },
      {
        name: 'toolChoice',
        first: { toolChoice: 'auto' },
        second: { toolChoice: 'none' },
        expected: { toolChoice: 'none' },
      },
      {
        name: 'mode',
        first: { mode: 'agent' },
        second: { mode: 'plan' },
        expected: { mode: 'plan' },
      },
      {
        name: 'unread',
        first: { unread: { chatTwo: true } },
        second: { unread: { chatThree: true } },
        expected: { unread: { chatNine: true, chatTwo: true, chatThree: true } },
      },
      {
        name: 'execution',
        first: { execution: tau },
        second: { execution: { ...tau, model: 'anthropic/claude-opus-5' } },
        expected: { execution: { ...tau, model: 'anthropic/claude-opus-5' } },
      },
    ] satisfies ReadonlyArray<{
      name: string;
      first: ComposerRecordPatch;
      second: ComposerRecordPatch;
      expected: Partial<ComposerRecord>;
    }>)('should preserve every other field when $name is patched', async ({ first, second, expected }) => {
      const client = memoryClient();
      const store = createComposerRecordStore(client, chatPath);
      const everything: ComposerRecordPatch = {
        draft: draft('everything'),
        messageEdits: { msgNine: edit('untouched') },
        toolChoice: 'auto',
        mode: 'agent',
        unread: { chatNine: true },
        execution: tau,
      };

      await store.patch(everything);
      await store.patch(first);
      await store.patch(second);

      const result = await store.read();
      expect(result).toEqual({
        status: 'valid',
        record: { version: 1, ...everything, ...expected },
      });
    });

    it.each([
      {
        name: 'a data URL attachment',
        fields: {
          draft: userMessage([{ type: 'file', url: 'data:image/png;base64,AA==', mediaType: 'image/png' }]),
        },
        message: /data:/,
      },
      {
        name: 'an unsupported attachment media type',
        fields: {
          draft: userMessage([{ type: 'file', url: `attachments/${imageHash}.jpg`, mediaType: 'image/svg+xml' }]),
        },
        message: /image\/svg\+xml/,
      },
      {
        name: 'an attachment URL outside the attachments directory',
        fields: { draft: userMessage([{ type: 'file', url: `../${imageHash}.jpg`, mediaType: 'image/jpeg' }]) },
        message: /attachments\/<sha256>/,
      },
      {
        name: 'a message edit that fails the message schema',
        fields: {
          messageEdits: { msgOne: userMessage([{ type: 'text' } as unknown as MyUIMessage['parts'][number]]) },
        },
        message: /./,
      },
    ] satisfies ReadonlyArray<{ name: string; fields: ComposerRecordPatch; message: RegExp }>)(
      'should reject $name on write as unrepairable, never as retryable',
      async ({ fields, message }) => {
        const client = memoryClient();
        const store = createComposerRecordStore(client, chatPath);

        // A retained pending patch that can never be written would take every later field down with it.
        const rejection = await store.patch(fields).catch((error: unknown) => error);

        expect(isComposerRecordInputError(rejection)).toBe(true);
        expect(rejection).toHaveProperty('code', composerRecordInputErrorCode);
        expect(rejection).toHaveProperty('name', 'ComposerRecordInputError');
        expect(String(rejection)).toMatch(message);
        expect(client.files.size).toBe(0);
      },
    );

    it('should omit an emptied draft and edit and read them back as absent', async () => {
      const client = memoryClient();
      const store = createComposerRecordStore(client, chatPath);

      await store.patch({
        draft: draft('split clamp'),
        messageEdits: { msgOne: edit('typing') },
        mode: 'plan',
      });
      await store.patch({
        draft: userMessage([]),
        messageEdits: { msgOne: userMessage([]) },
      });

      expect(JSON.parse(client.text(chatPath))).toEqual({
        version: 1,
        mode: 'plan',
      });
      await expect(store.read()).resolves.toEqual({
        status: 'valid',
        record: { version: 1, mode: 'plan' },
      });
    });

    it('should read a previously persisted empty draft and edit as absent', async () => {
      const bytes = JSON.stringify({
        version: 1,
        draft: userMessage([]),
        messageEdits: { msgOne: userMessage([]) },
        unread: {},
        mode: 'plan',
      });
      const client = memoryClient({ [chatPath]: bytes });

      await expect(createComposerRecordStore(client, chatPath).read()).resolves.toEqual({
        status: 'valid',
        record: { version: 1, mode: 'plan' },
      });
    });

    it('should drop an unread entry set to false', async () => {
      const client = memoryClient();
      const store = createComposerRecordStore(client, composerRecordPaths.unread('project-1'));

      await store.patch({ unread: { chatOne: true, chatTwo: true } });
      await store.patch({ unread: { chatOne: false } });

      await expect(store.read()).resolves.toEqual({
        status: 'valid',
        record: { version: 1, unread: { chatTwo: true } },
      });
    });

    it('should lose no update across 100 concurrent interleavings of three fields', async () => {
      await Promise.all(
        Array.from({ length: 100 }, async (_, index) => {
          const client = memoryClient();
          const first = createComposerRecordStore(client, chatPath);
          const second = createComposerRecordStore(client, chatPath);
          const third = createComposerRecordStore(client, chatPath);

          await Promise.all([
            first.patch({ draft: draft(`draft ${index}`) }),
            second.patch({ toolChoice: `tool-${index}` }),
            third.patch({ mode: index % 2 === 0 ? 'plan' : 'agent' }),
          ]);

          await expect(first.read()).resolves.toEqual({
            status: 'valid',
            record: {
              version: 1,
              draft: draft(`draft ${index}`),
              toolChoice: `tool-${index}`,
              mode: index % 2 === 0 ? 'plan' : 'agent',
            },
          });
        }),
      );
    });
  });

  describe('remove', () => {
    it('should remove the record and its attachments directory', async () => {
      const client = memoryClient();
      const store = createComposerRecordStore(client, chatPath);
      await store.patch({ draft: draft('split clamp') });
      await store.attachments.put(png, 'image/png');

      await store.remove();

      expect([...client.files.keys()]).toEqual([]);
      await expect(store.read()).resolves.toEqual({ status: 'absent' });
    });

    it('should stay idempotent when nothing was ever written', async () => {
      const client = memoryClient();
      await expect(createComposerRecordStore(client, chatPath).remove()).resolves.toBeUndefined();
    });
  });
});
