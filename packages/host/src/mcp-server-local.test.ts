/**
 * The local stdio MCP server: which project folder a call works in, where its
 * evidence lands, and what closing it leaves behind.
 *
 * Codex advertises no MCP roots and names the thread's folder in every call's
 * `_meta`; the server must work there unless the launcher pinned a project,
 * and in its default folder otherwise. Screenshots and large GeoSpec reports
 * are filed in a temporary folder, never in the project.
 */

import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { rpcName, toolName } from '@taucad/chat/constants';
import type * as TauMcp from '@taucad/mcp';
import type { TauMcpServerOptions } from '@taucad/mcp';
import type { HostToolDefinition, HostToolInvocation, HostToolResult, ToolRegistry } from '@taucad/agent-host';

import { serveLocalHostMcp } from '#mcp-server.js';
import { prepareKernelToolName } from '#prepare-kernel-tool.js';
import { testModelTool } from '#test-model-tool.fixture.js';

const served = vi.hoisted(() => ({ options: undefined as TauMcpServerOptions | undefined, closed: 0 }));

vi.mock('@taucad/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof TauMcp>()),
  serveTauMcpStdio: async (options: TauMcpServerOptions) => {
    served.options = options;
    return {
      close: async () => {
        served.closed += 1;
      },
    };
  },
}));

/**
 * Serve over a registry that answers every call with `answer`.
 *
 * @param answer - The registry's result for any invocation.
 * @param options - Default folder, whether the launcher pinned it, and what the registry lists.
 * @returns The served dispatch, the recorded invocations, the run → root map and the local server.
 */
const serve = async (
  answer: HostToolResult,
  options?: {
    readonly workspaceRoot?: string;
    readonly pinned?: boolean;
    readonly listed?: readonly HostToolDefinition[];
  },
) => {
  const invocations: HostToolInvocation[] = [];
  const registry: ToolRegistry = {
    list: () => [...(options?.listed ?? [testModelTool])],
    invoke: async (invocation) => {
      invocations.push(invocation);
      return answer;
    },
  };
  const checkouts = new Map<string, { readonly cwd: string }>();
  const local = await serveLocalHostMcp({
    workspaceRoot: options?.workspaceRoot ?? '/default',
    pinned: options?.pinned ?? false,
    registry,
    checkouts,
  });
  const dispatch = served.options?.dispatch;
  if (dispatch === undefined) {
    throw new Error('serveLocalHostMcp did not serve');
  }
  return { dispatch, invocations, checkouts, local };
};

/** `_meta` as Codex 0.157 sends it: the folder as a `file:` URL, or a raw value to test refusals. */
const codexMeta = (folder: string) => ({
  'codex/sandbox-state-meta': { sandboxCwd: folder.startsWith('/') ? pathToFileURL(folder).href : folder },
});

const evaluate = { rpcName: rpcName.evaluateModel, args: { targetFile: 'main.ts' } };
const ready: HostToolResult = { content: { success: true, status: 'ready' }, isError: false };

