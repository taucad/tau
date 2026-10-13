/**
 * `tau mcp` the way a Codex or Claude Code plugin runs it: a child process
 * speaking MCP over stdio, driven by the SDK client Claude Code embeds.
 *
 * One server serves the scenario, so its kernels boot once. Its default
 * project is `CLAUDE_PROJECT_DIR`, while its working directory is the
 * repository; a second project that only Codex's per-call `_meta` names proves
 * calls route by folder. Every byte the server writes to stdout is kept and
 * must parse as JSON-RPC, and every module it resolves is logged, so the test
 * can see that no kernel loads before `initialize`.
 */

import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, ElicitRequestSchema, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { openSharedMachineHost } from '@taucad/host';
import { connectMachineChannel } from '@taucad/runtime/machine';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
const binPath = resolvePath(
  repoRoot,
  process.env['TAU_E2E_CLI_BUILT'] === 'true' ? 'packages/cli/dist/bin/tau.mjs' : 'packages/cli/src/bin.ts',
);

/** Milliseconds a cold kernel boot plus one model may take under tsx on a loaded machine. */
const kernelCallLimit = 300_000;

/** A kernel module, by the `<name>.kernel.ts` file name every runtime kernel carries. */
const kernelModule = /\/[^/]+\.kernel\.(?:ts|mjs|js)$/u;

/** A loader hook that appends each module URL the server resolves to `TAU_TEST_RESOLVE_LOG`. */
const resolveLogHook = `import { appendFileSync } from 'node:fs';
export const resolve = async (specifier, context, next) => {
  const resolved = await next(specifier, context);
  appendFileSync(process.env.TAU_TEST_RESOLVE_LOG, resolved.url + '\\n');
  return resolved;
};
`;

/** What the noisy model prints from its kernel's thread; never JSON-RPC. */
const noiseMarker = 'tau-mcp-model-console-noise';

/** What the loud model prints after more output than a pipe holds. */
const loudTailMarker = 'tau-mcp-model-console-tail';

const files = {
  block: {
    'main.ts': `import { drawRectangle } from 'replicad';

export default function main() {
  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);
}
`,
    'main.geospec.ts': `import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('20 x 10 x 4 mm block', () => {
  it('has the specified size', async () => {
    const model = await loadModel({ file: 'main.ts', format: 'step' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 20, y: 10, z: 4 }, tolerance: 0.001 });
  });
});
`,
    'noisy.ts': `import { drawRectangle } from 'replicad';

export default function main() {
  console.log('${noiseMarker}');
  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);
}
`,
    'loud.ts': `import { drawRectangle } from 'replicad';

export default function main() {
  console.log('x'.repeat(1024 * 1024));
  console.log('${loudTailMarker}');
  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);
}
`,
    'broken.ts': `import { drawRectangle } from 'replicad';

export default function main() {
  drawRectangle(20, 10);
  throw new Error('fixture kernel failure');
}
`,
  },
  lid: {
    'lid.ts': `import { drawCircle } from 'replicad';

export default function main() {
  return drawCircle(5).sketchOnPlane('XY').extrude(2);
}
`,
  },
  plate: {
    'plate.ts': `import { drawRectangle } from 'replicad';

export const defaultParams = { width: 20 };

export default function main(params: typeof defaultParams) {
  return drawRectangle(params.width, 10).sketchOnPlane('XY').extrude(2);
}
`,
  },
} as const;

/**
 * Why `test_model` cannot run here, or `undefined` when it can.
 *
 * The native GeoSpec engine is an optional peer of the host, resolved from the
 * host's own package as the server resolves it; its binding is built, not
 * committed, so a checkout without it skips that step rather than failing.
 */
const nativeEngineUnavailable = await (async (): Promise<string | undefined> => {
  try {
    const resolved = createRequire(join(repoRoot, 'packages/host/package.json')).resolve(
      '@taucad/geospec-engine-native/node',
    );
    await import(pathToFileURL(resolved).href);
    return undefined;
  } catch (error) {
    return `the native GeoSpec engine does not load: ${error instanceof Error ? error.message : String(error)}`;
  }
})();

/**
 * Why `screenshot` cannot render here, or `undefined` when it can.
 *
 * The renderer is WebGPU, loaded through the image plugin's own loader as the
 * transcoder loads it; a runner with no GPU adapter and no software rasterizer
 * (GitHub's Ubuntu runners) has nothing to render with, so it skips.
 */
const rendererUnavailable = await (async (): Promise<string | undefined> => {
  try {
    const backend = pathToFileURL(join(repoRoot, 'packages/plugins/image/src/image-backend.ts')).href;
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the loader's one export, typed without a dependency on the renderer.
    const { loadImageBackend } = (await import(backend)) as {
      loadImageBackend: () => Promise<{ describeAdapter: () => Promise<unknown> }>;
    };
    const renderer = await loadImageBackend();
    const adapter = await renderer.describeAdapter();
    return adapter === undefined ? 'the WebGPU renderer finds no adapter on this host' : undefined;
  } catch (error) {
    return `the WebGPU renderer does not load: ${error instanceof Error ? error.message : String(error)}`;
  }
})();

const disposers: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const dispose of disposers.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- children are stopped before their fixtures are removed.
    await dispose();
  }
});

/** Fixtures, the loader hook and each server's module log. */
let scratch = '';

beforeAll(async () => {
  /* Not `tau-mcp-…`: that prefix is the server's own evidence folder, which a test below looks for. */
  scratch = await mkdtemp(join(tmpdir(), 'mcp-integration-'));
  disposers.push(async () => rm(scratch, { recursive: true, force: true }));
  await writeFile(join(scratch, 'resolve-log.mjs'), resolveLogHook);
  await writeFile(
    join(scratch, 'register.mjs'),
    `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(join(scratch, 'resolve-log.mjs')).href)});\n`,
  );
});

