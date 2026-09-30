import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type {
  RpcFileSystem,
  RpcGeoSpecClient,
  RpcGraphicsClient,
  RpcInvocationContext,
  RpcParameterClient,
  RpcRuntimeClient,
} from '@taucad/chat/rpc';
import type { JsonValue } from '@taucad/agent-host';
import { toolDescriptions } from '@taucad/chat/constants';
import { ResourceQueue } from '@taucad/filesystem';
import { MemoryProvider } from '@taucad/filesystem/backend';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';

import { createProviderRpcFileSystem } from '#registry/provider-file-system.js';
import { createChatToolRegistry } from '#registry/tool-registry.js';
import type { ChatToolRegistryOptions } from '#registry/tool-registry.js';

const emptyFileSystem = (): RpcFileSystem => ({
  readFile: async () => 'export const main = 1;\n',
  writeFile: async () => undefined,
  writeFileChecked: async () => {
    throw new Error('No checked authority in this fixture.');
  },
  deleteFileChecked: async () => {
    throw new Error('No checked authority in this fixture.');
  },
  writeBinaryFile: async () => undefined,
  deleteFile: async () => undefined,
  readdir: async () => [],
  exists: async () => true,
  appendFile: async () => undefined,
  editFile: async () => ({
    occurrences: 1,
    diffStats: {
      linesAdded: 0,
      linesRemoved: 0,
      originalContent: '',
      modifiedContent: '',
    },
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
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- tests intentionally exercise unvalidated JSON shapes.
    input: call.input as JsonValue,
    signal: call.signal ?? new AbortController().signal,
  });

const fileTools = [
  'read_file',
  'edit_file',
  'list_directory',
  'create_file',
  'delete_file',
  'grep',
  'glob_search',
  'update_todos',
];

describe('createChatToolRegistry listing', () => {
  it('offers arrange_workbench with only a filesystem', () => {
    expect(listOf()).toContain('arrange_workbench');
  });
  it.each([undefined, 'legacy', 'native'] as const)(
    'should advertise the selected %s authoring API before any tool invocation',
    (geospecAuthoringMode) => {
      const runTests = vi.fn();
      const definitions = build({ geospec: { runTests }, geospecAuthoringMode }).list();
      const description = definitions.find((tool) => tool.name === 'test_model')?.description;
      const native = geospecAuthoringMode === 'native';
      expect(description).toContain(native ? 'Selected GeoSpec API: native' : 'Selected GeoSpec API: legacy');
      expect(description).toContain(native ? 'expectNativeGeo' : 'expectGeo');
      expect(description).toContain(native ? 'loadNativeModel' : 'loadModel');
      expect(description).toContain(native ? "'geospec/runner/native'" : "'geospec/model'");
      expect(description).not.toContain(native ? 'expectGeo' : 'expectNativeGeo');
      expect(description).not.toContain(native ? 'loadModel' : 'loadNativeModel');
      for (const definition of definitions.filter((tool) => tool.name !== 'test_model')) {
        expect(definition.description).toBe(toolDescriptions[definition.name as keyof typeof toolDescriptions]);
      }
      expect(runTests).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      label: 'filesystem only',
      options: {},
      offered: [],
      withheld: ['evaluate_model', 'export_model', 'screenshot', 'test_model', 'use_skill'],
    },
    {
      label: 'kernel client only',
      options: { kernelClient: { evaluateModel: vi.fn() } },
      offered: ['evaluate_model'],
      withheld: ['export_model', 'screenshot', 'test_model', 'use_skill'],
    },
    {
      label: 'graphics only',
      options: { graphics: { exportModel: vi.fn() } },
      offered: ['export_model'],
      withheld: ['evaluate_model', 'screenshot'],
    },
    {
      label: 'images only',
      options: { images: { captureImages: vi.fn() } },
      offered: ['screenshot'],
      withheld: ['export_model', 'evaluate_model'],
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
  ] as Array<{
    label: string;
    options: Partial<ChatToolRegistryOptions>;
    offered: string[];
    withheld: string[];
  }>)('offers $label exactly what its clients can serve', ({ options, offered, withheld }) => {
    const names = listOf(options);
    for (const tool of [...fileTools, ...offered]) {
      expect(names).toContain(tool);
    }
    for (const tool of withheld) {
      expect(names).not.toContain(tool);
    }
  });

  it('withholds test_model when the testing gate is closed even with a GeoSpec client', () => {
    expect(listOf({ geospec: { runTests: vi.fn() }, testingEnabled: false })).not.toContain('test_model');
  });

  it('lists the browser worker set when every client is attached', () => {
    const names = listOf({
      kernelClient: { evaluateModel: vi.fn() },
      graphics: { exportModel: vi.fn() },
      images: { captureImages: vi.fn() },
      geospec: { runTests: vi.fn() },
      skillResolver: { resolveSkill: vi.fn() },
    });
    expect(names.toSorted()).toStrictEqual(
      [
        'arrange_workbench',
        'create_file',
        'delete_file',
        'edit_file',
        'export_model',
        'evaluate_model',
        'glob_search',
        'grep',
        'list_directory',
        'read_file',
        'screenshot',
        'test_model',
        'update_todos',
        'use_skill',
      ].toSorted(),
    );
  });

  /* EQ6 (W7 RA-S9): a call that writes more than one path, or outside the
   * workspace, runs its batch in call order; every other tool stays parallel. */
  it('should declare sequential execution only where one call spans more than one path', () => {
    const registry = build({
      graphics: { exportModel: vi.fn() },
      parameters: { getParameters: vi.fn(), applyParameterOperation: vi.fn() },
    });

    const sequential = registry
      .list()
      .filter((tool) => tool.executionMode === 'sequential')
      .map((tool) => tool.name);

    expect(sequential.toSorted()).toStrictEqual(['apply_parameter_operation', 'export_model']);
  });

  /* Review a1 R15: the read-only history tool is listed exactly where a client
   * for it is attached — a disk host today, the browser when W11 wires its
   * worker — and silently absent elsewhere, which is the right degradation and
   * the thing nothing asserted. */
  it('lists the revisions tool only where a revisions client is attached', () => {
    expect(listOf({})).not.toContain('revisions');
    expect(listOf({ revisions: { log: vi.fn(), diff: vi.fn(), describe: vi.fn() } })).toContain('revisions');
  });

  it('lists and dispatches both parameter tools only with one semantic client', async () => {
    const parameters: RpcParameterClient = {
      getParameters: vi.fn<RpcParameterClient['getParameters']>(async () => ({
        success: true,
        status: 'unresolved',
        diagnostics: [],
      })),
      applyParameterOperation: vi.fn<RpcParameterClient['applyParameterOperation']>(async (input) => ({
        success: true,
        outcome: {
          status: 'cancelled-before-apply',
          requestId: input.requestId,
        },
      })),
    };
    expect(listOf({})).not.toContain('get_parameters');
    expect(listOf({ parameters })).toEqual(expect.arrayContaining(['get_parameters', 'apply_parameter_operation']));

    const result = await invoke(build({ parameters }), 'get_parameters', {
      input: { targetFile: 'main.py' },
    });
    expect(result).toMatchObject({
      isError: false,
      content: { success: true, status: 'unresolved' },
    });
    expect(parameters.getParameters).toHaveBeenCalledWith(
      { targetFile: 'main.py' },
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matcher is intentionally untyped.
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

describe('arrange_workbench routing', () => {
  it('accepts basedOn for the exact bytes of a BOM-prefixed layout and checks the edit', async () => {
    const provider = new MemoryProvider();
    const layoutPath = '.tau/workbench/layout.json';
    const original = JSON.stringify({
      version: 1,
      lanes: { chat: true, workbench: true },
      viewer: { kind: 'group', tabs: [] },
      workbench: { kind: 'group', tabs: [] },
    });
    const originalBytes = new TextEncoder().encode(`\uFEFF${original}`);
    await provider.writeFile(layoutPath, originalBytes);
    const view = composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy });
    const mutations = new ResourceQueue();
    const fileSystemFor = (signal?: AbortSignal) => createProviderRpcFileSystem({ provider: view, mutations, signal });
    const registry = build({ fileSystemFor, workbenchFileSystemFor: fileSystemFor });
    const before = `sha256:${createHash('sha256').update(originalBytes).digest('hex')}`;

    const result = await invoke(registry, 'arrange_workbench', {
      input: { basedOn: before, lanes: { chat: false } },
    });

    expect(result).toMatchObject({
      isError: false,
      content: { success: true, status: 'written', revisions: [{ path: layoutPath, previousDigest: before }] },
    });
    expect(await provider.readFile(layoutPath)).not.toEqual(originalBytes);
    provider.dispose();
  });

  it('selects the live-root filesystem during a candidate invocation', async () => {
    const candidate = vi.fn(() => emptyFileSystem());
    const live = vi.fn(() => emptyFileSystem());
    const registry = build({ fileSystemFor: candidate, workbenchFileSystemFor: live });
    await invoke(registry, 'arrange_workbench', { input: { lanes: { chat: true } } });
    expect(live).toHaveBeenCalledOnce();
    expect(candidate).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'two-number look direction',
      input: { views: [{ id: 'front', entryPath: 'main.ts', camera: { kind: 'look', direction: [0, -1] } }] },
      field: 'views[0].camera.direction',
      exact: 'views[0].camera.direction: expected 3 numbers, received 2. Nothing was written.',
    },
    {
      label: 'third split level',
      input: {
        viewer: {
          kind: 'split',
          direction: 'row',
          children: [
            { kind: 'group', tabs: [] },
            {
              kind: 'split',
              direction: 'column',
              children: [
                { kind: 'group', tabs: [] },
                {
                  kind: 'split',
                  direction: 'row',
                  children: [
                    { kind: 'group', tabs: [] },
                    { kind: 'group', tabs: [] },
                  ],
                },
              ],
            },
          ],
        },
      },
      field: 'viewer.children[1].children[1]',
    },
    { label: 'unknown pane', input: { open: [{ kind: 'pane', pane: 'settings' }] }, field: 'open[0].pane' },
    {
      label: 'unknown preset',
      input: { views: [{ id: 'front', entryPath: 'main.ts', camera: { kind: 'preset', preset: 'iso' } }] },
      field: 'views[0].camera.preset',
    },
    {
      label: 'view tab in workbench lane',
      input: { workbench: { kind: 'group', tabs: [{ kind: 'view', view: 'front' }] } },
      field: 'workbench.tabs[0].kind',
    },
    {
      label: 'pane tab in viewer lane',
      input: { viewer: { kind: 'group', tabs: [{ kind: 'pane', pane: 'model' }] } },
      field: 'viewer.tabs[0]',
    },
    {
      label: 'duplicate view',
      input: {
        views: [
          { id: 'front', entryPath: 'main.ts' },
          { id: 'front', entryPath: 'main.ts' },
        ],
      },
      field: 'views[1].id',
    },
    {
      label: 'duplicate entry',
      input: {
        entries: [
          { path: 'main.ts', renderTimeout: 100 },
          { path: 'main.ts', renderTimeout: 200 },
        ],
      },
      field: 'entries[1].path',
    },
    {
      label: 'duplicate viewer tab',
      input: {
        viewer: {
          kind: 'group',
          tabs: [
            { kind: 'view', view: 'front' },
            { kind: 'view', view: 'front' },
          ],
        },
      },
      field: 'viewer',
    },
    {
      label: 'duplicate workbench tab',
      input: {
        workbench: {
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'model' },
            { kind: 'pane', pane: 'model' },
          ],
        },
      },
      field: 'workbench',
    },
    { label: 'basedOn alone', input: { basedOn: 'missing' }, field: 'input' },
    { label: 'new view without entry', input: { views: [{ id: 'front' }] }, field: 'views[0].entryPath' },
    {
      label: 'zero look',
      input: { views: [{ id: 'front', entryPath: 'main.ts', camera: { kind: 'look', direction: [0, 0, 0] } }] },
      field: 'direction',
    },
    {
      label: 'hidden opened lane',
      input: { open: [{ kind: 'pane', pane: 'model' }], lanes: { workbench: false } },
      field: 'lanes.workbench',
    },
    { label: 'forbidden mode', input: { mode: 'replace', lanes: { chat: false } }, field: 'input' },
    { label: 'device lane width', input: { lanes: { chat: true, chatWidth: 320 } }, field: 'lanes' },
    {
      label: 'stored camera pose',
      input: {
        views: [
          {
            id: 'front',
            camera: {
              kind: 'pose',
              frameId: 'tau:root',
              target: [0, 0, 0],
              direction: [0, -1, 0],
              up: [0, 0, 1],
              verticalSpan: 1,
              perspectiveZoom: 1,
            },
          },
        ],
      },
      field: 'views[0].camera.kind',
    },
    {
      label: 'components on view',
      input: { views: [{ id: 'front', components: { hidden: ['lid'] } }] },
      field: 'views[0]',
    },
    {
      label: 'kinematics on view',
      input: { views: [{ id: 'front', kinematics: { coordinates: { hinge: 30 } } }] },
      field: 'views[0]',
    },
    { label: 'null view entry', input: { views: [{ id: 'front', entryPath: null }] }, field: 'views[0].entryPath' },
    {
      label: 'derived measurement distance',
      input: {
        views: [
          { id: 'front', measurements: [{ id: 'm1', startPoint: [0, 0, 0], endPoint: [0.02, 0, 0], distance: 0.02 }] },
        ],
      },
      field: 'views[0].measurements[0]',
    },
  ])('refuses $label at the actual registry boundary without writing', async ({ label, input, field, exact }) => {
    const viewPath = '.tau/workbench/views/front.json';
    const fileSystem = {
      ...emptyFileSystem(),
      exists: vi.fn(
        async (path: string) => path === 'main.ts' || (label === 'duplicate viewer tab' && path === viewPath),
      ),
      readFile: vi.fn(async (path: string) =>
        path === viewPath ? JSON.stringify({ version: 1, entryPath: 'main.ts' }) : 'export const main = 1;\n',
      ),
      writeFile: vi.fn(async () => undefined),
      writeFileChecked: vi.fn(async () => {
        throw new Error('unexpected checked write');
      }),
      deleteFileChecked: vi.fn(async () => {
        throw new Error('unexpected checked delete');
      }),
    };
    const registry = build({
      fileSystemFor: () => fileSystem,
      workbenchFileSystemFor: () => fileSystem,
      workbench: { isModelFile: async () => true },
    });
    const result = await invoke(registry, 'arrange_workbench', { input });
    expect(result).toMatchObject({ isError: true, content: { success: false, errorCode: 'VALIDATION_ERROR' } });
    expect(result.content).toHaveProperty('message', expect.stringContaining(field));
    expect(result.content).toHaveProperty('message', expect.stringContaining('Nothing was written.'));
    if (exact !== undefined) {
      expect(result.content).toEqual({ success: false, errorCode: 'VALIDATION_ERROR', message: exact });
    }
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(fileSystem.writeFileChecked).not.toHaveBeenCalled();
    expect(fileSystem.deleteFileChecked).not.toHaveBeenCalled();
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
    const result = await invoke(build(), 'read_file', {
      input: { nope: true },
    });
    expect(result).toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' },
    });
    expect(result.content).not.toHaveProperty('success');
  });

  it('dispatches a validated call to the RPC handler', async () => {
    const result = await invoke(build(), 'read_file', {
      input: { targetFile: 'main.ts' },
    });
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain('export const main');
  });

  it('uses the trusted invocation ID for exported artifact paths', async () => {
    const exportModel = vi.fn<RpcGraphicsClient['exportModel']>(async () => ({
      success: true,
      exportId: 'mesh',
      issues: [],
      files: [
        {
          name: 'model.stl',
          mimeType: 'model/stl',
          bytes: new Uint8Array([1]),
        },
      ],
    }));
    const registry = build({ graphics: { exportModel } });
    const spoofed = await invoke(registry, 'export_model', {
      input: {
        targetFile: 'main.ts',
        to: 'stl',
        toolCallId: 'untrusted',
      },
    });
    expect(spoofed).toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
    expect(exportModel).not.toHaveBeenCalled();
    const result = await invoke(registry, 'export_model', { input: { targetFile: 'main.ts', to: 'stl' } });

    expect(result).toMatchObject({
      isError: false,
      content: {
        success: true,
        files: [{ artifactPath: '.tau/artifacts/call-1__main.ts-stl/model.stl' }],
      },
    });
  });

  it('should reject obsolete private exportOptions before invoking the graphics client', async () => {
    const exportModel = vi.fn<RpcGraphicsClient['exportModel']>();
    const result = await invoke(build({ graphics: { exportModel } }), 'export_model', {
      input: {
        targetFile: 'main.ts',
        to: 'stl',
        exportOptions: { engine: 'service', service: { url: 'https://slicer.example.com', token: 'stolen-token' } },
      },
    });

    expect(result).toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
    expect(exportModel).not.toHaveBeenCalled();
  });

  it('persists export artifacts through the invocation record filesystem only', async () => {
    const agentWrite = vi.fn<RpcFileSystem['writeBinaryFile']>(async () => {
      throw Object.assign(new Error('Agent records are read-only.'), { code: 'EROFS' });
    });
    const recordWrite = vi.fn<RpcFileSystem['writeBinaryFile']>(async () => undefined);
    const exportModel = vi.fn<RpcGraphicsClient['exportModel']>(async () => ({
      success: true,
      exportId: 'mesh',
      issues: [],
      files: [{ name: 'model.stl', mimeType: 'model/stl', bytes: new Uint8Array([1]) }],
    }));
    const registry = build({
      fileSystemFor: () => ({ ...emptyFileSystem(), writeBinaryFile: agentWrite }),
      recordFileSystemFor: () => ({ ...emptyFileSystem(), writeBinaryFile: recordWrite }),
      graphics: { exportModel },
    });

    const result = await invoke(registry, 'export_model', {
      input: { targetFile: 'main.ts', to: 'stl' },
    });

    expect(result).toMatchObject({ isError: false, content: { success: true } });
    expect(recordWrite).toHaveBeenCalledExactlyOnceWith(
      '.tau/artifacts/call-1__main.ts-stl/model.stl',
      new Uint8Array([1]),
    );
    expect(agentWrite).not.toHaveBeenCalled();
  });

  /* The chat task list (design-to-print workbench D8): one tool, one file,
   * offered by every host because it needs nothing but the filesystem. */
  describe('update_todos', () => {
    const items = [
      { id: 'model-pyramid', title: 'Model the pyramid', status: 'done' },
      { id: 'slice-pyramid', title: 'Slice the pyramid', status: 'in_progress', note: '0.2 mm layers' },
      { id: 'request-print', title: 'Request the print', status: 'pending' },
    ];

    it('writes exactly the expected YAML bytes to the chat directory and reports counts', async () => {
      const writeFile = vi.fn<RpcFileSystem['writeFile']>(async () => undefined);
      const registry = build({ fileSystemFor: () => ({ ...emptyFileSystem(), writeFile }) });

      const result = await invoke(registry, 'update_todos', { input: { chatId: 'chat_01', items } });

      expect(result).toStrictEqual({
        isError: false,
        content: {
          success: true,
          path: '.tau/chats/chat_01/todo.yaml',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
          counts: { pending: 1, in_progress: 1, done: 1 },
        },
      });
      expect(writeFile).toHaveBeenCalledExactlyOnceWith(
        '.tau/chats/chat_01/todo.yaml',
        [
          'version: 1',
          'items:',
          '  - id: model-pyramid',
          '    title: Model the pyramid',
          '    status: done',
          '  - id: slice-pyramid',
          '    title: Slice the pyramid',
          '    status: in_progress',
          '    note: 0.2 mm layers',
          '  - id: request-print',
          '    title: Request the print',
          '    status: pending',
          '',
        ].join('\n'),
      );
    });

    /* Composed exactly as both hosts compose it (`packages/host/src/agent-tools.ts`,
     * `apps/ui/app/workers/agent-host.impl.ts`): the agent's view and the record
     * view over one checkout, under Tau's own path policy, which keeps
     * `.tau/chats` read-only to the agent. */
    it('should write the list through the record view that the agent view refuses', async () => {
      const checkout = new MemoryProvider();
      await checkout.writeFile('.tau/chats/chat_01/events.jsonl', '{"type":"run.lifecycle"}\n');
      const agentView = composeView({ filesystem: checkout }, { consumer: 'agent', policy: tauPathPolicy });
      const recordView = composeView({ filesystem: checkout }, { consumer: 'user', policy: tauPathPolicy });
      const mutations = new ResourceQueue();
      const fileSystemFor = (signal: AbortSignal) =>
        createProviderRpcFileSystem({ provider: agentView, mutations, signal });
      const recordFileSystemFor = (signal: AbortSignal) =>
        createProviderRpcFileSystem({ provider: recordView, mutations, signal });
      const input = { chatId: 'chat_01', items };

      await expect(invoke(build({ fileSystemFor }), 'update_todos', { input })).resolves.toStrictEqual({
        isError: true,
        content: {
          success: false,
          errorCode: 'PERMISSION_DENIED',
          message: 'EROFS: this agent may read but not write .tau/chats/chat_01/todo.yaml; Tau records that itself.',
        },
      });
      expect(await checkout.exists('.tau/chats/chat_01/todo.yaml')).toBe(false);

      const result = await invoke(build({ fileSystemFor, recordFileSystemFor }), 'update_todos', { input });

      expect(result).toStrictEqual({
        isError: false,
        content: {
          success: true,
          path: '.tau/chats/chat_01/todo.yaml',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
          counts: { pending: 1, in_progress: 1, done: 1 },
        },
      });
      expect(await checkout.readFile('.tau/chats/chat_01/todo.yaml', 'utf8')).toBe(
        [
          'version: 1',
          'items:',
          '  - id: model-pyramid',
          '    title: Model the pyramid',
          '    status: done',
          '  - id: slice-pyramid',
          '    title: Slice the pyramid',
          '    status: in_progress',
          '    note: 0.2 mm layers',
          '  - id: request-print',
          '    title: Request the print',
          '    status: pending',
          '',
        ].join('\n'),
      );
      /* The record route writes the list and nothing else of the chat's. */
      expect(await checkout.readFile('.tau/chats/chat_01/events.jsonl', 'utf8')).toBe('{"type":"run.lifecycle"}\n');
    });

    it.each([
      ['duplicate ids', { chatId: 'chat_01', items: [items[0], { ...items[1], id: 'model-pyramid' }] }, 'unique'],
      ['a chat id with a path separator', { chatId: '../other', items }, 'chatId'],
      ['an unknown status', { chatId: 'chat_01', items: [{ ...items[0], status: 'doing' }] }, 'status'],
      ['a missing list', { chatId: 'chat_01' }, 'items'],
    ])('refuses %s without writing', async (_label, input, expectedMessage) => {
      const writeFile = vi.fn<RpcFileSystem['writeFile']>(async () => undefined);
      const registry = build({ fileSystemFor: () => ({ ...emptyFileSystem(), writeFile }) });

      const result = await invoke(registry, 'update_todos', { input });

      expect(result).toMatchObject({ isError: true, content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' } });
      expect(JSON.stringify(result.content)).toContain(expectedMessage);
      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  it('throws the abort reason when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled by operator'));
    await expect(
      invoke(build(), 'read_file', {
        input: { targetFile: 'main.ts' },
        signal: controller.signal,
      }),
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

  it('preserves a checked parameter outcome when its reply signal aborts after admission', async () => {
    const controller = new AbortController();
    const expected = { manifestRevision: 'manifest' };
    const parameters: RpcParameterClient = {
      getParameters: vi.fn(),
      applyParameterOperation: vi.fn<RpcParameterClient['applyParameterOperation']>(async (input) => {
        controller.abort(new Error('transport reply lost'));
        return {
          success: true,
          outcome: {
            status: 'committed',
            requestId: input.requestId,
            revision: expected,
            write: 'applied',
          },
        };
      }),
    };

    await expect(
      invoke(build({ parameters }), 'apply_parameter_operation', {
        signal: controller.signal,
        input: {
          action: 'propose',
          targetFile: 'main.py',
          requestId: 'agent:applied',
          expected,
          pressure: 'final',
          operation: {
            kind: 'native-value',
            group: 'default',
            pointer: '/width',
            value: 5,
          },
        },
      }),
    ).resolves.toMatchObject({ isError: false, content: { outcome: { status: 'committed' } } });
  });

  /* The dead-client class (blueprint R9): once the kernel client behind a live
   * answer dies, the next call must report the death. A registry that cached
   * or replayed the previous verdict would tell the agent its rewritten model
   * still fails, which is the loop this programme exists to end. */
  it('names the kernel death instead of repeating the verdict it answered before it', async () => {
    let answered = false;
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () => {
      if (answered) {
        throw Object.assign(new Error('RuntimeClient has been terminated.'), {
          code: 'RUNTIME_UNAVAILABLE',
        });
      }
      answered = true;
      return {
        success: true,
        status: 'error',
        kernelIssues: [
          {
            message: 'You need a previous curve to sketch a tangent arc',
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    });
    const registry = build({ kernelClient: { evaluateModel } });

    await expect(invoke(registry, 'evaluate_model', { input: { targetFile: 'main.ts' } })).resolves.toMatchObject({
      isError: false,
      content: { status: 'error' },
    });
    const afterDeath = await invoke(registry, 'evaluate_model', { input: { targetFile: 'main.ts' } });

    expect(afterDeath).toMatchObject({
      isError: true,
      content: { errorCode: 'RUNTIME_UNAVAILABLE', message: 'RuntimeClient has been terminated.' },
    });
    expect(JSON.stringify(afterDeath.content)).not.toContain('tangent arc');
  });

  it('forwards local cancellation context without serializing it into RPC input', async () => {
    const controller = new AbortController();
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () => ({
      success: true,
      status: 'ready',
      kernelIssues: [],
    }));
    const result = await invoke(build({ kernelClient: { evaluateModel } }), 'evaluate_model', {
      input: { targetFile: 'main.ts' },
      signal: controller.signal,
    });

    expect(result.isError).toBe(false);
    expect(evaluateModel).toHaveBeenCalledExactlyOnceWith(
      { targetFile: 'main.ts' },
      {
        signal: controller.signal,
      },
    );
    expect(JSON.stringify(result.content)).not.toContain('signal');
  });

  it('isolates an aborted non-cooperative CAD call from its sibling', async () => {
    const first = new AbortController();
    const second = new AbortController();
    const seenSignals: AbortSignal[] = [];
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(
      async ({ targetFile }, context?: RpcInvocationContext) => {
        if (context?.signal) {
          seenSignals.push(context.signal);
        }
        if (targetFile === 'a.ts') {
          return new Promise<never>(() => {
            // Deliberately non-cooperative: the registry race must still settle the wait.
          });
        }
        return { success: true, status: 'ready', kernelIssues: [] };
      },
    );
    const registry = build({ kernelClient: { evaluateModel } });
    const interrupted = invoke(registry, 'evaluate_model', {
      input: { targetFile: 'a.ts' },
      signal: first.signal,
    });
    const sibling = invoke(registry, 'evaluate_model', {
      input: { targetFile: 'b.ts' },
      signal: second.signal,
    });

    first.abort(new Error('only a stopped'));

    await expect(interrupted).rejects.toThrow('only a stopped');
    await expect(sibling).resolves.toMatchObject({ isError: false });
    expect(seenSignals).toEqual([first.signal, second.signal]);
    expect(second.signal.aborted).toBe(false);
  });
});

/* The freshness gate (blueprint R5, charter Q2/Q3). A verdict that names a
 * source revision the run has already replaced is not a geometry answer; it is
 * the host telling the agent about bytes that no longer exist. The registry is
 * the one seam every host and the MCP server share, so the comparison lives
 * here. */
describe('createChatToolRegistry freshness gate', () => {
  const digestOf = (content: string): string => `sha256:${createHash('sha256').update(content).digest('hex')}`;

  const closure = (digest: string) => ({ entry: 'main.ts', files: { 'main.ts': digest } });

  /* The gate checks a disagreeing verdict against the bytes on disk, so the
   * tests need a filesystem that actually holds what the write tools leave. */
  const storedFileSystem = (store: Map<string, string>): RpcFileSystem => ({
    ...emptyFileSystem(),
    readFile: async (path) => {
      const content = store.get(path);
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return content;
    },
    writeFile: async (path, content) => {
      store.set(path, content);
    },
    exists: async (path) => store.has(path),
  });

  const kernelVerdict = (sourceRevision?: unknown) =>
    ({
      success: true,
      status: 'error',
      kernelIssues: [
        {
          message: 'You need a previous curve to sketch a tangent arc',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ],
      ...(sourceRevision === undefined ? {} : { sourceRevision }),
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a hand-built RPC result stands in for the runtime's.
    }) as unknown as Awaited<ReturnType<RpcRuntimeClient['evaluateModel']>>;

  const writeThenAsk = async (
    evaluateModel: RpcRuntimeClient['evaluateModel'],
    content = 'repaired',
    outOfBand?: (store: Map<string, string>) => void,
  ): Promise<Awaited<ReturnType<ReturnType<typeof build>['invoke']>>> => {
    const store = new Map<string, string>();
    const registry = build({ kernelClient: { evaluateModel }, fileSystemFor: () => storedFileSystem(store) });
    await invoke(registry, 'create_file', { input: { targetFile: 'main.ts', content } });
    outOfBand?.(store);
    return invoke(registry, 'evaluate_model', { input: { targetFile: 'main.ts' } });
  };

  /* F1: the write memory is per registry, so a person editing in the editor, a
   * peer run or a `git checkout` makes it name bytes nobody has. The verdict
   * that reads what is actually there is the fresh one. */
  it('accepts a verdict for bytes edited outside the tools, without asking twice', async () => {
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () =>
      kernelVerdict(closure(digestOf('edited in the editor'))),
    );

    const verdict = await writeThenAsk(evaluateModel, 'repaired', (store) => {
      store.set('main.ts', 'edited in the editor');
    });

    expect(evaluateModel).toHaveBeenCalledOnce();
    expect(verdict).toMatchObject({ isError: false, content: { status: 'error' } });
  });

  it('still refuses when the path the verdict answered for is gone', async () => {
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () =>
      kernelVerdict(closure(digestOf('broken'))),
    );

    const verdict = await writeThenAsk(evaluateModel, 'repaired', (store) => {
      store.delete('main.ts');
    });

    expect(evaluateModel).toHaveBeenCalledTimes(2);
    expect(verdict).toMatchObject({ isError: true, content: { errorCode: 'STALE_EVALUATION' } });
  });

  it('refuses a verdict that still answers for replaced bytes after one re-invocation', async () => {
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () =>
      kernelVerdict(closure(digestOf('broken'))),
    );

    const verdict = await writeThenAsk(evaluateModel);

    expect(evaluateModel).toHaveBeenCalledTimes(2);
    expect(verdict).toMatchObject({
      isError: true,
      content: {
        errorCode: 'STALE_EVALUATION',
        expected: { path: 'main.ts', digest: digestOf('repaired') },
        actual: { path: 'main.ts', digest: digestOf('broken') },
      },
    });
    expect(JSON.stringify(verdict.content)).not.toContain('tangent arc');
  });

  it('returns the fresh verdict when the re-invocation answers for the written bytes', async () => {
    let asked = 0;
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () => {
      asked += 1;
      return asked === 1
        ? kernelVerdict(closure(digestOf('broken')))
        : // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a hand-built RPC result stands in for the runtime's.
          ({
            success: true,
            status: 'ready',
            kernelIssues: [],
            sourceRevision: closure(digestOf('repaired')),
          } as unknown as Awaited<ReturnType<RpcRuntimeClient['evaluateModel']>>);
    });

    const verdict = await writeThenAsk(evaluateModel);

    expect(evaluateModel).toHaveBeenCalledTimes(2);
    expect(verdict).toMatchObject({ isError: false, content: { status: 'ready' } });
  });

  it('passes an unproven verdict through untouched rather than calling it fresh', async () => {
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () => kernelVerdict());

    const verdict = await writeThenAsk(evaluateModel);

    expect(evaluateModel).toHaveBeenCalledOnce();
    expect(verdict).toMatchObject({ isError: false, content: { status: 'error' } });
  });

  it('invokes once when the verdict names the digest the write left', async () => {
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () =>
      kernelVerdict(closure(digestOf('repaired'))),
    );

    const verdict = await writeThenAsk(evaluateModel);

    expect(evaluateModel).toHaveBeenCalledOnce();
    expect(verdict).toMatchObject({ isError: false, content: { status: 'error' } });
  });

  it('ignores a closure that never read the written path', async () => {
    const evaluateModel = vi.fn<RpcRuntimeClient['evaluateModel']>(async () =>
      kernelVerdict({ entry: 'other.ts', files: { 'other.ts': digestOf('unrelated') } }),
    );

    const verdict = await writeThenAsk(evaluateModel);

    expect(evaluateModel).toHaveBeenCalledOnce();
    expect(verdict).toMatchObject({ isError: false });
  });

  it('refuses a test_model run whose loaded models answer for replaced bytes', async () => {
    const runTests = vi.fn<RpcGeoSpecClient['runTests']>(
      async () =>
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a hand-built RPC result stands in for the runner's.
        ({
          success: true,
          summary: { total: 1, passed: 0, failed: 1 },
          sourceRevisions: [closure(digestOf('broken'))],
        }) as unknown as Awaited<ReturnType<RpcGeoSpecClient['runTests']>>,
    );
    const store = new Map<string, string>();
    const registry = build({ geospec: { runTests }, fileSystemFor: () => storedFileSystem(store) });
    await invoke(registry, 'create_file', { input: { targetFile: 'main.ts', content: 'repaired' } });

    const verdict = await invoke(registry, 'test_model', { input: {} });

    expect(runTests).toHaveBeenCalledTimes(2);
    expect(verdict).toMatchObject({
      isError: true,
      content: {
        errorCode: 'STALE_EVALUATION',
        expected: { path: 'main.ts', digest: digestOf('repaired') },
        actual: { path: 'main.ts', digest: digestOf('broken') },
      },
    });
  });
});
