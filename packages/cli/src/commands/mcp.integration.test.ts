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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
 * @param projectDirectory - The `CLAUDE_PROJECT_DIR` Claude Code would set, if any.
 * @returns The child, a transport the SDK client connects over, and its output.
 */
const launch = (projectDirectory?: string): Served => {
  launches += 1;
  const resolveLog = join(scratch, `resolved-${String(launches)}.log`);
  /* Built by assignment so no environment key is a source literal. */
  const env: NodeJS.ProcessEnv = { ...process.env };
  env['TAU_TEST_RESOLVE_LOG'] = resolveLog;
  if (projectDirectory !== undefined) {
    env['CLAUDE_PROJECT_DIR'] = projectDirectory;
  }
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--import', pathToFileURL(join(scratch, 'register.mjs')).href, binPath, 'mcp'],
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

  /* Before the second project below loads its kernels: every replicad kernel
   * instance sets replicad's process-global OpenCascade, so a later instance in
   * this process breaks this project's STEP route (KERNEL_BINDING_FAILED). */
  it(
    'should run GeoSpec on the native engine',
    async ({ skip }) => {
      skip(nativeEngineUnavailable !== undefined, nativeEngineUnavailable);
      const result = await call({ name: 'test_model', arguments: {} });

      expect(result.isError ?? false, textOf(result)).toBe(false);
      expect(result.structuredContent).toMatchObject({ passed: 1, total: 1 });
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