/** One `tau mcp` child and the SDK transport over its stdio. */
type Served = {
  readonly child: ChildProcessWithoutNullStreams;
  readonly transport: Transport;
  readonly exited: Promise<number | undefined>;
  readonly stdout: () => string;
  readonly stderr: () => string;
  /** Each kernel module the child has resolved so far. */
  readonly kernelModules: () => Promise<readonly string[]>;
};

let launches = 0;

/**
 * Launch `tau mcp` as a plugin host would, keeping every byte it writes.
 *
 * @param projectDirectory - The `CLAUDE_PROJECT_DIR` Claude Code would set; none, as Codex sets none.
 * @param viewerPage - The viewer page `launch.ts` hands over (`TAU_VIEWER_PAGE`), if any.
 * @param extra - Further environment (`env`), such as the printer store a test isolates, and `tau mcp` options
 *   after the command (`args`).
 * @returns The child, a transport the SDK client connects over, and its output.
 */
const launch = (
  projectDirectory?: string,
  viewerPage?: string,
  extra: { readonly env?: Record<string, string>; readonly args?: readonly string[] } = {},
): Served => {
  launches += 1;
  const resolveLog = join(scratch, `resolved-${String(launches)}.log`);
  /* Built by assignment so no environment key is a source literal. */
  const env: NodeJS.ProcessEnv = { ...process.env };
  env['TAU_TEST_RESOLVE_LOG'] = resolveLog;
  /* Without one the server starts as Codex starts it, naming no project, even when this test runs under Claude Code. */
  if (projectDirectory === undefined) {
    delete env['CLAUDE_PROJECT_DIR'];
  } else {
    env['CLAUDE_PROJECT_DIR'] = projectDirectory;
  }
  if (viewerPage !== undefined) {
    env['TAU_VIEWER_PAGE'] = viewerPage;
  }
  Object.assign(env, extra.env);
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      pathToFileURL(join(scratch, 'register.mjs')).href,
      binPath,
      'mcp',
      ...(extra.args ?? []),
    ],
    { cwd: repoRoot, env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  let unread = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<number | undefined>((resolve) => {
    child.once('exit', (code) => {
      resolve(code ?? undefined);
    });
  });
  /* Newline-delimited JSON-RPC, as the MCP stdio transport frames it. */
  const transport: Transport = {
    start: async () => {
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        unread += chunk;
        for (let end = unread.indexOf('\n'); end !== -1; end = unread.indexOf('\n')) {
          const line = unread.slice(0, end);
          unread = unread.slice(end + 1);
          try {
            transport.onmessage?.(JSONRPCMessageSchema.parse(JSON.parse(line)));
          } catch (error) {
            transport.onerror?.(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
      child.once('exit', () => {
        transport.onclose?.();
      });
    },
    send: async (message) => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    },
    /* What a host does to stop a stdio server: close its input. */
    close: async () => {
      child.stdin.end();
    },
  };
  return {
    child,
    transport,
    exited,
    stdout: () => stdout,
    stderr: () => stderr,
    kernelModules: async () => {
      const resolved = await readFile(resolveLog, 'utf8');
      return resolved.split('\n').filter((url) => kernelModule.test(url));
    },
  };
};

/**
 * Resolve once the child exits, or report how long it outlived `limit`.
 *
 * @param served - The launched server.
 * @param limit - Milliseconds to wait.
 * @returns The exit code and how long the exit took.
 */
const exitWithin = async (served: Served, limit: number) => {
  const started = performance.now();
  const code = await Promise.race([
    served.exited,
    new Promise<'running'>((resolve) => {
      setTimeout(() => {
        resolve('running');
      }, limit).unref();
    }),
  ]);
  return { code, elapsed: performance.now() - started };
};

const textOf = (result: CallToolResult): string => (result.content[0]?.type === 'text' ? result.content[0].text : '');

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/**
 * Connect the SDK client, reporting the server's stderr if it never answers.
 *
 * @param client - The SDK client.
 * @param served - The launched server.
 * @returns Milliseconds `initialize` took.
 */
const connect = async (client: Client, served: Served): Promise<number> => {
  const started = performance.now();
  try {
    await client.connect(served.transport, { timeout: kernelCallLimit });
  } catch (error) {
    throw new Error(`tau mcp did not initialize; stderr:\n${served.stderr().slice(-4000)}`, { cause: error });
  }
  return performance.now() - started;
};

const stopIfRunning = (served: Served) => async (): Promise<void> => {
  if (served.child.exitCode === null && served.child.signalCode === null) {
    served.child.kill('SIGKILL');
    await served.exited;
  }
};

describe('tau mcp over stdio', () => {
  let served: Served;
  let client: Client;
  let initializeTime = 0;
  let screenshotPath = '';

  /* The SDK's own result schema narrows the reply; its default 60 s request limit is too short for a cold kernel. */
  const call = async (params: CallToolRequest['params']): Promise<CallToolResult> =>
    CallToolResultSchema.parse(await client.callTool(params, undefined, { timeout: kernelCallLimit }));

  beforeAll(async () => {
    for (const [project, contents] of Object.entries(files)) {
      // oxlint-disable-next-line no-await-in-loop -- two tiny fixture folders.
      await mkdir(join(scratch, project));
      for (const [name, text] of Object.entries(contents)) {
        // oxlint-disable-next-line no-await-in-loop -- ditto.
        await writeFile(join(scratch, project, name), text);
      }
    }
    served = launch(join(scratch, 'block'));
    disposers.push(stopIfRunning(served));
    client = new Client({ name: 'tau-mcp-integration', version: '1' });
    initializeTime = await connect(client, served);
  }, kernelCallLimit);

  it('should answer initialize before loading any kernel', async ({ annotate }) => {
    /* Wall time is logged, not asserted: under tsx it is the transform of the host's import graph, which a shared machine's load stretches. */
    await annotate(
      `initialize answered in ${String(Math.round(initializeTime))} ms (load ${String(loadavg()[0])} on ${String(availableParallelism())} cores)`,
    );
    expect(client.getServerVersion()?.name).toBe('@taucad/mcp');
    /* Codex sends the project folder only to a server that declares this. */
    expect(client.getServerCapabilities()?.experimental).toHaveProperty(['codex/sandbox-state-meta']);

    const { tools } = await client.listTools();
    expect(tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['evaluate_model', 'test_model', 'screenshot', 'export_model']),
    );
    expect(tools.find(({ name }) => name === 'screenshot')?.outputSchema).toBeUndefined();
    expect(tools.every(({ _meta }) => _meta?.['anthropic/alwaysLoad'] === true)).toBe(true);
    /* Read after `tools/list`, so a warm-up started beside `initialize` would show by now. */
    expect(await served.kernelModules()).toEqual([]);
  });

  it(
    'should evaluate a model in CLAUDE_PROJECT_DIR rather than the working directory',
    async () => {
      const result = await call({ name: 'evaluate_model', arguments: { targetFile: 'main.ts' } });

      expect(result.isError ?? false, textOf(result)).toBe(false);
      expect(result.structuredContent).toMatchObject({ status: 'ready' });
      /* The first call loads the runtime, which proves the module log sees kernels at all. */
      expect(await served.kernelModules()).toContainEqual(expect.stringMatching(/\/replicad\.kernel\.ts$/u));
    },
    kernelCallLimit,
  );

  it(
    'should return a screenshot as an image block with its saved path and no structured content',
    async ({ skip }) => {
      skip(rendererUnavailable !== undefined, rendererUnavailable);
      const result = await call({ name: 'screenshot', arguments: { targetFile: 'main.ts' } });

      expect(result.isError ?? false, textOf(result)).toBe(false);
      expect(result.structuredContent).toBeUndefined();
      const [summary, image] = result.content;
      expect(summary).toMatchObject({ type: 'text' });
      expect(image).toMatchObject({
        type: 'image',
        mimeType: expect.stringMatching(/^image\/(?:png|webp)$/u) as string,
      });
      expect(image).toHaveProperty('data', expect.stringMatching(/^[A-Za-z0-9+/]{100,}=*$/u));
      screenshotPath =
        /: (\/\S+\/attachments\/[\da-f]{64}\.(?:png|webp)) \(\d+ bytes\)$/mu.exec(textOf(result))?.[1] ?? '';
      expect(screenshotPath.startsWith(join(tmpdir(), 'tau-mcp-'))).toBe(true);
      expect(await exists(screenshotPath)).toBe(true);
    },
    kernelCallLimit,
  );

  it(
    "should deliver a broken model's kernel message as an error result the client accepts",
    async () => {
      /* `export_model` declares an output schema: a failure carrying structured
       * content would make the SDK client throw instead of returning it. */
      const result = await call({ name: 'export_model', arguments: { targetFile: 'broken.ts', to: 'glb' } });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(textOf(result)).toContain('fixture kernel failure');
    },
    kernelCallLimit,
  );

  it(
    "should keep stdout to the protocol when a model logs from its kernel's realm",
    async () => {
      const result = await call({ name: 'evaluate_model', arguments: { targetFile: 'noisy.ts' } });

      expect(result.structuredContent).toMatchObject({ status: 'ready' });
      /* Asserted on exit below, once every forwarded write has landed. */
    },
    kernelCallLimit,
  );

  it(
    "should forward a model's output past a full pipe to stderr",
    async () => {
      const result = await call({ name: 'evaluate_model', arguments: { targetFile: 'loud.ts' } });

      expect(result.structuredContent).toMatchObject({ status: 'ready' });
      /* A megabyte overfills stderr's pipe; what follows reaches stderr only if the forwarding resumes once the
       * pipe drains. (Once esbuild has started, this process's stderr blocks instead, so this passes without it.) */
      await expect.poll(() => served.stderr().includes(loudTailMarker), { timeout: 10_000 }).toBe(true);
    },
    kernelCallLimit,
  );

  it(
    'should work in the folder Codex names with a call, and in the default folder otherwise',
    async () => {
      /* As Codex 0.157 sends it: the folder as a `file:` URL under `sandboxCwd`. */
      const meta = { 'codex/sandbox-state-meta': { sandboxCwd: pathToFileURL(join(scratch, 'lid')).href } };
      const named = await call({ name: 'evaluate_model', arguments: { targetFile: 'lid.ts' }, _meta: meta });
      const unnamed = await call({ name: 'evaluate_model', arguments: { targetFile: 'lid.ts' } });

      expect(named.structuredContent).toMatchObject({ status: 'ready' });
      expect(unnamed.structuredContent).toMatchObject({
        status: 'error',
        kernelIssues: expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining(join(scratch, 'block', 'lid.ts')) as string }),
        ]) as unknown[],
      });
    },
    kernelCallLimit,
  );

  it(
    "should read a model's parameters and write an edit to its sidecar",
    async () => {
      const meta = { 'codex/sandbox-state-meta': { sandboxCwd: pathToFileURL(join(scratch, 'plate')).href } };
      const read = await call({ name: 'get_parameters', arguments: { targetFile: 'plate.ts' }, _meta: meta });
      expect(read.isError ?? false, textOf(read)).toBe(false);
      const parameters = JSON.parse(textOf(read)) as {
        status: string;
        current?: { identity: { manifestRevision: string }; entry: { activeGroup: string } };
      };
      expect(parameters, textOf(read)).toMatchObject({
        status: 'resolved',
        current: { entry: { activeGroup: 'default' } },
      });

      const proposed = await call({
        name: 'apply_parameter_operation',
        arguments: {
          action: 'propose',
          targetFile: 'plate.ts',
          requestId: 'widen-1',
          expected: { manifestRevision: parameters.current?.identity.manifestRevision },
          pressure: 'final',
          operation: { kind: 'native-value', group: 'default', pointer: '/width', value: 30 },
        },
        _meta: meta,
      });
      expect(proposed.isError ?? false, textOf(proposed)).toBe(false);
      expect(JSON.parse(textOf(proposed))).toMatchObject({ outcome: { status: 'committed', write: 'applied' } });
      const after = await call({ name: 'get_parameters', arguments: { targetFile: 'plate.ts' }, _meta: meta });
      expect(JSON.parse(textOf(after))).toMatchObject({
        current: { entry: { groups: { default: { values: { width: 30 } } } } },
      });
      expect(await readFile(join(scratch, 'plate', '.tau/parameters/plate.ts.json'), 'utf8')).toContain('30');
    },
    kernelCallLimit,
  );

  it(
    'should export the first project as STEP after the second project rendered',
    async () => {
      const result = await call({ name: 'export_model', arguments: { targetFile: 'main.ts', to: 'step' } });

      expect(result.isError ?? false, textOf(result)).toBe(false);
      const artifactPath = (result.structuredContent as { files?: Array<{ artifactPath: string }> } | undefined)
        ?.files?.[0]?.artifactPath;
      expect(artifactPath).toBeDefined();
      const step = await readFile(join(scratch, 'block', artifactPath ?? ''), 'utf8');
      expect(step.startsWith('ISO-10303-21;')).toBe(true);
      /* Re-imported: the STEP kernel opens and renders what was exported. */
      await writeFile(join(scratch, 'block', 'exported.step'), step);
      const reopened = await call({ name: 'evaluate_model', arguments: { targetFile: 'exported.step' } });
      expect(reopened.structuredContent, textOf(reopened)).toMatchObject({ status: 'ready' });
    },
    kernelCallLimit,
  );

  it(
    'should run GeoSpec on the native engine after the second project rendered',
    async ({ skip }) => {
      skip(nativeEngineUnavailable !== undefined, nativeEngineUnavailable);
      const result = await call({ name: 'test_model', arguments: {} });

      expect(result.isError ?? false, textOf(result)).toBe(false);
      expect(result.structuredContent).toMatchObject({ passed: 1, total: 1 });
    },
    kernelCallLimit,
  );

  it('should exit within five seconds of the client closing, removing its screenshots', async ({ annotate }) => {
    await client.close();
    const { code, elapsed } = await exitWithin(served, 5000);
    await annotate(`exited ${String(Math.round(elapsed))} ms after the client closed`);

    expect(code).toBe(0);
    if (rendererUnavailable === undefined) {
      expect(screenshotPath).not.toBe('');
      expect(await exists(screenshotPath)).toBe(false);
    }
    const lines = served
      .stdout()
      .split('\n')
      .filter((line) => line !== '');
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(JSONRPCMessageSchema.safeParse(JSON.parse(line)).success, line.slice(0, 200)).toBe(true);
    }
    expect(served.stdout()).not.toContain(noiseMarker);
    expect(served.stderr()).toContain(noiseMarker);
  }, 30_000);
});

