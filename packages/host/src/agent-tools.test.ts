import type { ParameterSnapshot } from '@taucad/parameters';
/**
 * What the daemon offers the model, and what it does with it.
 *
 * The listing is load-bearing: a tool the model is told about but that cannot
 * work costs a turn and a retry, so the geometry tools appear only with a
 * runtime attached. Rendering itself is *not* browser-only — the native raster
 * backend runs under plain Node (probe:
 * `substrate/capture/nanoraster-node-probe.txt`) — so `screenshot` and
 * `export_model` are real capabilities here, driven through the runtime's
 * own export routes rather than a second rendering path.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { toPiToolContent } from '@taucad/agent-host';
import type { JsonValue } from '@taucad/agent-host';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsProvider, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import workbenchBundles from '@taucad/workbench/agent/resources.js';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import type { MachineClient, MachineDirectoryEntry, MachineProvider } from '@taucad/runtime/machine';
import type {
  RuntimeDocument,
  ViewSubscription,
  WideViewRequest,
  Evaluation,
  Rendering,
  ExportResult,
  Description,
  UpdateOutcome,
} from '@taucad/runtime/client';
import type { SourceRevision } from '@taucad/runtime/types';
import { sha256Bytes } from '@taucad/utils/hash';
import { createActor, createAsyncLogic } from 'xstate';
import { parameterSetMachine } from '@taucad/parameters/set-machine';

import * as agentToolsRegistry from '@taucad/agent-tools/registry';
import type { SystemSkillBundle } from '@taucad/agent-tools/registry';

import { createHostToolRegistry } from '#agent-tools.js';
import type { HostExportFile, HostRuntimeClient, HostToolRegistryOptions } from '#agent-tools.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const makeWorkspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-agent-tools-'));
  roots.push(root);
  await writeFile(join(root, 'main.ts'), 'export const main = 1;\n', 'utf8');
  return root;
};

const withSkill = async (root: string, slug: string, description: string): Promise<string> => {
  const directory = join(root, '.agents', 'skills', slug);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'SKILL.md'),
    `---\nname: ${slug}\ndescription: ${description}\nversion: 1.0.0\nenabled: true\n---\n\n# ${slug}\n\nBody.\n`,
    'utf8',
  );
  return directory;
};

const makeSystemSkill = async (): Promise<SystemSkillBundle> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-system-skill-'));
  roots.push(root);
  const skillMarkdown =
    '---\nname: cad-test\ndescription: Test package skill\nversion: 1.0.0\nenabled: true\n---\n\n# System skill\n';
  const apiIndex = 'cylinder(h, r | r1,r2 | d, center=false)\n';
  await Promise.all([
    writeFile(join(root, 'SKILL.md'), skillMarkdown, 'utf8'),
    writeFile(join(root, 'api-index.md'), apiIndex, 'utf8'),
  ]);
  return {
    slug: 'cad-test',
    name: 'CAD Test',
    description: 'Test package skill',
    version: '1.0.0',
    whenToUse: 'Use in this test.',
    body: skillMarkdown,
    fingerprint: 'bundle-fingerprint',
    files: [
      {
        path: 'SKILL.md',
        url: pathToFileURL(join(root, 'SKILL.md')).href,
        byteLength: Buffer.byteLength(skillMarkdown),
        lineCount: 1,
        contentKind: 'text',
        mediaType: 'text/markdown',
        sha256: '0'.repeat(64),
      },
      {
        path: 'api-index.md',
        url: pathToFileURL(join(root, 'api-index.md')).href,
        byteLength: Buffer.byteLength(apiIndex),
        lineCount: 1,
        contentKind: 'text',
        mediaType: 'text/markdown',
        sha256: '1'.repeat(64),
      },
    ],
  };
};

const webpFile = (name: string): HostExportFile => ({
  name,
  mimeType: 'image/webp',
  bytes: new Uint8Array([1, 2, 3]),
});

const glb = (): Uint8Array<ArrayBuffer> => {
  const content = new Uint8Array(12);
  const header = new DataView(content.buffer);
  header.setUint32(0, 0x46_54_6c_67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, content.byteLength, true);
  return content;
};

const fakeView = (current: () => Rendering): ViewSubscription => ({
  view: 'model',
  request: {},
  rendering: vi.fn(async () => ({ superseded: false, rendering: current() })),
  update: vi.fn(async () => ({ superseded: false, rendering: current() })),
  on: vi.fn(() => () => undefined),
  close: vi.fn(),
});

const fakeDocument = (
  overrides: Partial<Pick<RuntimeDocument, 'evaluation' | 'export'>> & { rendering?: () => Rendering } = {},
): RuntimeDocument => {
  const content = glb();
  const evaluation: Evaluation = {
    id: 'evaluation',
    success: true,
    transient: false,
    views: [{ id: 'model', title: 'Model', mimeType: 'model/gltf-binary' }],
    exports: [],
    issues: [],
  };
  const rendering: Rendering = {
    success: true,
    requestId: 'rendering',
    evaluationId: evaluation.id,
    transient: false,
    view: 'model',
    artifact: { mimeType: 'model/gltf-binary', content },
    hash: 'geometry',
    issues: [],
  };
  const viewSpy = vi.fn((_id?: string, _request?: WideViewRequest) =>
    fakeView(overrides.rendering ?? (() => rendering)),
  );
  function documentView(): ViewSubscription<string, Readonly<{ options?: never; instance?: never; content?: never }>>;
  function documentView<Id extends string>(id: Id, request?: WideViewRequest): ViewSubscription<Id>;
  function documentView(id?: string, request?: WideViewRequest): ViewSubscription {
    return viewSpy(id, request);
  }
  return {
    id: 'document',
    evaluation: vi.fn(async () => ({ superseded: false, evaluation })),
    update: vi.fn(async () => ({ superseded: false, evaluation })),
    view: documentView,
    export: vi.fn<RuntimeDocument['export']>(
      async (): Promise<ExportResult> => ({
        success: true,
        exportId: 'glb',
        evaluationId: evaluation.id,
        files: [webpFile('render.webp')],
        issues: [],
      }),
    ),
    on: vi.fn(() => () => undefined),
    close: vi.fn(),
    ...overrides,
  };
};

const fakeRuntime = (overrides: Partial<HostRuntimeClient> = {}): HostRuntimeClient => {
  const base: HostRuntimeClient = {
    connect: vi.fn(async () => undefined),
    capabilities: undefined,
    open: vi.fn(() => fakeDocument()),
    describe: vi.fn(async (): Promise<Description> => ({ success: false, kernelId: undefined, issues: [] })),
    transcode: vi.fn<HostRuntimeClient['transcode']>(async () => ({
      success: true,
      data: [webpFile('render.webp')],
      issues: [],
    })),
  };
  return { ...base, ...overrides };
};

const invoke = async (registry: ReturnType<typeof createHostToolRegistry>, toolName: string, input: JsonValue) =>
  registry.invoke({
    toolCallId: 'call-1',
    toolName,
    input,
    signal: new AbortController().signal,
  });

const waitForFileEvent = async (
  events: ReadonlyArray<{ readonly type: string; readonly path?: string }>,
  path: string,
): Promise<void> => {
  const deadline = Date.now() + 10_000;
  while (!events.some((event) => event.path === path)) {
    if (Date.now() > deadline) {
      throw new Error(`No watch event arrived for ${path}: ${JSON.stringify(events)}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded polling waits for the OS watcher.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
};

/** A bound X1C, its provider, and a runtime whose slice is a fixed container: the print path minus a printer. */
const printFixture = () => {
  const timestamp = '2026-09-24T00:00:00.000Z';
  /* Not a real container: the planner's summary is advisory and covered in its own tests. */
  const sliced = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const slice = vi.fn<RuntimeDocument['export']>(async () => ({
    success: true,
    exportId: 'gcode.3mf',
    evaluationId: 'evaluation',
    files: [{ name: 'main.gcode.3mf', mimeType: 'application/vnd.bambulab.gcode-3mf', bytes: sliced }],
    issues: [],
  }));
  const runtimeClient = async () => fakeRuntime({ open: vi.fn(() => fakeDocument({ export: slice })) });
  const projectId = 'proj_000000000000000000001';
  const toolhead = {
    id: 'tool-0',
    label: 'Toolhead',
    kind: 'toolhead',
    nozzles: [
      {
        id: 'nozzle-0.4',
        diameter: { value: 0.4, unit: 'mm' },
        maximumTemperature: { value: 300, unit: 'Cel' },
        material: 'hardened',
      },
    ],
  } as const;
  const filament = {
    id: 'filament',
    label: 'Filament',
    kind: 'material-system',
    units: [{ id: 'ams-a', label: 'AMS', kind: 'feeder', slots: [{ id: 'a1', label: 'A1' }] }],
    routes: [{ unitId: 'ams-a', toolheadIds: ['tool-0'] }],
  } as const;
  const entry = {
    machineId: 'machine-1',
    name: 'Workshop X1C',
    providerId: 'bambu',
    descriptor: {
      id: 'physical-1',
      name: 'X1C',
      model: 'X1C',
      capabilities: {
        components: [toolhead, filament],
        jobs: {
          type: 'supported',
          accepts: [
            {
              contract: { id: 'manufacturing.toolpath.bambu-gcode-3mf', version: 1 },
              mediaType: 'application/vnd.bambulab.gcode-3mf',
              requiredMembers: ['Metadata/plate_1.gcode'],
              payloadSelection: 'plate',
              technology: 'additive.fff',
            },
          ],
          attestations: [],
          safety: { authority: 'approved-agent', attended: false, interlocks: [] },
        },
      },
    },
    snapshot: {
      connection: 'connected',
      observedAt: timestamp,
      state: { status: 'ready' },
      components: [
        {
          componentId: 'bed',
          group: 'temperature',
          receivedAt: timestamp,
          knowledge: 'known',
          value: { kind: 'readings', values: [{ id: 'plate', label: 'Build plate', value: 'textured-pei' }] },
        },
        {
          componentId: 'filament',
          group: 'material',
          receivedAt: timestamp,
          knowledge: 'known',
          value: {
            kind: 'material-system',
            slots: [
              {
                slot: { unitId: 'ams-a', slotId: 'a1' },
                state: 'loaded',
                identifiedBy: 'tag',
                material: {
                  materialType: 'PLA',
                  color: '#FFFFFFFF',
                  preset: { profileId: 'GFA00', settingId: '' },
                  calibration: { type: 'default' },
                },
                editing: { allowed: true, duringRun: false },
              },
            ],
            routes: [],
          },
        },
      ],
      activities: [],
      checks: [],
      availability: [],
      alerts: [],
      operations: [],
    },
    freshness: 'current',
  } as unknown as MachineDirectoryEntry;
  /* No vendor: the reference engine slices, and no host Bambu Studio is looked for. */
  const provider = {
    id: 'bambu',
    name: 'Bambu Lab',
    manifest: {
      version: 3,
      identity: { typeId: 'bambu.x1c', vendor: 'Bambu Lab', model: 'x1c', displayName: 'Bambu Lab X1C' },
      components: [toolhead, filament],
      processes: [
        {
          type: 'fff',
          filamentDiameter: { value: 1.75, unit: 'mm' },
          bed: { plates: [{ id: 'cool-plate', label: 'Cool Plate' }] },
          slicing: {
            recommended: { nozzleTemperature: { value: 220, unit: 'Cel' }, bedTemperature: { value: 55, unit: 'Cel' } },
          },
        },
      ],
    },
  } as unknown as MachineProvider;
  const requestJob = vi.fn<MachineClient['requestJob']>(async (input) => ({
    version: 1,
    jobId: input.jobId,
    machineId: input.machineId,
    artifact: input.artifact,
    configuration: input.configuration,
    requestedBy: input.requestedBy,
    state: 'awaiting-approval',
    createdAt: timestamp,
    updatedAt: timestamp,
    program: { facts: { process: 'fff' }, ...input.program, name: input.program?.name ?? 'main.gcode.3mf' },
    checks: [],
  }));
  const withdrawJob = vi.fn<MachineClient['withdrawJob']>();
  const machines = {
    available: true,
    list: async () => ({
      cursor: { hostId: 'host-1', authorityId: 'authority-1', generation: 'generation-1', position: 1, revision: 1 },
      entries: [entry],
    }),
    listProviders: async () => [provider],
    /* The provider finds the program ready and completes what the call chose from the program, as R5 says. */
    checkJob: vi.fn<MachineClient['checkJob']>(async () => ({
      status: 'ready',
      program: { name: 'main.gcode.3mf', facts: { process: 'fff' } },
      checks: [],
      configuration: {
        amsMapping: [0],
        expectedBedType: 'textured-pei',
        expectedModel: 'X1C',
        expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
      },
    })),
    requestJob,
    listJobs: async () =>
      Promise.all(
        requestJob.mock.results.map(async (result) => result.value as ReturnType<MachineClient['requestJob']>),
      ),
    withdrawJob,
  } as unknown as NonNullable<HostToolRegistryOptions['machines']>;

  return { timestamp, sliced, slice, runtimeClient, projectId, requestJob, withdrawJob, machines };
};

