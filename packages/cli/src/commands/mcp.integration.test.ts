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
 * @param options - `tau mcp` options after the command.
 * @returns The child, a transport the SDK client connects over, and its output.
 */
const launch = (projectDirectory?: string, options: readonly string[] = []): Served => {
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
    ['--import', 'tsx', '--import', pathToFileURL(join(scratch, 'register.mjs')).href, binPath, 'mcp', ...options],
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
    served = launch(alpha, ['--operation-timeout', String(operationTimeoutSeconds)]);
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
      const served = launch(project, ['--idle-release', '2']);
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
      const served = launch(project, ['--idle-release', '2']);
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