describe('tau mcp on SIGTERM', () => {
  it(
    'should close cleanly and exit 0',
    async () => {
      const served = launch();
      disposers.push(stopIfRunning(served));
      await connect(new Client({ name: 'tau-mcp-integration', version: '1' }), served);

      served.child.kill('SIGTERM');

      const { code } = await exitWithin(served, 5000);
      expect(code).toBe(0);
    },
    kernelCallLimit,
  );
});

/**
 * The `initialize` each host sends, as probed from the hosts (blueprint D5).
 * The standard capability decides whether a host gets the page; the client
 * name only picks Codex's entrypoints.
 */
const hostShapes = {
  claudeCode: {
    clientInfo: { name: 'claude-code', version: '2.1.296' },
    capabilities: { roots: { listChanged: true }, elicitation: { form: {}, url: {} } },
  },
  codexCli: {
    clientInfo: { name: 'codex-mcp-client', version: '0.157.1' },
    capabilities: { experimental: { 'codex/auth-change': {} }, elicitation: { form: {}, url: {} } },
  },
  claudeDesktop: {
    clientInfo: { name: 'claude-ai', version: '0.1.0' },
    capabilities: {
      roots: { listChanged: true },
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    },
  },
  codexDesktop: {
    clientInfo: { name: 'codex-mcp-client', version: '26.1007.21159' },
    capabilities: {
      experimental: { 'codex/auth-change': {} },
      elicitation: { form: {}, url: {} },
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    },
  },
} as const;