describe('createHostToolRegistry', () => {
  it('should publish only the canonical factory authoring contract before opening its runner', async () => {
    const geospecRunner = vi.fn<() => Promise<GeoSpecRunner>>();
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      geospecRunner,
    });
    const description = registry.list().find((tool) => tool.name === 'test_model')?.description;
    expect(description).toContain('expectGeo');
    expect(description).toContain('loadModel');
    expect(description).not.toContain('expectNativeGeo');
    expect(description).not.toContain('loadNativeModel');
    expect(geospecRunner).not.toHaveBeenCalled();
  });

  it('offers the file tools and use_skill with no runtime, and never a geometry tool it cannot serve', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    const names = registry.list().map((tool) => tool.name);

    expect(names).toContain('read_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('grep');
    /* Skills are disk, not geometry: they never depend on a runtime. */
    expect(names).toContain('use_skill');
    expect(names).not.toContain('evaluate_model');
    expect(names).not.toContain('screenshot');
    expect(names).not.toContain('export_model');
  });

  it("refuses a tool write under Tau's control metadata and still serves the read (V19 mask)", async () => {
    const workspaceRoot = await makeWorkspace();
    await mkdir(join(workspaceRoot, '.tau', 'chats', 'chat-1'), { recursive: true });
    await writeFile(join(workspaceRoot, '.tau', 'chats', 'chat-1', 'events.jsonl'), '{"seq":1}\n', 'utf8');
    const registry = createHostToolRegistry({ workspaceRoot });

    const refused = await invoke(registry, 'create_file', {
      targetFile: '.tau/chats/chat-1/events.jsonl',
      content: '{"seq":99}\n',
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('PERMISSION_DENIED');
    expect(JSON.stringify(refused.content)).toContain('Tau records that itself');
    expect(await readFile(join(workspaceRoot, '.tau', 'chats', 'chat-1', 'events.jsonl'), 'utf8')).toBe('{"seq":1}\n');

    const read = await invoke(registry, 'read_file', { targetFile: '.tau/chats/chat-1/events.jsonl' });
    expect(read.isError).toBe(false);
    expect(JSON.stringify(read.content)).toContain('seq');

    /* Inside `.tau` an unlisted path is Tau's, not the agent's (P13): a near
     * miss is refused rather than treated as authored content. */
    const nearMiss = await invoke(registry, 'create_file', { targetFile: '.tau/chats-notes.md', content: 'ok\n' });
    expect(nearMiss.isError).toBe(true);

    const recordWrites = await Promise.all(
      ['.tau/artifacts/forged.stl', '.tau/tool-results/forged.json', '.tau/offloaded-tool-results/forged.json'].map(
        async (targetFile) => invoke(registry, 'create_file', { targetFile, content: 'forged\n' }),
      ),
    );
    for (const recordWrite of recordWrites) {
      expect(recordWrite.isError).toBe(true);
      expect(JSON.stringify(recordWrite.content)).toContain('PERMISSION_DENIED');
    }

    /* The authored `.tau` controls keep their own rows, so the agent still
     * writes the file it is asked to keep. */
    const authored = await invoke(registry, 'create_file', { targetFile: '.tau/AGENTS.md', content: 'ok\n' });
    expect(authored.isError).toBe(false);
  });

  it('offers test_model wherever the GeoSpec engine resolves, with no runtime attached', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    expect(registry.list().map((tool) => tool.name)).toContain('test_model');
  });

  it('withholds test_model when the host withholds it (geospecRunner: false)', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace(), geospecRunner: false });
    expect(registry.list().map((tool) => tool.name)).not.toContain('test_model');
  });

  it('runs test_model through the injected runner and projects the verdict', async () => {
    const workspaceRoot = await makeWorkspace();
    await writeFile(join(workspaceRoot, 'cube.geospec.ts'), 'export const spec = 1;\n', 'utf8');
    const run = vi.fn(async ({ files }: { readonly files: readonly string[] }) => ({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: files.map(
        (file) =>
          ({
            file,
            result: {
              success: true,
              issues: [],
              tests: [{ suite: ['cube'], name: 'is watertight', status: 'passed', assertions: [], diagnostics: [] }],
            },
          }) as const,
      ),
    }));
    const close = vi.fn(async () => undefined);
    const registry = createHostToolRegistry({
      workspaceRoot,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies exactly the runner slice the adapter drives.
      geospecRunner: async () => ({ run, close }) as unknown as GeoSpecRunner,
    });

    const result = await invoke(registry, 'test_model', {});
    expect(result.isError).toBe(false);
    expect(run).toHaveBeenCalledWith({ files: ['cube.geospec.ts'] });
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.content)).toContain('cube > is watertight');
  });

  it('closes a GeoSpec worker when its MCP request is cancelled', async () => {
    const workspaceRoot = await makeWorkspace();
    await writeFile(join(workspaceRoot, 'cube.geospec.ts'), 'export const spec = 1;\n', 'utf8');
    const started = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<Awaited<ReturnType<GeoSpecRunner['run']>>>();
    // `abort` is cooperative: the run settles once the current file stops, and only then is the runner closed.
    const abort = vi.fn(() => {
      finished.resolve({ success: false, passed: 0, failed: 1, selectedTests: 0, files: [] });
    });
    const close = vi.fn(async () => undefined);
    const registry = createHostToolRegistry({
      workspaceRoot,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the fake supplies the runner lifecycle being cancelled.
      geospecRunner: async () =>
        ({
          run: async () => {
            started.resolve();
            return finished.promise;
          },
          abort,
          close,
        }) as unknown as GeoSpecRunner,
    });
    const controller = new AbortController();
    const request = registry.invoke({
      toolCallId: 'cancel-geospec',
      toolName: 'test_model',
      input: {},
      signal: controller.signal,
    });
    await started.promise;
    const cancelled = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancelled;
    expect(abort).toHaveBeenCalledWith('test_model request cancelled');
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalled();
    });
  });

  it('names the source revision of every model test_model loaded (R4)', async () => {
    const workspaceRoot = await makeWorkspace();
    await writeFile(join(workspaceRoot, 'cube.geospec.ts'), 'export const spec = 1;\n', 'utf8');
    await writeFile(join(workspaceRoot, 'cube.ts'), 'cube source control', 'utf8');
    const sourceRevision: SourceRevision = {
      entry: 'cube.ts',
      files: {
        // SAFETY: the fixture uses the actual SHA-256 of the authored source bytes.
        'cube.ts': `sha256:${await sha256Bytes(new TextEncoder().encode('cube source control'))}` as Exclude<
          SourceRevision['files'][string],
          'missing'
        >,
      },
    };
    const run = vi.fn<GeoSpecRunner['run']>(async ({ files = [] }) => ({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: files.map((file) => ({
        file,
        result: {
          success: true,
          passed: false,
          bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
          issues: [],
          tests: [{ suite: ['cube'], name: 'is watertight', status: 'passed', assertions: [], diagnostics: [] }],
          lineage: {
            status: 'unavailable',
            modules: [],
            loads: [
              {
                loadId: 'cube-load',
                status: 'unavailable',
                evidence: {
                  loadId: 'cube-load',
                  status: 'complete',
                  format: 'glb',
                  parameters: {},
                  ingestOptions: {},
                  sourceRevision,
                  artifacts: [],
                },
              },
            ],
          },
        },
      })),
    }));
    const registry = createHostToolRegistry({
      workspaceRoot,
      geospecRunner: async () => ({
        run,
        on: () => () => undefined,
        abort: () => undefined,
        close: async () => undefined,
      }),
    });

    const result = await invoke(registry, 'test_model', {});

    expect(result.isError).toBe(false);
    expect(result.content).toMatchObject({ sourceRevisions: [sourceRevision] });
  });

  it('resolves an authored workspace skill through use_skill', async () => {
    const workspaceRoot = await makeWorkspace();
    await withSkill(workspaceRoot, 'bracket-design', 'Bracket design rules');
    const registry = createHostToolRegistry({ workspaceRoot });

    const result = await invoke(registry, 'use_skill', { skillName: 'bracket-design' });
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain('Bracket design rules');
  });

  it('projects injected package skills as lazy read-only files without polluting root search', async () => {
    const workspaceRoot = await makeWorkspace();
    const registry = createHostToolRegistry({
      workspaceRoot,
      systemSkillBundles: [await makeSystemSkill()],
    });

    const activated = await invoke(registry, 'use_skill', { skillName: 'cad-test' });
    expect(activated.isError, JSON.stringify(activated)).toBe(false);
    expect(JSON.stringify(activated.content)).toContain('.agents/skills/cad-test');
    expect(JSON.stringify(activated.content)).toContain('api-index.md');

    const read = await invoke(registry, 'read_file', {
      targetFile: '.agents/skills/cad-test/api-index.md',
    });
    expect(read.isError).toBe(false);
    expect(JSON.stringify(read.content)).toContain('cylinder(h, r | r1,r2 | d, center=false)');

    const implicit = await invoke(registry, 'grep', { pattern: 'cylinder' });
    expect(JSON.stringify(implicit.content)).not.toContain('api-index.md');
    const explicit = await invoke(registry, 'grep', {
      pattern: 'cylinder',
      path: '.agents/skills/cad-test',
    });
    expect(JSON.stringify(explicit.content)).toContain('.agents/skills/cad-test/api-index.md');

    const refused = await invoke(registry, 'edit_file', {
      targetFile: '.agents/skills/cad-test/api-index.md',
      oldString: 'cylinder',
      newString: 'cube',
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain('PERMISSION_DENIED');
  });

  it('activates and reads the published workbench skill', async () => {
    const workspaceRoot = await makeWorkspace();
    const registry = createHostToolRegistry({ workspaceRoot, systemSkillBundles: workbenchBundles });
    const activated = await invoke(registry, 'use_skill', { skillName: 'workbench' });
    expect(activated.isError).toBe(false);
    expect(JSON.stringify(activated.content)).toContain('Read before you rearrange');
    const read = await invoke(registry, 'read_file', { targetFile: '.agents/skills/workbench/SKILL.md' });
    expect(read.isError).toBe(false);
    expect(JSON.stringify(read.content)).toContain('arrange_workbench');
  });

  it('activates an installed Tau Store skill named by the plugin manifest', async () => {
    const workspaceRoot = await makeWorkspace();
    await withSkill(workspaceRoot, 'woodworking', 'Joinery and grain direction');
    await mkdir(join(workspaceRoot, '.agents', 'plugins'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.agents', 'plugins', 'installed.json'),
      JSON.stringify({
        skills: {
          woodworking: {
            status: 'shadowed',
            source: 'tau-store',
            installedPath: '.agents/skills/woodworking/SKILL.md',
            version: '1.0.0',
            updatedAt: '2026-09-02T00:00:00.000Z',
          },
        },
      }),
      'utf8',
    );
    const registry = createHostToolRegistry({ workspaceRoot });

    const result = await invoke(registry, 'use_skill', { skillName: 'woodworking' });
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain('Joinery and grain direction');
    /* The workspace copy wins over the manifest entry, which is recorded as the
     * shadowed source rather than dropped. */
    expect(JSON.stringify(result.content)).toContain('tau-store');
  });

  it('refuses an unknown skill with a typed error rather than a throw', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    const result = await invoke(registry, 'use_skill', { skillName: 'no-such-skill' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Skill not found');
  });

  it('offers the geometry tools once a runtime is attached', async () => {
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => fakeRuntime(),
    });
    const names = registry.list().map((tool) => tool.name);

    expect(names).toContain('evaluate_model');
    expect(names).toContain('screenshot');
    expect(names).toContain('export_model');
  });

  it('offers request_job only with a runtime, a project id and a machine, and slices at the requested quality through its own export route', async () => {
    const workspaceRoot = await makeWorkspace();
    const { sliced, slice, runtimeClient, projectId, requestJob, withdrawJob, machines } = printFixture();
    const names = (options: Partial<HostToolRegistryOptions>) =>
      createHostToolRegistry({ workspaceRoot, ...options })
        .list()
        .map((tool) => tool.name);
    expect(names({ runtimeClient, projectId })).not.toContain('request_job');
    expect(names({ runtimeClient, machines })).not.toContain('request_job');
    expect(names({ projectId, machines })).not.toContain('request_job');
    /* No revision history: a print names its project, not a revision. */
    const registry = createHostToolRegistry({ workspaceRoot, runtimeClient, projectId, machines });
    expect(registry.list().map((tool) => tool.name)).toContain('request_job');

    const result = await invoke(registry, 'request_job', {
      targetFile: 'main.ts',
      preset: 'fine',
      options: { walls: 3 },
    });
    expect(result).toMatchObject({
      isError: false,
      content: { job: { jobId: 'call-1', machineId: 'machine-1', state: 'awaiting-approval' } },
    });
    /* The quality the agent asked for is what the slicer receives, over the machine's own options. */
    expect(slice).toHaveBeenCalledExactlyOnceWith('gcode.3mf', {
      signal: expect.any(AbortSignal) as AbortSignal,
      options: {
        plate: 'textured-pei',
        nozzleDiameter: 0.4,
        filamentDiameter: 1.75,
        nozzleTemperature: 220,
        bedTemperature: 55,
        walls: 3,
        preset: 'fine',
      },
    });
    const request = requestJob.mock.calls[0]![0];
    expect(request.artifact).not.toHaveProperty('revision');
    expect(request.artifact).toMatchObject({
      projectId,
      path: '.tau/artifacts/call-1__main.ts-gcode.3mf/main.gcode.3mf',
      digest: `sha256:${await sha256Bytes(sliced)}`,
      length: sliced.byteLength,
      mediaType: 'application/vnd.bambulab.gcode-3mf',
      selectedMember: 'Metadata/plate_1.gcode',
    });
    expect(request.configuration).toMatchObject({
      expectedModel: 'X1C',
      expectedBedType: 'textured-pei',
      expectedMaterials: [{ slot: 0, materialId: 'PLA' }],
      amsMapping: [0],
    });
    expect(request.program).toMatchObject({ name: 'main.gcode.3mf' });
    /* The slice the machine host will read is the one the runtime produced, recorded in the project. */
    expect(new Uint8Array(await readFile(join(workspaceRoot, request.artifact.path)))).toEqual(sliced);

    /* The same registry serves MCP: a slicer key the agent may not choose refuses before slicing. */
    const refused = await invoke(registry, 'request_job', { targetFile: 'main.ts', options: { engine: 'service' } });
    expect(refused).toMatchObject({
      isError: true,
      content: { errorCode: 'TOOL_INPUT_VALIDATION_FAILED', message: expect.stringContaining('"engine"') as string },
    });
    expect(slice).toHaveBeenCalledOnce();
    expect(requestJob).toHaveBeenCalledOnce();

    /* A chat's answer to the job reaches the registry that asked, whichever root the run used (D5, GM.r1 H2). */
    await registry.answerApproval?.({
      toolName: 'request_job',
      payload: { kind: 'job', jobId: 'call-1', machineId: 'machine-1' },
      resolution: { interruptId: 'interrupt-1', outcome: 'cancelled' },
    });
    expect(withdrawJob).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ jobId: 'call-1' }));
  });

  it("reads the project's print intent through the filesystem authority a project host opens its roots with", async () => {
    const workspaceRoot = await makeWorkspace();
    /* The double's own intent (2026-10-03): the high-temperature plate and the external spool. */
    await mkdir(join(workspaceRoot, '.tau', 'machines', 'settings'), { recursive: true });
    await writeFile(
      join(workspaceRoot, '.tau', 'machines', 'settings', 'bambu.x1c.json'),
      JSON.stringify({
        version: 1,
        typeId: 'bambu.x1c',
        activeProfile: 'default',
        profiles: {
          default: {
            name: 'Default',
            configurations: {
              'bambu.machine.settings': { version: '1.0.0', values: { plate: 'high-temperature' } },
            },
          },
        },
      }),
    );
    /* The desktop and `tau serve` hand the host the authority's client, not a local provider (services-host.impl.ts). */
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, { policy: tauPathPolicy, allowRoot: (root) => root === workspaceRoot });
    const channel = new NodeFsChannel(port1);
    try {
      const { runtimeClient, projectId, requestJob, machines } = printFixture();
      const registry = createHostToolRegistry({
        workspaceRoot,
        runtimeClient,
        projectId,
        machines,
        filesystem: (root) => new NodeFsProviderClient(channel, root),
      });

      const result = await invoke(registry, 'request_job', { targetFile: 'main.ts' });

      expect(result).toMatchObject({ isError: false, content: { job: { state: 'awaiting-approval' } } });
      /* The project's saved choices, not the printer's defaults, prepared the job. */
      expect(requestJob.mock.calls[0]![0].program).toMatchObject({
        preferences: { scope: 'project', typeId: 'bambu.x1c', profileId: 'default' },
      });
    } finally {
      channel.close();
      await stop();
    }
  });

  it('offers both parameter tools only with a native parameter actor and preserves its outcome', async () => {
    const workspaceRoot = await makeWorkspace();
    const actor = createActor(
      parameterSetMachine.provide({
        actors: {
          loadParameterSet: createAsyncLogic({
            run: async (): Promise<ParameterSnapshot> => {
              throw Object.assign(new Error('No declared parameter semantics.'), { code: 'SEMANTICS_UNRESOLVED' });
            },
          }),
        },
      }),
      { input: { target: { authority: 'test', root: workspaceRoot, entry: 'main.ts' } } },
    );
    actor.start();
    const open = vi.fn(async () => actor);
    const registry = createHostToolRegistry({ workspaceRoot, parameterActor: open });

    expect(registry.list().map(({ name }) => name)).toEqual(
      expect.arrayContaining(['get_parameters', 'apply_parameter_operation']),
    );
    const unresolved = await invoke(registry, 'get_parameters', { targetFile: 'main.ts' });
    expect(JSON.stringify(unresolved.content)).toContain('SEMANTICS_UNRESOLVED');

    const rejected = await invoke(registry, 'apply_parameter_operation', {
      action: 'propose',
      targetFile: 'main.ts',
      requestId: 'request-1',
      expected: { manifestRevision: 'manifest' },
      pressure: 'final',
      operation: { kind: 'reset-group', group: 'default' },
    });
    expect(JSON.stringify(rejected.content)).toContain('DISCONNECTED');
    actor.stop();
    expect(open).toHaveBeenCalledWith(workspaceRoot, 'main.ts');
  });

  it('reads and writes inside the workspace root through the canonical RPCs', async () => {
    const workspaceRoot = await makeWorkspace();
    const registry = createHostToolRegistry({ workspaceRoot });

    const read = await invoke(registry, 'read_file', { targetFile: 'main.ts' });
    expect(read.isError).toBe(false);
    expect(JSON.stringify(read.content)).toContain('export const main');

    const created = await invoke(registry, 'create_file', { targetFile: 'notes.md', content: '# notes\n' });
    expect(created.isError).toBe(false);
    expect(await readFile(join(workspaceRoot, 'notes.md'), 'utf8')).toBe('# notes\n');
  });

  it('drops a rooted registry once the checkout it served is released', async () => {
    const projectRoot = await makeWorkspace();
    const [first, second] = [await makeWorkspace(), await makeWorkspace()];
    /* The map `withTurnRevisions` publishes: an entry per admitted run, deleted
       when the turn settles and its tree is destroyed. Every turn mints a new
       checkout, so the memo has to be bounded by this map or it holds one
       registry — every tool's compiled JSON Schema — per turn, forever. */
    const checkouts = new Map<string, { readonly cwd: string }>();
    const built = vi.spyOn(agentToolsRegistry, 'createChatToolRegistry');
    try {
      const registry = createHostToolRegistry({ workspaceRoot: projectRoot, checkouts });
      const live = built.mock.calls.length;

      const readIn = async (runId: string): Promise<unknown> =>
        registry.invoke({
          toolCallId: `call-${runId}`,
          toolName: 'read_file',
          input: { targetFile: 'main.ts' },
          runId,
          signal: new AbortController().signal,
        });

      checkouts.set('run-1', { cwd: first });
      await readIn('run-1');
      expect(built.mock.calls.length).toBe(live + 1);

      /* The turn settles, its tree is destroyed, and the next turn works in a
         checkout of its own — the moment the memo would grow is the moment the
         released root is dropped from it. */
      checkouts.delete('run-1');
      checkouts.set('run-2', { cwd: second });
      await readIn('run-2');
      expect(built.mock.calls.length).toBe(live + 2);

      // Nothing kept the first root's registry: serving it again builds it again.
      checkouts.delete('run-2');
      checkouts.set('run-3', { cwd: first });
      await readIn('run-3');
      expect(built.mock.calls.length).toBe(live + 3);
    } finally {
      built.mockRestore();
    }
  });

  it('binds candidate arrangement records to the live root and keeps other record writes in the checkout', async () => {
    const workspaceRoot = await makeWorkspace();
    const candidateRoot = await makeWorkspace();
    const checkouts = new Map([['run-1', { cwd: candidateRoot }]]);
    const built = vi.spyOn(agentToolsRegistry, 'createChatToolRegistry');
    try {
      const registry = createHostToolRegistry({ workspaceRoot, checkouts });
      await registry.invoke({
        toolCallId: 'candidate-read',
        toolName: 'read_file',
        input: { targetFile: 'main.ts' },
        runId: 'run-1',
        signal: new AbortController().signal,
      });
      const { 0: candidateOptions } = built.mock.calls.at(-1) ?? [];
      expect(candidateOptions?.workbenchFileSystemFor).toBeDefined();
      const { signal } = new AbortController();
      await candidateOptions!.workbenchFileSystemFor!(signal).writeFileChecked({
        path: '.tau/workbench/layout.json',
        data: '{}',
        preconditions: [{ path: '.tau/workbench/layout.json', expected: null }],
      });
      await candidateOptions!.recordFileSystemFor!(signal).writeFile('.tau/chats/chat-test/todo.yaml', 'tasks: []\n');
      expect(await readFile(join(workspaceRoot, '.tau/workbench/layout.json'), 'utf8')).toBe('{}');
      expect(await readFile(join(candidateRoot, '.tau/chats/chat-test/todo.yaml'), 'utf8')).toBe('tasks: []\n');
      await expect(readFile(join(candidateRoot, '.tau/workbench/layout.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      built.mockRestore();
    }
  });

  it('should keep two rooted registries isolated through file, root observation, runtime export and GeoSpec wiring', async () => {
    const alphaRoot = await makeWorkspace();
    const betaRoot = await makeWorkspace();
    await writeFile(join(alphaRoot, 'main.ts'), 'export const root = "alpha";\n', 'utf8');
    await writeFile(join(betaRoot, 'main.ts'), 'export const root = "beta";\n', 'utf8');
    await writeFile(join(alphaRoot, 'model.geospec.ts'), 'export const root = "alpha";\n', 'utf8');
    await writeFile(join(betaRoot, 'model.geospec.ts'), 'export const root = "beta";\n', 'utf8');

    const alphaEvents: Array<{ readonly type: string; readonly path?: string }> = [];
    const betaEvents: Array<{ readonly type: string; readonly path?: string }> = [];
    const stopAlpha = await new NodeFsProvider(alphaRoot).watch({ paths: ['main.ts'] }, (event) =>
      alphaEvents.push(event),
    );
    const stopBeta = await new NodeFsProvider(betaRoot).watch({ paths: ['main.ts'] }, (event) =>
      betaEvents.push(event),
    );
    const opened = new Map<string, RuntimeDocument[]>();
    const runtimeFor = (root: string, label: string): HostRuntimeClient =>
      fakeRuntime({
        open: vi.fn<HostRuntimeClient['open']>(({ source }) => {
          if (source.path === undefined) {
            throw new TypeError('Expected a source path');
          }
          const sourcePath = source.path;
          const document = fakeDocument({
            export: vi.fn<RuntimeDocument['export']>(async (format) => ({
              success: true,
              exportId: format,
              evaluationId: `${label}:evaluation`,
              issues: [],
              files: [
                {
                  name: `model.${format}`,
                  mimeType: 'model/stl',
                  bytes: new TextEncoder().encode(await readFile(join(root, sourcePath), 'utf8')),
                },
              ],
            })),
          });
          opened.set(label, [...(opened.get(label) ?? []), document]);
          return document;
        }),
      });
    const alphaRuntime = runtimeFor(alphaRoot, 'alpha');
    const betaRuntime = runtimeFor(betaRoot, 'beta');
    const geospecFor = (label: string) => {
      const run = vi.fn<GeoSpecRunner['run']>(async ({ files = [] }) => ({
        success: true,
        passed: 1,
        failed: 0,
        selectedTests: 1,
        files: files.map(
          (file) =>
            ({
              file,
              result: {
                success: true,
                passed: true,
                issues: [],
                bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
                tests: [{ suite: [label], name: 'rooted', status: 'passed', assertions: [], diagnostics: [] }],
              },
            }) as const,
        ),
      }));
      const close = vi.fn(async () => undefined);
      const runner: GeoSpecRunner = { run, on: () => () => undefined, abort: () => undefined, close };
      return { runner, run };
    };
    const alphaGeoSpec = geospecFor('alpha');
    const betaGeoSpec = geospecFor('beta');
    const alpha = createHostToolRegistry({
      workspaceRoot: alphaRoot,
      runtimeClient: async () => alphaRuntime,
      geospecRunner: async () => alphaGeoSpec.runner,
    });
    const beta = createHostToolRegistry({
      workspaceRoot: betaRoot,
      runtimeClient: async () => betaRuntime,
      geospecRunner: async () => betaGeoSpec.runner,
    });

    try {
      await invoke(alpha, 'create_file', { targetFile: 'scratch.ts', content: 'alpha scratch\n' });
      await invoke(beta, 'create_file', { targetFile: 'scratch.ts', content: 'beta scratch\n' });
      await invoke(alpha, 'edit_file', {
        targetFile: 'main.ts',
        oldString: '"alpha"',
        newString: '"alpha-edited"',
      });
      await invoke(beta, 'edit_file', { targetFile: 'main.ts', oldString: '"beta"', newString: '"beta-edited"' });
      await Promise.all([waitForFileEvent(alphaEvents, 'main.ts'), waitForFileEvent(betaEvents, 'main.ts')]);

      const alphaRead = await invoke(alpha, 'read_file', { targetFile: 'main.ts' });
      const betaRead = await invoke(beta, 'read_file', { targetFile: 'main.ts' });
      expect(JSON.stringify(alphaRead.content)).toContain('alpha-edited');
      expect(JSON.stringify(betaRead.content)).toContain('beta-edited');
      await invoke(alpha, 'delete_file', { targetFile: 'scratch.ts' });
      await expect(readFile(join(alphaRoot, 'scratch.ts'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(join(betaRoot, 'scratch.ts'), 'utf8')).toBe('beta scratch\n');
      const outsideRead = await invoke(alpha, 'read_file', { targetFile: '../main.ts' });
      expect(outsideRead.isError).toBe(true);

      await Promise.all([
        invoke(alpha, 'evaluate_model', { targetFile: 'main.ts' }),
        invoke(beta, 'evaluate_model', { targetFile: 'main.ts' }),
      ]);
      const [alphaExport, betaExport, alphaSpec, betaSpec] = await Promise.all([
        invoke(alpha, 'export_model', { targetFile: 'main.ts', to: 'stl' }),
        invoke(beta, 'export_model', { targetFile: 'main.ts', to: 'stl' }),
        invoke(alpha, 'test_model', { files: ['model.geospec.ts'] }),
        invoke(beta, 'test_model', { files: ['model.geospec.ts'] }),
      ]);
      const artifactPath = '.tau/artifacts/call-1__main.ts-stl/model.stl';
      expect(alphaExport).toMatchObject({
        isError: false,
        content: { success: true, to: 'stl', files: [{ name: 'model.stl', artifactPath }] },
      });
      expect(betaExport).toMatchObject({
        isError: false,
        content: { success: true, to: 'stl', files: [{ name: 'model.stl', artifactPath }] },
      });
      const alphaArtifact = await invoke(alpha, 'read_file', { targetFile: artifactPath });
      const betaArtifact = await invoke(beta, 'read_file', { targetFile: artifactPath });
      expect(JSON.stringify(alphaArtifact.content)).toContain('alpha-edited');
      expect(JSON.stringify(betaArtifact.content)).toContain('beta-edited');
      await invoke(alpha, 'edit_file', {
        targetFile: 'main.ts',
        oldString: 'alpha-edited',
        newString: 'alpha-export-2',
      });
      const alphaExport2 = await alpha.invoke({
        toolCallId: 'call-2',
        toolName: 'export_model',
        input: { targetFile: 'main.ts', to: 'stl' },
        signal: new AbortController().signal,
      });
      const artifactPath2 = '.tau/artifacts/call-2__main.ts-stl/model.stl';
      expect(alphaExport2).toMatchObject({
        isError: false,
        content: { success: true, files: [{ artifactPath: artifactPath2 }] },
      });
      const alphaArtifact1AfterExport2 = await invoke(alpha, 'read_file', { targetFile: artifactPath });
      const alphaArtifact2 = await invoke(alpha, 'read_file', { targetFile: artifactPath2 });
      expect(JSON.stringify(alphaArtifact1AfterExport2.content)).toContain('alpha-edited');
      expect(JSON.stringify(alphaArtifact2.content)).toContain('alpha-export-2');
      expect(alphaSpec.content).toMatchObject({
        success: true,
        passed: 1,
        passes: [{ requirement: 'alpha > rooted', targetFile: 'model.geospec.ts' }],
      });
      expect(betaSpec.content).toMatchObject({
        success: true,
        passed: 1,
        passes: [{ requirement: 'beta > rooted', targetFile: 'model.geospec.ts' }],
      });
      expect(alphaRuntime.open).toHaveBeenCalledWith(expect.objectContaining({ source: { path: 'main.ts' } }));
      expect(betaRuntime.open).toHaveBeenCalledWith(expect.objectContaining({ source: { path: 'main.ts' } }));
      expect(
        opened.get('alpha')?.some((document) => vi.mocked(document.export).mock.calls.some(([to]) => to === 'stl')),
      ).toBe(true);
      expect(
        opened.get('beta')?.some((document) => vi.mocked(document.export).mock.calls.some(([to]) => to === 'stl')),
      ).toBe(true);
      expect(alphaGeoSpec.run).toHaveBeenCalledWith({ files: ['model.geospec.ts'] });
      expect(betaGeoSpec.run).toHaveBeenCalledWith({ files: ['model.geospec.ts'] });

      const cancelled = new AbortController();
      cancelled.abort();
      await expect(
        alpha.invoke({
          toolCallId: 'cancelled-alpha',
          toolName: 'edit_file',
          input: { targetFile: 'main.ts', oldString: 'alpha-export-2', newString: 'wrong' },
          signal: cancelled.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      const alphaAfterCancellation = await invoke(alpha, 'read_file', { targetFile: 'main.ts' });
      const betaAfterCancellation = await invoke(beta, 'read_file', { targetFile: 'main.ts' });
      expect(JSON.stringify(alphaAfterCancellation.content)).toContain('alpha-export-2');
      expect(JSON.stringify(betaAfterCancellation.content)).toContain('beta-edited');
    } finally {
      stopAlpha();
      stopBeta();
    }
  });

  it('captures one isometric image and six canonical views as data URLs', async () => {
    const runtime = fakeRuntime();
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => runtime,
    });

    const single = await invoke(registry, 'screenshot', { targetFile: 'main.ts', mode: 'single' });
    expect(single.isError).toBe(false);
    expect(JSON.stringify(single.content)).toContain('data:image/webp;base64,');

    const batchRuntime = fakeRuntime({
      transcode: vi.fn<HostRuntimeClient['transcode']>(async () => ({
        success: true,
        data: ['front', 'back', 'right', 'left', 'top', 'bottom'].map((name) => webpFile(`render-${name}.webp`)),
        issues: [],
      })),
    });
    const batchRegistry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => batchRuntime,
    });
    const batch = await invoke(batchRegistry, 'screenshot', { targetFile: 'main.ts', mode: 'multi_angle' });
    expect(batch.isError).toBe(false);
    expect(JSON.stringify(batch.content)).toContain('"view":"model","angle":"bottom"');

    /* `toPiToolContent` is the one seam both placements record
     * through, so a daemon capture reaches the model as image blocks too,
     * never as base64 text. */
    const piContent = toPiToolContent(batch.content);
    expect(piContent).toHaveLength(7);
    expect(piContent[0]?.type).toBe('text');
    expect(piContent.filter((block) => block.type === 'image')).toHaveLength(6);
    expect(JSON.stringify(piContent)).not.toContain('data:image/webp;base64,');
  });

  it('uses the evaluated SVG coordinate unit and keeps unitless capture free of a fabricated physical scale', async () => {
    let svgRendering: Rendering = {
      success: true,
      requestId: 'drawing-render',
      evaluationId: 'drawing-evaluation',
      transient: false,
      view: 'drawing',
      artifact: {
        mimeType: 'image/svg+xml',
        content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
        units: { length: 'cm' },
      },
      hash: 'drawing',
      issues: [],
    };
    const svgEvaluation: Evaluation = {
      id: 'drawing-evaluation',
      success: true,
      transient: false,
      views: [{ id: 'drawing', title: 'Drawing', mimeType: 'image/svg+xml' }],
      exports: [],
      issues: [],
    };
    const document = fakeDocument({
      evaluation: vi.fn(async (): Promise<UpdateOutcome> => ({ superseded: false, evaluation: svgEvaluation })),
      rendering: () => svgRendering,
    });
    const transcode = vi.fn<HostRuntimeClient['transcode']>(async () => ({
      success: true,
      issues: [],
      data: [{ name: 'drawing.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }],
    }));
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => fakeRuntime({ open: vi.fn(() => document), transcode }),
    });

    const result = await invoke(registry, 'screenshot', { targetFile: 'drawing.ts', mode: 'single' });
    expect(result.isError).toBe(false);
    expect(transcode.mock.calls[0]?.[0]).toMatchObject({
      from: 'svg',
      to: 'png',
      options: { lengthSymbol: 'cm', axes: false, scaleBar: true },
    });

    svgRendering = {
      ...svgRendering,
      artifact: { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
      hash: 'unqualified',
    };
    const unqualified = await invoke(registry, 'screenshot', { targetFile: 'drawing.ts', mode: 'multi_angle' });
    expect(unqualified.isError).toBe(false);
    expect(unqualified.content).toMatchObject({ success: true, images: [{ view: 'drawing' }] });
    expect(JSON.stringify(unqualified.content)).not.toContain('"angle"');
    expect(transcode).toHaveBeenCalledTimes(2);
    expect(transcode.mock.calls[1]?.[0]).toMatchObject({
      from: 'svg',
      to: 'png',
      options: { axes: false, scaleBar: false },
    });
    expect(transcode.mock.calls[1]?.[0].options).not.toHaveProperty('lengthSymbol');
  });

  it('does not start cancelled CAD work after shared lazy acquisition and preserves a sibling request', async () => {
    const entered = Promise.withResolvers<void>();
    const acquired = Promise.withResolvers<HostRuntimeClient>();
    const runtime = fakeRuntime();
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => {
        entered.resolve();
        return acquired.promise;
      },
    });
    const controller = new AbortController();
    const cancelled = registry.invoke({
      toolCallId: 'cancelled',
      toolName: 'evaluate_model',
      input: { targetFile: 'cancelled.ts' },
      signal: controller.signal,
    });
    await entered.promise;
    const cancelledResult = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancelledResult;

    const siblingController = new AbortController();
    const sibling = registry.invoke({
      toolCallId: 'sibling',
      toolName: 'evaluate_model',
      input: { targetFile: 'sibling.ts' },
      signal: siblingController.signal,
    });
    acquired.resolve(runtime);
    const siblingResult = await sibling;
    expect(siblingResult.isError).toBe(false);
    expect(runtime.open).toHaveBeenCalledTimes(1);
    expect(runtime.open).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { path: 'sibling.ts' },
        signal: siblingController.signal,
      }),
    );
  });

  it('passes capture cancellation to the runtime transcode without closing the shared client', async () => {
    const entered = Promise.withResolvers<AbortSignal | undefined>();
    const finish = Promise.withResolvers<Awaited<ReturnType<HostRuntimeClient['transcode']>>>();
    const transcode = vi.fn<HostRuntimeClient['transcode']>(async ({ signal }) => {
      entered.resolve(signal);
      return finish.promise;
    });
    const runtime = fakeRuntime({ transcode });
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => runtime,
    });
    const controller = new AbortController();
    const capture = registry.invoke({
      toolCallId: 'capture',
      toolName: 'screenshot',
      input: { targetFile: 'main.ts', mode: 'single' },
      signal: controller.signal,
    });
    expect(await entered.promise).toBe(controller.signal);
    const cancelledResult = expect(capture).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancelledResult;
    finish.resolve({ success: true, issues: [], data: [webpFile('render.webp')] });
    const siblingResult = await invoke(registry, 'evaluate_model', { targetFile: 'sibling.ts' });
    expect(siblingResult.isError).toBe(false);
  });

  it('refuses an image capture when the selected image provider rejects the exact edge', async () => {
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () =>
        fakeRuntime({
          transcode: vi.fn<HostRuntimeClient['transcode']>(async () => ({
            success: false,
            issues: [{ code: 'RUNTIME', type: 'runtime', severity: 'error', message: 'No glb to webp route' }],
          })),
        }),
    });

    const result = await invoke(registry, 'screenshot', { targetFile: 'main.ts', mode: 'single' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('No glb to webp route');
  });

  it.each(['parse: accessor 2 count 4545948 exceeds 4000000', 'parse: declared accessor values exceed 8000000'])(
    'names the renderer accessor guard as an over-limit capture: %s',
    async (message) => {
      const registry = createHostToolRegistry({
        workspaceRoot: await makeWorkspace(),
        runtimeClient: async () =>
          fakeRuntime({
            transcode: vi.fn<HostRuntimeClient['transcode']>(async () => ({
              success: false,
              issues: [
                {
                  code: 'RUNTIME',
                  type: 'runtime',
                  severity: 'error',
                  message,
                  details: { type: 'render', code: 'parse' },
                },
              ],
            })),
          }),
      });

      const result = await invoke(registry, 'screenshot', { targetFile: 'main.ts', mode: 'single' });
      expect(result.content).toMatchObject({ success: false, errorCode: 'RESULT_TOO_LARGE' });
      expect(JSON.stringify(result.content)).toContain(message);
    },
  );

  /*
   * The G4 live proof answered six `evaluate_model` calls and one
   * `screenshot` with `{"errorCode":"IO_ERROR","message":"Runtime render
   * failed"}` while the daemon's own log named the cause — an engine module
   * that would not load. `IO_ERROR` on a file the model had just written reads
   * as "your geometry is wrong"; the model's narration was right and the tool's
   * report was not. Every throw out of the runtime client is *this host's*
   * failure — a geometry error returns `{ success: true, status: 'error' }`
   * with its issues — so the reason travels verbatim and names the host.
   */
  it('reports a host runtime that cannot start as its own failure, carrying the reason', async () => {
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => {
        throw Object.assign(
          new Error(
            "This Tau Host has no runtime attached: Tau Host runtime child failed: The requested module 'libassimp' does not provide an export named 'assimpEngineSha'",
          ),
          { code: 'RUNTIME_UNAVAILABLE' },
        );
      },
    });

    for (const [toolName, input] of [
      ['evaluate_model', { targetFile: 'main.ts' }],
      ['screenshot', { targetFile: 'main.ts', mode: 'single' }],
      ['export_model', { targetFile: 'main.ts', to: 'glb' }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- three tools share one assertion, in order.
      const result = await invoke(registry, toolName, input);
      expect(result.isError).toBe(true);
      expect(result.content).toMatchObject({ success: false, errorCode: 'UNKNOWN' });
      expect(JSON.stringify(result.content)).toContain('assimpEngineSha');
      expect(JSON.stringify(result.content)).toContain('has no runtime attached');
    }
  });

  it('reports a detail-free render failure as this host failing, never as an error on the file', async () => {
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () =>
        fakeRuntime({
          open: vi.fn(() => {
            /* The runtime's own fallback for a worker `error` state that carried
             * no diagnostic (`runtime-client-core.ts`). */
            throw new Error('Runtime render failed');
          }),
        }),
    });

    const result = await invoke(registry, 'evaluate_model', { targetFile: 'main.ts' });
    expect(result.isError).toBe(true);
    expect(result.content).toMatchObject({ success: false, errorCode: 'UNKNOWN' });
    expect(JSON.stringify(result.content)).toContain('Tau Host');
    expect(JSON.stringify(result.content)).toContain('main.ts');
    expect(JSON.stringify(result.content)).toContain('Runtime render failed');
  });

  it('answers an unknown tool with a typed refusal rather than a throw', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    const result = await invoke(registry, 'no_such_tool', {});
    expect(result).toMatchObject({ isError: true, content: { errorCode: 'TOOL_NOT_FOUND' } });
  });
});

