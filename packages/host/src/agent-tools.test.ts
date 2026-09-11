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
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { toPiToolContent } from '@taucad/agent-host';
import type { JsonValue } from '@taucad/agent-host';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import type { HashedGeometryResult } from '@taucad/runtime/types';

import * as agentToolsRegistry from '@taucad/agent-tools/registry';
import type { SystemSkillBundle } from '@taucad/agent-tools/registry';

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

const fakeRuntime = (overrides: Partial<HostRuntimeClient> = {}): HostRuntimeClient => {
  const content = glb();
  const base: HostRuntimeClient = {
    evaluate: vi.fn(
      async (): Promise<HashedGeometryResult> => ({
        success: true,
        data: { format: 'gltf', content, hash: 'geometry' },
        issues: [],
      }),
    ),
    export: vi.fn<HostRuntimeClient['export']>(async () => ({
      success: true,
      data: [webpFile('render.webp')],
      issues: [],
    })),
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

    const authored = await invoke(registry, 'create_file', { targetFile: '.tau/chats-notes.md', content: 'ok\n' });
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

  it('should keep two rooted registries isolated through file, root observation, runtime export and GeoSpec wiring', async () => {
    const alphaRoot = await makeWorkspace();
    const betaRoot = await makeWorkspace();
    await writeFile(join(alphaRoot, 'main.ts'), 'export const root = "alpha";\n', 'utf8');
    await writeFile(join(betaRoot, 'main.ts'), 'export const root = "beta";\n', 'utf8');
    await writeFile(join(alphaRoot, 'model.geospec.ts'), 'export const root = "alpha";\n', 'utf8');
    await writeFile(join(betaRoot, 'model.geospec.ts'), 'export const root = "beta";\n', 'utf8');

    const alphaEvents: Array<{ readonly type: string; readonly path?: string }> = [];
    const betaEvents: Array<{ readonly type: string; readonly path?: string }> = [];
    const stopAlpha = new NodeFsProvider(alphaRoot).watch({ paths: ['main.ts'] }, (event) => alphaEvents.push(event));
    const stopBeta = new NodeFsProvider(betaRoot).watch({ paths: ['main.ts'] }, (event) => betaEvents.push(event));
    const runtimeFor = (root: string, label: string): HostRuntimeClient =>
      fakeRuntime({
        evaluate: vi.fn<HostRuntimeClient['evaluate']>(async ({ source }) => {
          if (source.path === undefined) {
            throw new TypeError('Expected a source path');
          }
          return {
            success: true,
            issues: [],
            data: {
              format: 'gltf',
              content: glb(),
              hash: `${label}:${await readFile(join(root, source.path), 'utf8')}`,
            },
          };
        }),
        export: vi.fn<HostRuntimeClient['export']>(async (format, options) => {
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsgo's spec config keeps source optional.
          const sourcePath = options?.source?.path;
          if (sourcePath === undefined) {
            throw new TypeError('Expected export source options');
          }
          return {
            success: true,
            issues: [],
            data: [
              {
                name: `model.${format}`,
                mimeType: 'model/stl',
                bytes: new TextEncoder().encode(await readFile(join(root, sourcePath), 'utf8')),
              },
            ],
          };
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
        invoke(alpha, 'get_kernel_result', { targetFile: 'main.ts' }),
        invoke(beta, 'get_kernel_result', { targetFile: 'main.ts' }),
      ]);
      const [alphaExport, betaExport, alphaSpec, betaSpec] = await Promise.all([
        invoke(alpha, 'export_geometry', { targetFile: 'main.ts', format: 'stl' }),
        invoke(beta, 'export_geometry', { targetFile: 'main.ts', format: 'stl' }),
        invoke(alpha, 'test_model', { files: ['model.geospec.ts'] }),
        invoke(beta, 'test_model', { files: ['model.geospec.ts'] }),
      ]);
      const artifactPath = '.tau/artifacts/call-1__main.ts-stl/model.stl';
      expect(alphaExport).toMatchObject({
        isError: false,
        content: { success: true, format: 'stl', files: [{ name: 'model.stl', artifactPath }] },
      });
      expect(betaExport).toMatchObject({
        isError: false,
        content: { success: true, format: 'stl', files: [{ name: 'model.stl', artifactPath }] },
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
        toolName: 'export_geometry',
        input: { targetFile: 'main.ts', format: 'stl' },
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
      expect(alphaRuntime.evaluate).toHaveBeenCalledWith(expect.objectContaining({ source: { path: 'main.ts' } }));
      expect(betaRuntime.evaluate).toHaveBeenCalledWith(expect.objectContaining({ source: { path: 'main.ts' } }));
      expect(alphaRuntime.export).toHaveBeenCalledWith('stl', expect.objectContaining({ source: { path: 'main.ts' } }));
      expect(betaRuntime.export).toHaveBeenCalledWith('stl', expect.objectContaining({ source: { path: 'main.ts' } }));
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
    expect(JSON.stringify(batch.content)).toContain('"view":"bottom"');

    /* `toPiToolContent` is the one seam both placements record
     * through, so a daemon capture reaches the model as image blocks too,
     * never as base64 text. */
    const piContent = toPiToolContent(batch.content);
    expect(piContent).toHaveLength(7);
    expect(piContent[0]?.type).toBe('text');
    expect(piContent.filter((block) => block.type === 'image')).toHaveLength(6);
    expect(JSON.stringify(piContent)).not.toContain('data:image/webp;base64,');
  });

  it('uses the evaluated SVG coordinate unit without host configuration and refuses unknown scale', async () => {
    const evaluate = vi.fn<HostRuntimeClient['evaluate']>(async () => ({
      success: true,
      issues: [],
      data: { format: 'svg', content: '<svg viewBox="0 0 10 10"/>', hash: 'drawing', units: { length: 'cm' } },
    }));
    const transcode = vi.fn<HostRuntimeClient['transcode']>(async () => ({
      success: true,
      issues: [],
      data: [{ name: 'drawing.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }],
    }));
    const registry = createHostToolRegistry({
      workspaceRoot: await makeWorkspace(),
      runtimeClient: async () => fakeRuntime({ evaluate, transcode }),
    });

    const result = await invoke(registry, 'screenshot', { targetFile: 'drawing.ts', mode: 'single' });
    expect(result.isError).toBe(false);
    expect(transcode.mock.calls[0]?.[0]).toMatchObject({
      from: 'svg',
      to: 'png',
      options: { lengthSymbol: 'cm', axes: true, scaleBar: true },
    });

    evaluate.mockResolvedValue({
      success: true,
      issues: [],
      data: { format: 'svg', content: '<svg/>', hash: 'unqualified' },
    });
    const unqualified = await invoke(registry, 'screenshot', { targetFile: 'drawing.ts', mode: 'single' });
    expect(unqualified.isError).toBe(true);
    expect(JSON.stringify(unqualified.content)).toContain('artifact coordinate length unit');
    expect(transcode).toHaveBeenCalledTimes(1);
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
      toolName: 'get_kernel_result',
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
      toolName: 'get_kernel_result',
      input: { targetFile: 'sibling.ts' },
      signal: siblingController.signal,
    });
    acquired.resolve(runtime);
    const siblingResult = await sibling;
    expect(siblingResult.isError).toBe(false);
    expect(runtime.evaluate).toHaveBeenCalledTimes(1);
    expect(runtime.evaluate).toHaveBeenCalledWith(
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
    const siblingResult = await invoke(registry, 'get_kernel_result', { targetFile: 'sibling.ts' });
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
          evaluate: vi.fn(async () => {
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