describe('tau mcp viewer presentation', () => {
  const page = '<!doctype html><title>Tau viewer fixture</title>';
  let pagePath = '';

  beforeAll(async () => {
    pagePath = join(scratch, 'viewer-page.html');
    await writeFile(pagePath, page);
  });

  /**
   * Initialize one server as a host does and list what it offers, without loading a kernel.
   *
   * @param shape - The host's `initialize`.
   * @returns The tools by name and the server's resources.
   */
  const offered = async (shape: (typeof hostShapes)[keyof typeof hostShapes]) => {
    const served = launch(join(scratch, 'viewer-host'), pagePath);
    disposers.push(stopIfRunning(served));
    await mkdir(join(scratch, 'viewer-host'), { recursive: true });
    const client = new Client(shape.clientInfo, { capabilities: shape.capabilities });
    await connect(client, served);
    const { tools } = await client.listTools();
    const { resources } = await client.listResources();
    const result = { tools: new Map(tools.map((tool) => [tool.name, tool])), resources, client, served };
    return result;
  };

  it(
    'should give a text host the show_model link tool and no page',
    async () => {
      for (const shape of [hostShapes.claudeCode, hostShapes.codexCli]) {
        // oxlint-disable-next-line no-await-in-loop -- one server per host shape.
        const { tools, client, served } = await offered(shape);
        expect(tools.get('show_model')?._meta).toEqual({ 'anthropic/alwaysLoad': true });
        expect([...tools.keys()]).not.toEqual(expect.arrayContaining(['app_read']));
        expect(tools.has('open_model_file') || tools.has('browse_models')).toBe(false);
        // oxlint-disable-next-line no-await-in-loop -- ditto.
        expect(await served.kernelModules()).toEqual([]);
        // oxlint-disable-next-line no-await-in-loop -- ditto.
        await client.close();
      }
    },
    kernelCallLimit,
  );

  it(
    'should give Claude Desktop the ui:// page on show_model and the app-only ranged read',
    async () => {
      const { tools, resources, client } = await offered(hostShapes.claudeDesktop);
      const ui = tools.get('show_model')?._meta?.['ui'] as { resourceUri: string } | undefined;
      expect(ui?.resourceUri).toMatch(/^ui:\/\/tau\/[\da-f]{16}\/app\.html$/u);
      expect(tools.get('show_model')?._meta).not.toHaveProperty(['openai/ui']);
      expect(tools.get('app_read')?._meta?.['ui']).toEqual({ resourceUri: ui?.resourceUri, visibility: ['app'] });
      expect(tools.has('open_model_file') || tools.has('browse_models')).toBe(false);

      const resource = resources.find(({ uri }) => uri === ui?.resourceUri);
      expect(resource?.mimeType).toBe('text/html;profile=mcp-app');
      expect(resource?._meta?.['ui']).toMatchObject({ csp: { connectDomains: ['data:', 'blob:'] } });
      const { contents } = await client.readResource({ uri: ui?.resourceUri ?? '' });
      expect(contents).toEqual([expect.objectContaining({ text: page, mimeType: 'text/html;profile=mcp-app' })]);
      await client.close();
    },
    kernelCallLimit,
  );

  it(
    'should give Codex desktop the thread, sidebar and file entrypoints',
    async () => {
      const { tools, client } = await offered(hostShapes.codexDesktop);
      const meta = (name: string) => tools.get(name)?._meta ?? {};
      const { resourceUri } = meta('show_model')['ui'] as { resourceUri: string };

      expect(meta('show_model')).toMatchObject({
        'openai/outputTemplate': resourceUri,
        'openai/ui': { entrypoints: [{ type: 'thread' }] },
      });
      expect(meta('browse_models')).toMatchObject({ 'openai/ui': { entrypoints: [{ type: 'global' }] } });
      expect(meta('open_model_file')).toMatchObject({
        'openai/ui': { entrypoints: [{ type: 'file', extensions: expect.arrayContaining(['glb']) as unknown }] },
      });
      expect(meta('app_read')['ui']).toEqual({ resourceUri, visibility: ['app'] });
      await client.close();
    },
    kernelCallLimit,
  );
});