/**
 * The real thing, end to end: the engine's Node runner, the esbuild VM, and a
 * Tau runtime booted in this process to export the model. Skipped by default
 * because it compiles a CAD kernel — run it with `TAU_GEOSPEC_INTEGRATION=1`
 * when the daemon's `test_model` cost needs re-measuring.
 */
const geospecIntegrationTest = process.env['TAU_GEOSPEC_INTEGRATION'] === '1' ? it : it.skip;

describe('daemon test_model against the real GeoSpec engine', () => {
  geospecIntegrationTest(
    'verifies an OpenSCAD cube and reports its cold and warm cost',
    async () => {
      const workspaceRoot = await makeWorkspace();
      await writeFile(
        join(workspaceRoot, 'main.ts'),
        `import { primitives } from '@jscad/modeling';

         export default function main() {
           return primitives.cuboid({ size: [10, 10, 10] });
         }
        `,
        'utf8',
      );
      await writeFile(
        join(workspaceRoot, 'cube.geospec.ts'),
        `import { describe, expectGeo, it } from 'geospec';
         import { loadModel } from 'geospec/model';

         describe('cube', () => {
           it('is a watertight 10 mm cube', async () => {
             const model = await loadModel({ file: 'main.ts', format: 'glb' });
             expectGeo(model).toBeWatertight();
             expectGeo(model).toHaveVolume({ value: 1000, tolerance: 1 });
           });
         });
        `,
        'utf8',
      );
      const registry = createHostToolRegistry({ workspaceRoot });

      const coldStartedAt = performance.now();
      const cold = await invoke(registry, 'test_model', {});
      /** Milliseconds. */
      const coldDuration = performance.now() - coldStartedAt;
      const warmStartedAt = performance.now();
      const warm = await invoke(registry, 'test_model', {});
      /** Milliseconds. */
      const warmDuration = performance.now() - warmStartedAt;

      /* The warm number is an evidence-cache hit on identical inputs; an agent
       * that edited the model between calls pays the cold cost again. */
      // oxlint-disable-next-line no-console -- the measurement is this test's only output.
      console.log(`test_model cold ${coldDuration.toFixed(0)} ms, warm ${warmDuration.toFixed(0)} ms`);
      expect(cold.isError).toBe(false);
      expect(warm.isError).toBe(false);
      expect(cold.content).toMatchObject({ success: true, passed: 1, total: 1 });
      expect(warm.content).toMatchObject({ success: true, passed: 1, total: 1 });
    },
    600_000,
  );
});
