import { describe, expect, it, vi } from 'vitest';

import type { RpcFileSystem } from '@taucad/chat/rpc';

import { createChatToolRegistry } from '#registry/tool-registry.js';
import type { ChatToolRegistryOptions } from '#registry/tool-registry.js';

const emptyFileSystem = (): RpcFileSystem => ({
  readFile: async () => 'export const main = 1;\n',
  writeFile: async () => undefined,
  writeBinaryFile: async () => undefined,
  deleteFile: async () => undefined,
  readdir: async () => [],
  exists: async () => true,
  appendFile: async () => undefined,
  editFile: async () => ({
    occurrences: 1,
    diffStats: { linesAdded: 0, linesRemoved: 0, originalContent: '', modifiedContent: '' },
  }),
  stat: async () => ({
    size: 24,
    isDirectory: false,
    createdAt: '2026-09-02T00:00:00.000Z',
    modifiedAt: '2026-09-02T00:00:00.000Z',
    contentKind: 'text',
    lineCount: 1,
  }),
});

const build = (options: Partial<ChatToolRegistryOptions> = {}) =>
  createChatToolRegistry({
    fileSystemFor: () => emptyFileSystem(),
    testingEnabled: true,
    ...options,
  });

const listOf = (options: Partial<ChatToolRegistryOptions> = {}): string[] =>
  build(options)
    .list()
    .map((tool) => tool.name);

const invoke = async (
  registry: ReturnType<typeof build>,
  toolName: string,
  call: { readonly input: unknown; readonly signal?: AbortSignal },
) =>
  registry.invoke({
    toolCallId: 'call-1',
    toolName,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- test input is the tool's own JSON shape.
    input: call.input as never,
    signal: call.signal ?? new AbortController().signal,
  });

const fileTools = ['read_file', 'edit_file', 'list_directory', 'create_file', 'delete_file', 'grep', 'glob_search'];

describe('createChatToolRegistry listing', () => {
  it.each([
    {
      label: 'filesystem only',
      options: {},
      offered: [],
      withheld: ['get_kernel_result', 'export_geometry', 'screenshot', 'test_model', 'use_skill'],
    },
    {
      label: 'kernel client only',
      options: { kernelClient: { getKernelResult: vi.fn() } },
      offered: ['get_kernel_result'],
      withheld: ['export_geometry', 'screenshot', 'test_model', 'use_skill'],
    },
    {
      label: 'graphics only',
      options: { graphics: { exportGeometry: vi.fn() } },
      offered: ['export_geometry'],
      withheld: ['get_kernel_result', 'screenshot'],
    },
    {
      label: 'images only',
      options: { images: { captureImages: vi.fn() } },
      offered: ['screenshot'],
      withheld: ['export_geometry', 'get_kernel_result'],
    },
    {
      label: 'geospec only',
      options: { geospec: { runTests: vi.fn() } },
      offered: ['test_model'],
      withheld: ['use_skill', 'screenshot'],
    },
    {
      label: 'skill resolver only',
      options: { skillResolver: { resolveSkill: vi.fn() } },
      offered: ['use_skill'],
      withheld: ['test_model', 'screenshot'],
    },
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- table rows are partial option sets by construction.
  ] as Array<{ label: string; options: Partial<ChatToolRegistryOptions>; offered: string[]; withheld: string[] }>)(
    'offers $label exactly what its clients can serve',
    ({ options, offered, withheld }) => {
      const names = listOf(options);
      for (const tool of [...fileTools, ...offered]) {
        expect(names).toContain(tool);
      }
      for (const tool of withheld) {
        expect(names).not.toContain(tool);
      }
    },
  );

  it('withholds test_model when the testing gate is closed even with a GeoSpec client', () => {
    expect(listOf({ geospec: { runTests: vi.fn() }, testingEnabled: false })).not.toContain('test_model');
  });

  it('lists the browser worker set when every client is attached', () => {
    const names = listOf({
      kernelClient: { getKernelResult: vi.fn() },
      graphics: { exportGeometry: vi.fn() },
      images: { captureImages: vi.fn() },
      geospec: { runTests: vi.fn() },
      skillResolver: { resolveSkill: vi.fn() },
    });
    expect(names.toSorted()).toStrictEqual(
      [
        'create_file',
        'delete_file',
        'edit_file',
        'export_geometry',
        'get_kernel_result',
        'glob_search',
        'grep',
        'list_directory',
        'read_file',
        'screenshot',
        'test_model',
        'use_skill',
      ].toSorted(),
    );
  });

  it('publishes a draft-7 input schema with no $schema key', () => {
    const definition = build()
      .list()
      .find((tool) => tool.name === 'read_file');
    expect(definition?.inputSchema).toBeDefined();
    expect(definition?.inputSchema).not.toHaveProperty('$schema');
    expect(definition?.description).toBeTruthy();
  });
});

describe('createChatToolRegistry invocation', () => {
  it('refuses a tool it does not list rather than dispatching it', async () => {
    const registry = build();
    await expect(invoke(registry, 'test_model', { input: {} })).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_NOT_FOUND' },
    });
    await expect(invoke(registry, 'no_such_tool', { input: {} })).resolves.toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_NOT_FOUND' },
    });
  });

  it('answers invalid tool input with a validation refusal', async () => {
    const result = await invoke(build(), 'read_file', { input: { nope: true } });
    expect(result).toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
  });

  it('dispatches a validated call to the RPC handler', async () => {
    const result = await invoke(build(), 'read_file', { input: { targetFile: 'main.ts' } });
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain('export const main');
  });

  it('throws the abort reason when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by operator'));
    await expect(
      invoke(build(), 'read_file', { input: { targetFile: 'main.ts' }, signal: controller.signal }),
    ).rejects.toThrow('cancelled by operator');
  });

  it('loses the race to an abort raised while the RPC is in flight', async () => {
    const controller = new AbortController();
    const registry = createChatToolRegistry({
      fileSystemFor: () => ({
        ...emptyFileSystem(),
        readFile: async () =>
          new Promise<string>(() => {
            /* Never settles: the abort has to be what ends this call. */
          }),
      }),
      testingEnabled: false,
    });
    const pending = invoke(registry, 'read_file', {
      input: { targetFile: 'main.ts' },
      signal: controller.signal,
    });
    controller.abort(new Error('interrupted mid-read'));
    await expect(pending).rejects.toThrow('interrupted mid-read');
  });
});