describe("tau mcp with this computer's printers (blueprint W11)", () => {
  const printTools = [
    'get_print_profiles',
    'request_print',
    'get_print_request',
    'list_print_requests',
    'cancel_print',
  ];
  const projectId = 'proj_abcdefghijklmnopqrstu';

  /**
   * A printer store of its own, and the environment that points a server at it.
   *
   * @param name - The store's folder under the scratch directory.
   * @returns The config directory and the server environment.
   */
  const isolatedStore = async (name: string) => {
    const configDirectory = join(scratch, name);
    await mkdir(configDirectory, { recursive: true });
    /* Built by assignment so no environment key is a source literal. */
    const environment: Record<string, string> = {};
    environment['TAU_CONFIG_DIR'] = configDirectory;
    environment['TAU_HOST_MACHINES'] = 'true';
    /* No test may touch a person's keychain. */
    environment['TAU_SECRET_VAULT'] = 'memory';
    return { configDirectory, environment };
  };

  /**
   * A Tau project folder with a model to print.
   *
   * @param name - The folder under the scratch directory.
   * @returns Its path.
   */
  const printProject = async (name: string): Promise<string> => {
    const folder = join(scratch, name);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'tau.json'), JSON.stringify({ id: projectId }));
    await writeFile(join(folder, 'plate.ts'), files.plate['plate.ts']);
    return folder;
  };

  const namesOf = async (client: Client): Promise<string[]> => {
    const { tools } = await client.listTools();
    return tools.map(({ name }) => name);
  };

  const printToolsOf = async (client: Client): Promise<string[]> => {
    const names = await namesOf(client);
    return names.filter((name) => printTools.includes(name));
  };

  it(
    'should offer the print tools over the shared store, and none from a second server while the first holds it',
    async () => {
      const { environment } = await isolatedStore('config-held');
      const project = await printProject('printing');
      const first = launch(project, undefined, { env: environment });
      disposers.push(stopIfRunning(first));
      const holder = new Client({ name: 'tau-mcp-printers', version: '1' });
      await connect(holder, first);
      expect(await namesOf(holder)).toEqual(expect.arrayContaining(printTools));
      const listed = CallToolResultSchema.parse(await holder.callTool({ name: 'list_print_requests', arguments: {} }));
      expect(listed.isError ?? false, textOf(listed)).toBe(false);

      const second = launch(project, undefined, { env: environment });
      disposers.push(stopIfRunning(second));
      const other = new Client({ name: 'tau-mcp-printers-2', version: '1' });
      await connect(other, second);
      expect(await printToolsOf(other)).toEqual([]);
      await vi.waitFor(() => {
        expect(second.stderr()).toContain('printers are in use by another Tau app');
      });
      await other.close();
      await holder.close();
    },
    kernelCallLimit,
  );

  it(
    'should leave the printers to other apps while its one folder holds no project',
    async () => {
      const { environment } = await isolatedStore('config-unnamed');
      await mkdir(join(scratch, 'not-a-project'), { recursive: true });
      const unnamed = launch(join(scratch, 'not-a-project'), undefined, { env: environment });
      disposers.push(stopIfRunning(unnamed));
      const client = new Client({ name: 'tau-mcp-unnamed', version: '1' });
      await connect(client, unnamed);
      expect(await printToolsOf(client)).toEqual([]);
      await vi.waitFor(() => {
        expect(unnamed.stderr()).toContain('holds no tau.json');
      });

      /* It holds no lock, so a server in a project prints while it runs. */
      const named = launch(await printProject('printing-beside'), undefined, { env: environment });
      disposers.push(stopIfRunning(named));
      const other = new Client({ name: 'tau-mcp-named', version: '1' });
      await connect(other, named);
      expect(await namesOf(other)).toEqual(expect.arrayContaining(printTools));
      await other.close();
      await client.close();
    },
    kernelCallLimit,
  );

  it(
    "should print from the folder Codex names with each call, only on the person's answer in its form",
    async () => {
      const { configDirectory, environment } = await isolatedStore('config-codex');
      /* The simulator, bound in the store before the server starts, as the person binds a printer in Tau. */
      /* Loaded on demand, as the CLI loads the vendor package. */
      const { bambuSimulatorMachine } = await import('@taucad/bambu');
      const vault = process.env['TAU_SECRET_VAULT'];
      process.env['TAU_SECRET_VAULT'] = 'memory';
      const store = await openSharedMachineHost({
        providers: [bambuSimulatorMachine()],
        readArtifact: async () => {
          throw new Error('MACHINE_ARTIFACT_NOT_FOUND');
        },
        onWarning: () => undefined,
        actorId: 'test',
        storeRoot: join(configDirectory, 'machines'),
      });
      if (vault === undefined) {
        delete process.env['TAU_SECRET_VAULT'];
      } else {
        process.env['TAU_SECRET_VAULT'] = vault;
      }
      if (store === undefined) {
        throw new Error('The isolated printer store was held.');
      }
      const { port1, port2 } = new MessageChannel();
      const served = store.host.serve({ port: port1, session: store.session });
      const machines = connectMachineChannel(port2);
      try {
        let candidate: Parameters<typeof machines.beginBinding>[0]['candidate'] | undefined;
        for await (const event of machines.discover({
          providerId: 'bambu-simulator',
          configuration: { logicalId: 'simulated-x1c' },
        })) {
          if (event.type === 'found') {
            candidate = event.candidate;
            break;
          }
        }
        if (candidate === undefined) {
          throw new Error('The simulator reported no candidate.');
        }
        const ceremony = await machines.beginBinding({ candidate, name: 'simulated-x1c' });
        if (ceremony.status === 'operator-action-required') {
          await store.host.completeBinding({
            ceremonyId: ceremony.ceremonyId,
            secretRef: 'simulator',
            serviceTrust: {},
          });
        }
      } finally {
        machines.close();
        served.dispose();
        await store.host.close();
      }

      const project = await printProject('codex-project');
      await mkdir(join(scratch, 'codex-unnamed'), { recursive: true });
      /* As Codex starts it: in the plugin's folder (here the repository, which holds no tau.json), naming no project. */
      const server = launch(undefined, undefined, { env: environment });
      disposers.push(stopIfRunning(server));
      const asked: string[] = [];
      let approve = false;
      const client = new Client(hostShapes.codexCli.clientInfo, { capabilities: { elicitation: { form: {} } } });
      client.setRequestHandler(ElicitRequestSchema, async (request) => {
        asked.push(request.params.message);
        return { action: 'accept', content: { approve } };
      });
      await connect(client, server);
      expect(await namesOf(client)).toEqual(expect.arrayContaining(printTools));

      const requestIn = async (folder: string): Promise<CallToolResult> =>
        CallToolResultSchema.parse(
          await client.callTool(
            {
              name: 'request_print',
              arguments: { targetFile: 'plate.ts' },
              _meta: { 'codex/sandbox-state-meta': { sandboxCwd: pathToFileURL(folder).href } },
            },
            undefined,
            { timeout: kernelCallLimit },
          ),
        );
      type Answer = {
        approval?: string;
        machineName?: string;
        request?: { state: string; artifact: { path: string } };
      };

      const unnamedFolder = await requestIn(join(scratch, 'codex-unnamed'));
      expect(unnamedFolder.isError).toBe(true);
      expect(textOf(unnamedFolder)).toContain('holds no tau.json');

      const denied = await requestIn(project);
      expect(denied.isError ?? false, textOf(denied)).toBe(false);
      const deniedAnswer = JSON.parse(textOf(denied)) as Answer;
      expect(deniedAnswer).toMatchObject({ approval: 'denied', request: { state: 'denied' } });
      expect(asked).toHaveLength(1);
      /* The form names the sliced file and the machine it would print on. */
      expect(asked[0]).toContain(deniedAnswer.request?.artifact.path.split('/').at(-1));
      expect(asked[0]).toContain(deniedAnswer.machineName);

      /* Approved, the machine host reads the slice back from the folder the call named, by that folder's project. */
      approve = true;
      const approved = await requestIn(project);
      expect(approved.isError ?? false, textOf(approved)).toBe(false);
      const approvedAnswer = JSON.parse(textOf(approved)) as Answer;
      expect(approvedAnswer, textOf(approved)).toMatchObject({
        approval: 'approved',
        request: { state: expect.stringMatching(/^(?:uploading|starting|confirming|started)$/u) as string },
      });
      await expect(access(join(project, approvedAnswer.request?.artifact.path ?? 'missing'))).resolves.toBeUndefined();
      await client.close();
    },
    kernelCallLimit,
  );
});

