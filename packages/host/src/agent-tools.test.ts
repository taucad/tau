/**
 * What the daemon offers the model, and what it does with it.
 *
 * The listing is load-bearing: a tool the model is told about but that cannot
 * work costs a turn and a retry, so the geometry tools appear only with a
 * runtime attached. Rendering itself is *not* browser-only — the native raster
 * backend runs under plain Node (probe:
 * `substrate/capture/nanoraster-node-probe.txt`) — so `screenshot` and
 * `export_geometry` are real capabilities here, driven through the runtime's
 * own export routes rather than a second rendering path.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { toPiToolContent } from '@taucad/agent-host';

import { createHostToolRegistry } from '#agent-tools.js';
import type { HostExportFile, HostRuntimeClient } from '#agent-tools.js';

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

const webpFile = (name: string): HostExportFile => ({
  name,
  mimeType: 'image/webp',
  bytes: new Uint8Array([1, 2, 3]),
});

const fakeRuntime = (overrides: Partial<HostRuntimeClient> = {}): HostRuntimeClient => {
  const base: HostRuntimeClient = {
    render: vi.fn(async () => ({ superseded: false, geometry: { success: true, issues: [] } })),
    export: vi.fn(
      async (): Promise<{ readonly success: true; readonly data: readonly HostExportFile[] }> => ({
        success: true,
        data: [webpFile('capture.webp')],
      }),
    ),
    capabilities: { routes: [{ targetFormat: 'webp', kernelId: 'k' }] },
    activeKernelId: 'k',
  };
  return { ...base, ...overrides };
};

const invoke = async (registry: ReturnType<typeof createHostToolRegistry>, toolName: string, input: unknown) =>
  registry.invoke({
    toolCallId: 'call-1',
    toolName,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- test input is the tool's own JSON shape.
    input: input as never,
    signal: new AbortController().signal,
  });

describe('createHostToolRegistry', () => {
  it('offers the file tools and use_skill with no runtime, and never a geometry tool it cannot serve', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    const names = registry.list().map((tool) => tool.name);

    expect(names).toContain('read_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('grep');
    /* Skills are disk, not geometry: they never depend on a runtime. */
    expect(names).toContain('use_skill');
    expect(names).not.toContain('get_kernel_result');
    expect(names).not.toContain('screenshot');
    expect(names).not.toContain('export_geometry');
  });

  it('offers test_model wherever the GeoSpec engine resolves, with no runtime attached', async () => {
    const registry = createHostToolRegistry({ workspaceRoot: await makeWorkspace() });
    expect(registry.list().map((tool) => tool.name)).toContain('test_model');
  });

  it('withholds test_model when this installation has no GeoSpec engine', async () => {
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
      geospecRunner: async () => ({ run, close }) as never,
    });

    const result = await invoke(registry, 'test_model', {});
    expect(result.isError).toBe(false);
    expect(run).toHaveBeenCalledWith({ files: ['cube.geospec.ts'] });
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result.content)).toContain('cube > is watertight');
  });

  it('resolves an authored workspace skill through use_skill', async () => {
    const workspaceRoot = await makeWorkspace();
    await withSkill(workspaceRoot, 'bracket-design', 'Bracket design rules');
    const registry = createHostToolRegistry({ workspaceRoot });

    const result = await invoke(registry, 'use_skill', { skillName: 'bracket-design' });
    expect(result.isError).toBe(false);
    expect(JSON.stringify(result.content)).toContain('Bracket design rules');
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

    expect(names).toContain('get_kernel_result');
    expect(names).toContain('screenshot');
    expect(names).toContain('export_geometry');
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
      export: vi.fn(
        async (): Promise<{ readonly success: true; readonly data: readonly HostExportFile[] }> => ({
          success: true,
          data: ['front', 'back', 'right', 'left', 'top', 'bottom'].map((name) => webpFile(`${name}.webp`)),
        }),
      ),
    });
    const batchRegistry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => batchRuntime,
    });
    const batch = await invoke(batchRegistry, 'screenshot', { targetFile: 'main.ts', mode: 'multi_angle' });
    expect(batch.isError).toBe(false);
    expect(JSON.stringify(batch.content)).toContain('"view":"bottom"');

    /* The daemon has its own encoder (`Buffer`) but not its own tool-result
     * mapping: `toPiToolContent` is the one seam both placements record
     * through, so a daemon capture reaches the model as image blocks too,
     * never as base64 text. */
    const piContent = toPiToolContent(batch.content);
    expect(piContent).toHaveLength(7);
    expect(piContent[0]?.type).toBe('text');
    expect(piContent.filter((block) => block.type === 'image')).toHaveLength(6);
    expect(JSON.stringify(piContent)).not.toContain('data:image/webp;base64,');
  });

  it('refuses an image capture the active kernel has no route for', async () => {
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => fakeRuntime({ capabilities: { routes: [{ targetFormat: 'glb', kernelId: 'k' }] } }),
    });

    const result = await invoke(registry, 'screenshot', { targetFile: 'main.ts', mode: 'single' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('cannot capture');
  });

  /*
   * The G4 live proof answered six `get_kernel_result` calls and one
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
      ['get_kernel_result', { targetFile: 'main.ts' }],
      ['screenshot', { targetFile: 'main.ts', mode: 'single' }],
      ['export_geometry', { targetFile: 'main.ts', format: 'glb' }],
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
          render: vi.fn(async () => {
            /* The runtime's own fallback for a worker `error` state that carried
             * no diagnostic (`runtime-client-core.ts`). */
            throw new Error('Runtime render failed');
          }),
        }),
    });

    const result = await invoke(registry, 'get_kernel_result', { targetFile: 'main.ts' });
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