/** The one field of a filed attachment these tests read back from disk. */
const filedSchema = z.object({ absolutePath: z.string() });

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe('serveLocalHostMcp', () => {
  it('should list test_model only over a registry that offers it', async () => {
    const withEngine = await serve(ready);
    try {
      expect(served.options?.cadTools).toEqual([
        toolName.evaluateModel,
        toolName.testModel,
        toolName.screenshot,
        toolName.exportModel,
      ]);
    } finally {
      await withEngine.local.close();
    }

    const { local } = await serve(ready, { listed: [] });
    try {
      expect(served.options?.cadTools).toEqual([toolName.evaluateModel, toolName.screenshot, toolName.exportModel]);
    } finally {
      await local.close();
    }
  });

  it('should work in the folder a call names, else the default folder', async () => {
    const { dispatch, invocations, checkouts, local } = await serve(ready);
    try {
      await dispatch(evaluate, { toolCallId: 'a', meta: codexMeta('/thread/project') });
      await dispatch(evaluate, { toolCallId: 'b', meta: codexMeta('relative') });
      await dispatch(evaluate, { toolCallId: 'c' });

      expect(invocations.map(({ runId, toolName }) => ({ runId, toolName }))).toEqual([
        { runId: 'mcp:/thread/project', toolName: toolName.evaluateModel },
        { runId: 'mcp:/default', toolName: toolName.evaluateModel },
        { runId: 'mcp:/default', toolName: toolName.evaluateModel },
      ]);
      expect(checkouts.get('mcp:/thread/project')).toEqual({ cwd: '/thread/project' });
    } finally {
      await local.close();
    }
  });

  it('should leave a job for the person in Tau even when the client can draw a form', async () => {
    const { dispatch, invocations, local } = await serve(ready);
    try {
      const asked: string[] = [];
      await dispatch(
        { toolName: toolName.requestJob, args: { targetFile: 'plate.ts' } },
        {
          toolCallId: 'job-1',
          confirm: async ({ message }) => {
            asked.push(message);
            return 'approved';
          },
        },
      );

      expect(invocations[0]?.approve).toBeUndefined();
      expect(asked).toEqual([]);
    } finally {
      await local.close();
    }
  });

  it('should keep a pinned project even when a call names another folder', async () => {
    const { dispatch, invocations, local } = await serve(ready, { workspaceRoot: '/pinned', pinned: true });
    try {
      await dispatch(evaluate, { toolCallId: 'a', meta: codexMeta('/thread/project') });

      expect(invocations.map(({ runId }) => runId)).toEqual(['mcp:/pinned']);
    } finally {
      await local.close();
    }
  });

  it('should return screenshots inline and file evidence in a temporary folder that close removes', async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    const { dispatch, local } = await serve({
      content: { success: true, images: [{ view: 'model', angle: 'front', dataUrl }] },
      isError: false,
    });
    const { closed } = served;
    let absolutePath = '';
    try {
      expect(served.options?.screenshotImages).toBe('inline');

      const capture = await dispatch(
        { rpcName: rpcName.captureImages, args: { mode: 'multi_angle', targetFile: 'main.ts' } },
        { toolCallId: 'shot' },
      );

      const image = { view: 'model', angle: 'front', path: `attachments/${sha256}.png`, mimeType: 'image/png' };
      expect(capture).toEqual({
        success: true,
        images: [{ ...image, absolutePath: expect.any(String) as string, byteLength: 3, sha256, dataUrl }],
      });
      absolutePath = z.object({ images: z.array(filedSchema) }).parse(capture).images[0]?.absolutePath ?? '';
      expect(absolutePath.startsWith(join(tmpdir(), 'tau-mcp-'))).toBe(true);
      expect(absolutePath.endsWith(image.path)).toBe(true);
      expect(await readFile(absolutePath)).toEqual(bytes);
    } finally {
      await local.close();
    }

    expect(served.closed).toBe(closed + 1);
    expect(await exists(absolutePath)).toBe(false);
  });

  it('should file an oversized GeoSpec report in the same temporary folder', async () => {
    const verdict = {
      failures: [
        {
          id: 'main.geospec.ts:large',
          requirement: 'Large',
          reason: 'x'.repeat(140_000),
          suggestion: 'Fix',
          targetFile: 'main.ts',
        },
      ],
      passes: [],
      passed: 0,
      total: 1,
    };
    const { dispatch, local } = await serve({ content: { success: true, ...verdict }, isError: false });
    try {
      const result = await dispatch({ rpcName: rpcName.runGeoSpecTests, args: {} }, { toolCallId: 'tests' });

      expect(result).toMatchObject({
        passed: 0,
        total: 1,
        fullResult: {
          path: expect.stringMatching(/^attachments\/[\da-f]{64}\.json$/u) as string,
          mimeType: 'application/json',
        },
      });
      const { absolutePath } = z.object({ fullResult: filedSchema }).parse(result).fullResult;
      expect(absolutePath.startsWith(join(tmpdir(), 'tau-mcp-'))).toBe(true);
      expect(JSON.parse(await readFile(absolutePath, 'utf8'))).toEqual(verdict);
    } finally {
      await local.close();
    }
  });

  it('should serve the viewer only with a page, rendering a shown source through export_model', async () => {
    const { local: withoutPage } = await serve(ready);
    expect(served.options?.viewer).toBeUndefined();
    await withoutPage.close();

    const root = await mkdtemp(join(tmpdir(), 'tau-viewer-local-'));
    await writeFile(join(root, 'main.ts'), '');
    const invocations: HostToolInvocation[] = [];
    const registry: ToolRegistry = {
      list: () => [testModelTool],
      invoke: async (invocation) => {
        invocations.push(invocation);
        await mkdir(join(root, '.tau', 'artifacts'), { recursive: true });
        await writeFile(join(root, '.tau', 'artifacts', 'main.glb'), 'glb');
        return {
          content: {
            success: true,
            files: [{ artifactPath: '.tau/artifacts/main.glb', mimeType: 'model/gltf-binary' }],
          },
          isError: false,
        };
      },
    };
    const local = await serveLocalHostMcp({
      workspaceRoot: root,
      registry,
      checkouts: new Map(),
      viewerPage: { html: '<!doctype html>', sha256: 'd'.repeat(64) },
    });
    try {
      const shown = await served.options?.viewer?.show(
        { targetFile: 'main.ts' },
        { toolCallId: 'show-1', presentation: 'inline' },
      );
      expect(invocations).toEqual([
        expect.objectContaining({ toolName: 'export_model', input: { targetFile: 'main.ts', to: 'glb' } }),
      ]);
      expect(shown).toMatchObject({ model: { path: '.tau/artifacts/main.glb', sourceFile: 'main.ts' } });
    } finally {
      await local.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('should offer prepare_kernel as open-world and idempotent, and forward its progress reports to the client', async () => {
    const registry: ToolRegistry = {
      list: () => [
        { name: prepareKernelToolName, description: 'Prepare.', inputSchema: { type: 'object', properties: {} } },
      ],
      invoke: async (invocation) => {
        invocation.onUpdate?.({
          content: { progress: 10, total: 30, message: 'downloading dotnet (0/2)' },
          isError: false,
        });
        invocation.onUpdate?.({ content: { note: 'not a progress report' }, isError: false });
        invocation.onUpdate?.({ content: { progress: 30, total: 30 }, isError: false });
        return { content: { status: 'ready', kernel: 'picogk' }, isError: false };
      },
    };
    const local = await serveLocalHostMcp({ workspaceRoot: '/default', registry, checkouts: new Map() });
    try {
      const reports: unknown[] = [];
      const result = await served.options?.dispatch(
        { toolName: prepareKernelToolName, args: { kernel: 'picogk' } },
        {
          toolCallId: 'prepare-1',
          progress: async (report) => {
            reports.push(report);
          },
        },
      );

      expect(served.options?.hostTools).toEqual([
        expect.objectContaining({
          name: prepareKernelToolName,
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        }),
      ]);
      expect(reports).toEqual([
        { progress: 10, total: 30, message: 'downloading dotnet (0/2)' },
        { progress: 30, total: 30 },
      ]);
      expect(result).toEqual({ success: true, status: 'ready', kernel: 'picogk' });
    } finally {
      await local.close();
    }
  });
});