/**
 * A model that runs for `milliseconds` of busy CPU and records when, so two
 * projects' runs show whether they overlapped.
 *
 * @param timeline - Absolute file each run appends `{ project, started, ended }` to.
 * @param project - The project name recorded.
 * @param milliseconds - How long the model computes.
 * @returns The model source.
 */
const timedModel = (
  timeline: string,
  project: string,
  milliseconds: number,
): string => `import { drawRectangle } from 'replicad';

export default function main() {
  const started = Date.now();
  while (Date.now() - started < ${String(milliseconds)}) {
    /* Busy: a synchronous model holds its thread, as OpenCASCADE does. */
  }
  globalThis.process.getBuiltinModule('node:fs').appendFileSync(
    ${JSON.stringify(timeline)},
    JSON.stringify({ project: ${JSON.stringify(project)}, started, ended: Date.now() }) + '\\n',
  );
  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);
}
`;

/**
 * A model that never returns, after writing `marker` so a test knows it runs.
 *
 * @param marker - Absolute file written once the model starts.
 * @returns The model source.
 */
const loopingModel = (marker: string): string => `import { drawRectangle } from 'replicad';

export default function main() {
  drawRectangle(20, 10);
  globalThis.process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)}, 'running');
  for (;;) {
    /* Never returns. */
  }
}
`;

const boxModel = files.block['main.ts'];

/** Seconds `tau mcp` gives one operation in the thread-per-project server below. */
const operationTimeoutSeconds = 30;

/** Milliseconds a call to an already-loaded project may take on a loaded machine. */
const warmCallLimit = 120_000;

/**
 * Resolve once `path` exists.
 *
 * @param path - The file to wait for.
 * @param limit - Milliseconds to wait before rejecting.
 */
const fileAppears = async (path: string, limit: number): Promise<void> => {
  const deadline = performance.now() + limit;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- polling a file another process writes.
    if (await exists(path)) {
      return;
    }
    if (performance.now() > deadline) {
      throw new Error(`${path} did not appear within ${String(limit)} ms`);
    }
    // oxlint-disable-next-line no-await-in-loop -- ditto.
    await sleep(100);
  }
};

describe('tau mcp with one thread per project', () => {
  let served: Served;
  let client: Client;
  let alpha = '';
  let beta = '';
  let timeline = '';
  const betaMeta = () => ({ 'codex/sandbox-state-meta': { sandboxCwd: pathToFileURL(beta).href } });

  const call = async (params: CallToolRequest['params'], timeout = kernelCallLimit): Promise<CallToolResult> =>
    CallToolResultSchema.parse(await client.callTool(params, undefined, { timeout }));

  beforeAll(async () => {
    alpha = join(scratch, 'alpha');
    beta = join(scratch, 'beta');
    timeline = join(scratch, 'timeline.jsonl');
    await mkdir(alpha);
    await mkdir(beta);
    await writeFile(join(alpha, 'main.ts'), boxModel);
    await writeFile(join(beta, 'main.ts'), boxModel);
    served = launch(alpha, undefined, { args: ['--operation-timeout', String(operationTimeoutSeconds)] });
    disposers.push(stopIfRunning(served));
    client = new Client({ name: 'tau-mcp-integration-threads', version: '1' });
    await connect(client, served);
    /* Both projects loaded, so the cases below time models, not kernel boots. */
    const [first, second] = await Promise.all([
      call({ name: 'evaluate_model', arguments: { targetFile: 'main.ts' } }),
      call({ name: 'evaluate_model', arguments: { targetFile: 'main.ts' }, _meta: betaMeta() }),
    ]);
    expect(first.structuredContent).toMatchObject({ status: 'ready' });
    expect(second.structuredContent).toMatchObject({ status: 'ready' });
  }, kernelCallLimit);

  it(
    "should run two projects' models at the same time",
    async () => {
      await writeFile(join(alpha, 'slow.ts'), timedModel(timeline, 'alpha', 3000));
      await writeFile(join(beta, 'slow.ts'), timedModel(timeline, 'beta', 3000));

      const results = await Promise.all([
        call({ name: 'evaluate_model', arguments: { targetFile: 'slow.ts' } }, warmCallLimit),
        call({ name: 'evaluate_model', arguments: { targetFile: 'slow.ts' }, _meta: betaMeta() }, warmCallLimit),
      ]);

      for (const result of results) {
        expect(result.structuredContent, textOf(result)).toMatchObject({ status: 'ready' });
      }
      const recorded = await readFile(timeline, 'utf8');
      const runs = recorded
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as { project: string; started: number; ended: number });
      const overlapping = runs.some(
        (a) =>
          a.project === 'alpha' && runs.some((b) => b.project === 'beta' && a.started < b.ended && b.started < a.ended),
      );
      expect(overlapping, JSON.stringify(runs)).toBe(true);
    },
    kernelCallLimit,
  );

  it(
    'should time out a looping model in its own thread while another project keeps working, then recover',
    async () => {
      const marker = join(scratch, 'alpha-looping');
      await writeFile(join(alpha, 'loop.ts'), loopingModel(marker));
      const started = performance.now();
      const looping = call({ name: 'evaluate_model', arguments: { targetFile: 'loop.ts' } }, warmCallLimit);
      await fileAppears(marker, warmCallLimit);

      const other = await call(
        { name: 'evaluate_model', arguments: { targetFile: 'main.ts' }, _meta: betaMeta() },
        warmCallLimit,
      );
      expect(other.structuredContent, textOf(other)).toMatchObject({ status: 'ready' });

      const timedOut = await looping;
      const elapsed = performance.now() - started;
      expect(
        timedOut.isError === true ||
          (timedOut.structuredContent as { status?: string } | undefined)?.status === 'error',
      ).toBe(true);
      expect(JSON.stringify(timedOut.content) + JSON.stringify(timedOut.structuredContent ?? {})).toMatch(
        /timed out/iu,
      );
      /* The deadline, the termination grace, and the call's own overhead. */
      expect(elapsed).toBeLessThan((operationTimeoutSeconds + 15) * 1000);

      /* The edited model runs in a fresh thread at once: the timed-out thread, which the
       * runtime would terminate only a second later, never takes another call. */
      await writeFile(join(alpha, 'loop.ts'), boxModel);
      const recovered = await call({ name: 'evaluate_model', arguments: { targetFile: 'loop.ts' } });
      expect(recovered.structuredContent, textOf(recovered)).toMatchObject({ status: 'ready' });
    },
    kernelCallLimit,
  );

  it(
    "should replace a project's thread after its model ends the thread",
    async () => {
      await writeFile(
        join(alpha, 'exit.ts'),
        `import { drawRectangle } from 'replicad';\n\nexport default function main() {\n  drawRectangle(1, 1);\n  globalThis.process.exit(3);\n}\n`,
      );
      const ended = await call({ name: 'evaluate_model', arguments: { targetFile: 'exit.ts' } }, warmCallLimit);
      expect(
        ended.isError === true || (ended.structuredContent as { status?: string } | undefined)?.status === 'error',
      ).toBe(true);

      const replaced = await call({ name: 'evaluate_model', arguments: { targetFile: 'main.ts' } });
      expect(replaced.structuredContent, textOf(replaced)).toMatchObject({ status: 'ready' });
      const other = await call(
        { name: 'evaluate_model', arguments: { targetFile: 'main.ts' }, _meta: betaMeta() },
        warmCallLimit,
      );
      expect(other.structuredContent, textOf(other)).toMatchObject({ status: 'ready' });
    },
    kernelCallLimit,
  );

  it(
    'should stop every thread within the shutdown grace, even one running a model that never returns',
    async () => {
      const marker = join(scratch, 'beta-looping');
      await writeFile(join(beta, 'loop.ts'), loopingModel(marker));
      /* The call never answers: the server stops under it. */
      const looping = Promise.allSettled([
        client.callTool(
          { name: 'evaluate_model', arguments: { targetFile: 'loop.ts' }, _meta: betaMeta() },
          undefined,
          {
            timeout: kernelCallLimit,
          },
        ),
      ]);
      await fileAppears(marker, warmCallLimit);

      await client.close();
      /* Inside the five-second grace: a thread that ignored termination would hold the exit to the grace. */
      const { code } = await exitWithin(served, 4000);
      expect(code).toBe(0);
      await looping;
    },
    kernelCallLimit,
  );
});

describe('tau mcp idle release', () => {
  it(
    'should keep a thread whose call outlasts the idle release',
    async () => {
      const project = join(scratch, 'idle-busy');
      await mkdir(project);
      await writeFile(join(project, 'main.ts'), boxModel);
      await writeFile(join(project, 'slow.ts'), timedModel(join(scratch, 'idle-busy.jsonl'), 'idle-busy', 5000));
      const served = launch(project, undefined, { args: ['--idle-release', '2'] });
      disposers.push(stopIfRunning(served));
      const client = new Client({ name: 'tau-mcp-integration-idle-busy', version: '1' });
      await connect(client, served);
      const evaluate = async (targetFile: string): Promise<CallToolResult> =>
        CallToolResultSchema.parse(
          await client.callTool({ name: 'evaluate_model', arguments: { targetFile } }, undefined, {
            timeout: kernelCallLimit,
          }),
        );

      const warm = await evaluate('main.ts');
      expect(warm.structuredContent, textOf(warm)).toMatchObject({ status: 'ready' });
      /* Five seconds of computing against a two-second idle release. */
      const slow = await evaluate('slow.ts');
      expect(slow.structuredContent, textOf(slow)).toMatchObject({ status: 'ready' });
      await client.close();
      const { code } = await exitWithin(served, 10_000);
      expect(code).toBe(0);
    },
    kernelCallLimit,
  );

  it(
    "should release an idle project's thread and load a fresh one on its next call",
    async () => {
      const project = join(scratch, 'idle');
      await mkdir(project);
      await writeFile(join(project, 'main.ts'), boxModel);
      const served = launch(project, undefined, { args: ['--idle-release', '2'] });
      disposers.push(stopIfRunning(served));
      const client = new Client({ name: 'tau-mcp-integration-idle', version: '1' });
      await connect(client, served);
      const evaluate = async (): Promise<unknown> => {
        const result = CallToolResultSchema.parse(
          await client.callTool({ name: 'evaluate_model', arguments: { targetFile: 'main.ts' } }, undefined, {
            timeout: kernelCallLimit,
          }),
        );
        return result.structuredContent;
      };

      expect(await evaluate()).toMatchObject({ status: 'ready' });
      const loaded = await served.kernelModules();
      await sleep(5000);
      expect(await evaluate()).toMatchObject({ status: 'ready' });

      /* A fresh thread resolves its kernels again; the released one is gone. */
      const reloaded = await served.kernelModules();
      expect(reloaded.length).toBeGreaterThan(loaded.length);
      await client.close();
      const { code } = await exitWithin(served, 10_000);
      expect(code).toBe(0);
    },
    kernelCallLimit,
  );
});
