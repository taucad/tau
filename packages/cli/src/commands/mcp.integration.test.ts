/* oxlint-disable max-lines -- one stdio server suite: the native-kernel scenarios share its launcher, frames and mirror */
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
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { availableParallelism, loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, ElicitRequestSchema, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { defaultMachineProviders, openSharedMachineHost } from '@taucad/host';
import { connectMachineChannel } from '@taucad/runtime/machine';
import { detectHostIndicators, parsePluginDeployment, selectVariant } from '@taucad/runtime/preparation/node';
import { getBoundingBoxFromInspect, getInspectReport } from '@taucad/runtime-testing';

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

/**
 * A loader hook that appends each module URL the server resolves to the log its registration names. The path rides
 * the registration, not the environment: `tau mcp` starts its runtime threads with an allowlisted environment (X9).
 */
const resolveLogHook = `import { appendFileSync } from 'node:fs';
let log;
export const initialize = (path) => {
  log = path;
};
export const resolve = async (specifier, context, next) => {
  const resolved = await next(specifier, context);
  appendFileSync(log, resolved.url + '\\n');
  return resolved;
};
`;

/** Failure-only lifecycle evidence from the child, without changing its shutdown deadline or production code. */
const shutdownLogHook = `import { Worker, isMainThread } from 'node:worker_threads';
if (isMainThread) {
const started = performance.now();
const trace = (event, threadId) => process.stderr.write('[mcp-shutdown] ' + JSON.stringify({ event, threadId, ms: Math.round(performance.now() - started) }) + '\\n');
process.stdin.once('end', () => trace('stdin-end'));
process.once('exit', () => trace('process-exit'));
const terminate = Worker.prototype.terminate;
Worker.prototype.terminate = function () {
  const id = this.threadId;
  trace('worker-terminate-start', id);
  return terminate.call(this).then(code => {
    trace('worker-terminate-end', id);
    return code;
  });
};
}
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
 * host's own package as the server resolves it; the npm package ships prebuilt
 * bindings for some platforms only, so a host without one skips that step
 * rather than failing.
 */
const nativeEngineUnavailable = await (async (): Promise<string | undefined> => {
  try {
    const resolved = createRequire(join(repoRoot, 'packages/host/package.json')).resolve('geospec-engine/node');
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
  await writeFile(join(scratch, 'shutdown-log.mjs'), shutdownLogHook);
});

/** One JSON-RPC frame on a server's stdio. */
type Frame = {
  readonly at: number;
  readonly direction: 'client->server' | 'server->client';
  readonly frame: string;
};

/** One `tau mcp` child and the SDK transport over its stdio. */
type Served = {
  readonly child: ChildProcessWithoutNullStreams;
  readonly transport: Transport;
  readonly exited: Promise<number | undefined>;
  readonly stdout: () => string;
  readonly stderr: () => string;
  /** Every JSON-RPC frame in either direction, with milliseconds since launch: the evidence a scenario keeps. */
  readonly frames: () => readonly Frame[];
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
  extra: {
    readonly env?: Record<string, string>;
    readonly args?: readonly string[];
    /** Further modules the server imports first, such as a test's own loader hooks. */
    readonly imports?: readonly string[];
  } = {},
): Served => {
  launches += 1;
  const resolveLog = join(scratch, `resolved-${String(launches)}.log`);
  const register = join(scratch, `register-${String(launches)}.mjs`);
  writeFileSync(
    register,
    `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(join(scratch, 'resolve-log.mjs')).href)}, { data: ${JSON.stringify(resolveLog)} });\n`,
  );
  /* Built by assignment so no environment key is a source literal. */
  const env: NodeJS.ProcessEnv = { ...process.env };
  /* Without one the server starts as Codex starts it, naming no project, even when this test runs under Claude Code. */
  if (projectDirectory === undefined) {
    delete env['CLAUDE_PROJECT_DIR'];
  } else {
    env['CLAUDE_PROJECT_DIR'] = projectDirectory;
  }
  if (viewerPage !== undefined) {
    env['TAU_VIEWER_PAGE'] = viewerPage;
  }
  /* Each server keeps its durable compute store here, so no test reuses another's builds or the user's own. */
  env['TAU_CONFIG_DIR'] = join(scratch, 'config', String(launches));
  Object.assign(env, extra.env);
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      pathToFileURL(register).href,
      ...(extra.imports ?? []).flatMap((specifier) => ['--import', specifier]),
      binPath,
      'mcp',
      ...(extra.args ?? []),
    ],
    { cwd: repoRoot, env, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let stdout = '';
  let stderr = '';
  let unread = '';
  const frames: Frame[] = [];
  const started = performance.now();
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
          frames.push({ at: Math.round(performance.now() - started), direction: 'server->client', frame: line });
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
      const frame = JSON.stringify(message);
      frames.push({ at: Math.round(performance.now() - started), direction: 'client->server', frame });
      child.stdin.write(`${frame}\n`);
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
    frames: () => frames,
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

/**
 * A preload that replaces the global `fetch` in every thread of a server with one that records the URL and throws:
 * guarantee G1 of the managed profile (charter D25, W10) at full depth, where a warm store under
 * `TAU_ACQUISITION=locked` must let `tau mcp` evaluate with no request at all. Worker threads inherit the `--import`.
 * `file:`, `data:` and `blob:` URLs reach no origin, so they pass through to the original `fetch`.
 *
 * @param name - Names the preload and its log, one per server.
 * @returns The `--import` specifier, and the URLs the server has tried to fetch so far.
 */
const fetchTripwire = async (name: string) => {
  const log = join(scratch, `${name}.fetches.log`);
  const hook = join(scratch, `${name}.fetch-tripwire.mjs`);
  await writeFile(
    hook,
    `import { appendFileSync } from 'node:fs';
const local = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  /* Not a request: the runtime's loadBinaryFile tries fetch on a file: URL before reading the file itself. */
  if (/^(?:file|data|blob):/u.test(url)) {
    return local(input, init);
  }
  appendFileSync(${JSON.stringify(log)}, url + '\\n');
  throw new TypeError('G1 tripwire: tau mcp fetched ' + url + ' on a warm store under TAU_ACQUISITION=locked');
};
`,
  );
  return {
    specifier: pathToFileURL(hook).href,
    fetched: async (): Promise<string[]> => {
      if (!(await exists(log))) {
        return [];
      }
      const recorded = await readFile(log, 'utf8');
      return recorded.split('\n').filter((line) => line !== '');
    },
  };
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
    served = launch(join(scratch, 'block'), undefined, {
      imports: [pathToFileURL(join(scratch, 'shutdown-log.mjs')).href],
    });
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
    /* Codex's capability goes to Codex only (INS-2); 'tau mcp identity' checks that Codex receives it. */
    expect(client.getServerCapabilities()).not.toHaveProperty('experimental');

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
      /* The admission limits are the native GeoSpec engine's own, as its initialize configuration reports them. */
      expect(result.structuredContent).toMatchObject({
        status: 'ready',
        projectRoot: join(scratch, 'block'),
        summary: {
          bounds: {
            min: { x: -10, y: -5, z: 0 },
            max: { x: 10, y: 5, z: 4 },
            size: { x: 20, y: 10, z: 4 },
            unit: 'mm',
          },
          componentCount: 1,
          admission: {
            triangles: { limit: 4_000_000 },
            vertices: { limit: 2_000_000 },
            subjectBytes: { limit: 67_108_864 },
          },
        },
      });
      expect(result.structuredContent).not.toHaveProperty('summary.admission.warning');
      expect(result.structuredContent).toMatchObject({ mechanism: { declared: false, admitted: false } });
      /* The build went to the durable compute store a restarted server reads it back from. */
      expect(await readdir(join(scratch, 'config'), { recursive: true })).toContainEqual(
        expect.stringMatching(/compute\/[0-9a-f]+\.sqlite$/u),
      );
      expect(served.stderr()).toContain(`tau mcp: project root ${join(scratch, 'block')} (CLAUDE_PROJECT_DIR)`);
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
      expect(textOf(result)).toContain(`\nprojectRoot: ${join(scratch, 'block')}`);
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

      expect(named.structuredContent).toMatchObject({ status: 'ready', projectRoot: join(scratch, 'lid') });
      expect(served.stderr()).toContain(`tau mcp: project root ${join(scratch, 'lid')} (the folder a call named)`);
      expect(unnamed.structuredContent).toMatchObject({
        projectRoot: join(scratch, 'block'),
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
      expect(artifactPath).toMatch(/\.step$/);
      const step = await readFile(join(scratch, 'block', artifactPath ?? ''), 'utf8');
      expect(step.startsWith('ISO-10303-21;')).toBe(true);
      /* Re-imported in place: the artifact's extension selects the STEP kernel, which renders what was exported. */
      const reopened = await call({ name: 'evaluate_model', arguments: { targetFile: artifactPath ?? '' } });
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
      expect(result.structuredContent).toMatchObject({ passed: 1, total: 1, projectRoot: join(scratch, 'block') });
    },
    kernelCallLimit,
  );

  it('should exit within five seconds of the client closing, removing its screenshots', async ({ annotate }) => {
    await client.close();
    const { code, elapsed } = await exitWithin(served, 5000);
    await annotate(`exited ${String(Math.round(elapsed))} ms after the client closed`);

    // An exited child can still have buffered diagnostics; never extend the running-process deadline.
    if (typeof code === 'number' && code !== 0 && !served.child.stderr.closed) {
      const drained = Promise.withResolvers<void>();
      const onClose = (): void => {
        drained.resolve();
      };
      served.child.stderr.once('close', onClose);
      try {
        await Promise.race([drained.promise, sleep(1000, undefined, { ref: false })]);
      } finally {
        served.child.stderr.off('close', onClose);
      }
    }
    if (code !== 0) {
      await annotate(
        served
          .stderr()
          .split('\n')
          .filter((line) => line.startsWith('[mcp-shutdown] '))
          .join('\n') || 'No shutdown lifecycle event received before the deadline.',
      );
    }
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

describe('tau mcp identity (INS-2)', () => {
  it(
    'should name the rung TAU_LAUNCH reports and declare the Codex capability to Codex only',
    async () => {
      const cliVersion = (
        JSON.parse(readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
          version: string;
        }
      ).version;
      const descriptor = {
        source: 'installed',
        path: '/opt/homebrew/bin/tau',
        cli: cliVersion,
        plugin: cliVersion,
        node: process.versions.node,
        skipped: [{ path: '/usr/local/bin/tau', version: '0.1.0-beta.2' }],
      };
      await mkdir(join(scratch, 'identity'), { recursive: true });
      /* Built by assignment so no environment key is a source literal. */
      const env: Record<string, string> = {};
      env['TAU_LAUNCH'] = JSON.stringify(descriptor);
      const seen: Array<{
        instructions: string | undefined;
        capabilities: ReturnType<Client['getServerCapabilities']>;
      }> = [];
      for (const shape of [hostShapes.claudeCode, hostShapes.codexCli]) {
        const served = launch(join(scratch, 'identity'), undefined, { env });
        disposers.push(stopIfRunning(served));
        const client = new Client(shape.clientInfo, { capabilities: shape.capabilities });
        // oxlint-disable-next-line no-await-in-loop -- one server per host shape.
        await connect(client, served);
        seen.push({ instructions: client.getInstructions(), capabilities: client.getServerCapabilities() });
        // oxlint-disable-next-line no-await-in-loop -- ditto.
        await client.close();
      }
      const [claude, codex] = seen;

      expect(claude?.instructions).toMatch(/^Use your native filesystem/u);
      expect(claude?.instructions).toContain(
        `Tau CLI ${cliVersion} (installed tau at /opt/homebrew/bin/tau; installed tau 0.1.0-beta.2 at /usr/local/bin/tau skipped) started by plugin ${cliVersion} on Node.js ${process.versions.node}; server @taucad/mcp `,
      );
      expect(claude?.instructions?.length).toBeLessThan(2048);
      expect(claude?.capabilities).not.toHaveProperty('experimental');
      expect(codex?.capabilities?.experimental).toEqual({ 'codex/sandbox-state-meta': {} });
    },
    kernelCallLimit,
  );
});

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
    'list_machines',
    'get_machine',
    'machine_action',
    'stop_machine',
    'get_print_profiles',
    'request_job',
    'check_job',
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
    environment['TAU_MACHINES_ENABLED'] = 'true';
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
    await mkdir(join(folder, '.tau'), { recursive: true });
    await writeFile(join(folder, '.tau/project.json'), JSON.stringify({ version: 1, projectId }));
    await writeFile(
      join(folder, 'tau.json'),
      JSON.stringify({
        $schema: 'https://tau.new/schemas/tau-v1.json',
        name: 'Print',
        description: '',
        tags: [],
        assets: { main: { entryPath: 'plate.ts' } },
      }),
    );
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
      const listed = CallToolResultSchema.parse(await holder.callTool({ name: 'list_machines', arguments: {} }));
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
    'should request a job from the folder Codex names with each call, leaving its approval to the Print pane',
    async () => {
      const { configDirectory, environment } = await isolatedStore('config-codex');
      /* The simulator, bound in the store before the server starts, as the person binds a printer in Tau. */
      const vault = process.env['TAU_SECRET_VAULT'];
      process.env['TAU_SECRET_VAULT'] = 'memory';
      const providers = await defaultMachineProviders();
      const store = await openSharedMachineHost({
        providers: providers.filter(({ id }) => id === 'bambu-simulator'),
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
          configuration: {},
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
      const client = new Client(hostShapes.codexCli.clientInfo, { capabilities: { elicitation: { form: {} } } });
      client.setRequestHandler(ElicitRequestSchema, async (request) => {
        asked.push(request.params.message);
        return { action: 'accept', content: { approve: true } };
      });
      await connect(client, server);
      expect(await namesOf(client)).toEqual(expect.arrayContaining(printTools));

      const requestIn = async (folder: string): Promise<CallToolResult> =>
        CallToolResultSchema.parse(
          await client.callTool(
            {
              name: 'request_job',
              arguments: { targetFile: 'plate.ts' },
              _meta: { 'codex/sandbox-state-meta': { sandboxCwd: pathToFileURL(folder).href } },
            },
            undefined,
            { timeout: kernelCallLimit },
          ),
        );
      type Answer = {
        approval?: string;
        job?: { state: string; program: { name: string } };
      };

      const unnamedFolder = await requestIn(join(scratch, 'codex-unnamed'));
      expect(unnamedFolder.isError).toBe(true);
      expect(textOf(unnamedFolder)).toContain('holds no tau.json');

      /* The job waits for the person in Tau's Print pane, where their session approves it; the agent app's form is
       * never asked, even though it can draw one. */
      const requested = await requestIn(project);
      expect(requested.isError ?? false, textOf(requested)).toBe(false);
      const answer = JSON.parse(textOf(requested)) as Answer;
      expect(answer, textOf(requested)).toMatchObject({ job: { state: 'awaiting-approval' } });
      expect(answer).not.toHaveProperty('approval');
      expect(asked).toEqual([]);
      /* The slice lands in the folder the call named, where the machine host reads it by that folder's project. */
      const artifacts = await readdir(join(project, '.tau', 'artifacts'), { recursive: true });
      expect(artifacts).toContainEqual(expect.stringContaining(answer.job?.program.name ?? 'missing'));
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

/*
 * Native kernels over MCP (charter W5 tier 4a, D7), on any host, with a synthetic PicoGK closure: the checked-in
 * kernel row and payload destinations, two in-test archives shaped like Microsoft's runtime and the Tau layer plus a
 * notices archive, served by a loopback mirror under no-fallback for a forced darwin-arm64 target. A sync loader hook
 * (`module.registerHooks`) points `@taucad/picogk/tau-plugin.json` at the synthetic manifest in the server's threads
 * only; Build123d keeps its real manifest, so its refusal names the real download. No client cancellation is relied
 * on beyond the SDK's own `notifications/cancelled` (X9: Codex sends none).
 */

/** One regular file of a synthetic payload archive. */
type ArchiveMember = { readonly name: string; readonly bytes: Uint8Array<ArrayBuffer>; readonly executable?: boolean };

/** A gzipped ustar archive of regular files, the shape every PicoGK payload has. */
const tarGz = (members: readonly ArchiveMember[]): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const { name, bytes, executable } of members) {
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write(`${(executable === true ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('0', 156);
    header.write('ustar\u000000', 257);
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, Buffer.from(bytes), Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])));
};

const text = (value: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(value, 'utf8'));
/* Incompressible, so each payload streams long enough to report progress more than once. */
const filler = (): Uint8Array<ArrayBuffer> => new Uint8Array(randomBytes(384 * 1024));

const runtimeVersion = '10.0.11';
const synthetic = {
  dotnet: tarGz([
    { name: 'dotnet', bytes: text('muxer'), executable: true },
    { name: `host/fxr/${runtimeVersion}/libhostfxr.dylib`, bytes: text('hostfxr') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libhostpolicy.dylib`, bytes: text('hostpolicy') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libcoreclr.dylib`, bytes: text('coreclr') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libclrjit.dylib`, bytes: text('clrjit') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/System.Private.CoreLib.dll`, bytes: text('corelib') },
    { name: 'filler.bin', bytes: filler() },
  ]),
  worker: tarGz([
    { name: 'Tau.PicoGK.Worker.dll', bytes: text('worker') },
    { name: 'Tau.PicoGK.Worker.runtimeconfig.json', bytes: text('{}') },
    { name: 'Tau.PicoGK.Worker.deps.json', bytes: text('{}') },
    { name: 'PicoGK.dll', bytes: text('picogk') },
    { name: 'picogk.26.2.dylib', bytes: text('engine') },
    { name: 'filler.bin', bytes: filler() },
  ]),
  notices: tarGz([{ name: 'filler.bin', bytes: filler() }]),
} as const;
const destinations = { dotnet: 'dotnet', worker: 'tau-worker', notices: 'tau-notices' } as const;
const hexOf = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const syntheticBytes = Object.values(synthetic).reduce((sum, bytes) => sum + bytes.byteLength, 0);

/** The PicoGK manifest with its kernel row, and one darwin-arm64 variant pinning the synthetic archives. */
const syntheticManifest = {
  schemaVersion: 1,
  kernels: { picogk: { requires: ['runtime'], extensions: ['cs'] } },
  dependencies: {
    runtime: [
      {
        target: { runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' },
        payloads: Object.entries(synthetic).map(([name, bytes]) => ({
          name,
          integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
          byteLength: bytes.byteLength,
          format: 'tar.gz',
          /* Never fetched: the mirror serves every payload, with no fallback. */
          origin: { kind: 'url', urls: [`https://payloads.invalid/${name}.tar.gz`] },
          destination: destinations[name as keyof typeof destinations],
        })),
      },
    ],
  },
};

/** Build123d's real download for the forced target, the bytes its refusal must name. */
const build123dBytes = (() => {
  const deployment = parsePluginDeployment(
    JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@taucad/build123d/tau-plugin.json'), 'utf8')),
    '@taucad/build123d tau-plugin.json',
  );
  const indicators = detectHostIndicators();
  const selection =
    indicators === undefined
      ? undefined
      : selectVariant(deployment.dependencies['engine'] ?? [], indicators, { target: 'darwin-arm64' });
  return selection?.status === 'selected'
    ? selection.variant.payloads.reduce((sum, payload) => sum + payload.byteLength, 0)
    : undefined;
})();

/** One request the mirror answered, by blob. */
type MirrorRequest = { readonly hex: string; completed: boolean; closed: boolean };

/** A digest-addressed loopback mirror that streams each blob in small chunks and can hold one blob mid-stream. */
const startMirror = async () => {
  const blobs = new Map(Object.values(synthetic).map((bytes) => [hexOf(bytes), bytes]));
  const requests: MirrorRequest[] = [];
  let stalled: { readonly hex: string; readonly gate: PromiseWithResolvers<void> } | undefined;
  const server = createServer((request, response) => {
    const hex = /\/blobs\/sha256\/(?<hex>[\da-f]{64})$/u.exec(request.url ?? '')?.groups?.['hex'] ?? '';
    const bytes = blobs.get(hex);
    if (bytes === undefined) {
      response.writeHead(404).end();
      return;
    }
    const record: MirrorRequest = { hex, completed: false, closed: false };
    requests.push(record);
    response.once('close', () => {
      record.closed = true;
    });
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) });
    /* Sent in chunks with pauses, so a preparation reports progress more than once. */
    const stream = async (): Promise<void> => {
      const chunk = 16 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunk) {
        const hold = stalled?.hex === hex && offset > 0 ? stalled : undefined;
        if (hold !== undefined) {
          stalled = undefined;
          // oxlint-disable-next-line no-await-in-loop -- the stream waits where the test holds it.
          await hold.gate.promise;
        }
        if (record.closed) {
          return;
        }
        response.write(bytes.subarray(offset, offset + chunk));
        // oxlint-disable-next-line no-await-in-loop -- a slow link, so progress is reported more than once.
        await sleep(25);
      }
      response.end();
      record.completed = true;
    };
    void stream();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}/`,
    requests,
    /** Hold the next request for `hex` after its first chunk; resolve the returned gate to let it go on. */
    stall: (hex: string): PromiseWithResolvers<void> => {
      const gate = Promise.withResolvers<void>();
      stalled = { hex, gate };
      return gate;
    },
    close: async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

/** Poll `condition` every 50 ms for up to `limit` ms. */
const until = async (condition: () => boolean | Promise<boolean>, what: string, limit = 60_000): Promise<void> => {
  const deadline = performance.now() + limit;
  // oxlint-disable-next-line no-await-in-loop -- polling another process's effect.
  while (!(await condition())) {
    if (performance.now() > deadline) {
      throw new Error(`${what} did not happen within ${String(limit)} ms`);
    }
    // oxlint-disable-next-line no-await-in-loop -- ditto.
    await sleep(50);
  }
};

/** Every path under a folder, relative to it; empty when it does not exist. */
const entriesOf = async (folder: string): Promise<string[]> => {
  try {
    return await readdir(folder, { recursive: true });
  } catch {
    return [];
  }
};

/** The `kernelIssues` codes and details of an `evaluate_model` answer. */
const kernelIssuesOf = (result: CallToolResult): Array<{ code?: string; details?: Record<string, unknown> }> => {
  const content = result.structuredContent as {
    kernelIssues?: Array<{ code?: string; details?: Record<string, unknown> }>;
  };
  return content.kernelIssues ?? [];
};

describe('tau mcp native kernels (W5 tier 4a)', () => {
  let mirror: Awaited<ReturnType<typeof startMirror>>;
  let project = '';
  let rosterHook = '';

  /** The server environment for one payload store: the loopback mirror only, a forced darwin-arm64 target. */
  const nativeEnvironment = (configDirectory: string): Record<string, string> => {
    /* Built by assignment so no environment key is a source literal. */
    const env: Record<string, string> = {};
    env['TAU_CONFIG_DIR'] = configDirectory;
    env['TAU_PAYLOAD_MIRROR'] = mirror.url;
    env['TAU_PAYLOAD_MIRROR_NO_FALLBACK'] = '1';
    env['TAU_PAYLOAD_TARGET'] = 'darwin-arm64';
    env['TAU_ACQUISITION'] = '';
    env['TAU_PAYLOAD_DIR'] = '';
    /* A loopback mirror must bypass any proxy the runner sets (S7). */
    env['NO_PROXY'] = '127.0.0.1,localhost';
    env['no_proxy'] = '127.0.0.1,localhost';
    return env;
  };

  const callOn = async (
    client: Client,
    params: CallToolRequest['params'],
    options: {
      readonly onprogress?: (progress: { progress: number; total?: number }) => void;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<CallToolResult> =>
    CallToolResultSchema.parse(await client.callTool(params, undefined, { timeout: kernelCallLimit, ...options }));

  /** Keep a server's frame log where `TAU_TEST_FRAME_LOG_DIR` names, as the scenario's evidence. */
  const keepFrames = async (name: string, served: Served): Promise<void> => {
    const directory = process.env['TAU_TEST_FRAME_LOG_DIR'];
    if (directory === undefined || directory === '') {
      return;
    }
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${name}.frames.jsonl`),
      served
        .frames()
        .map((frame) => JSON.stringify(frame))
        .join('\n'),
    );
    await writeFile(join(directory, `${name}.mirror.json`), JSON.stringify(mirror.requests, undefined, 1));
  };

  beforeAll(async () => {
    mirror = await startMirror();
    disposers.push(mirror.close);
    project = join(scratch, 'native');
    await mkdir(project);
    await writeFile(
      join(project, 'main.py'),
      'from build123d import Box\n\n\ndef main():\n    return Box(10, 20, 30)\n',
    );
    await writeFile(join(project, 'main.cs'), 'using PicoGK;\n\npublic static class Model {}\n');
    await writeFile(join(project, 'main.ts'), files.block['main.ts']);
    const manifest = join(scratch, 'picogk-tau-plugin.json');
    await writeFile(manifest, JSON.stringify(syntheticManifest));
    rosterHook = join(scratch, 'native-roster.mjs');
    await writeFile(
      rosterHook,
      `import { registerHooks } from 'node:module';
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === '@taucad/picogk/tau-plugin.json'
      ? { url: ${JSON.stringify(pathToFileURL(manifest).href)}, format: "json", shortCircuit: true }
      : next(specifier, context),
});
`,
    );
  });

  describe('one server preparing PicoGK itself', () => {
    let served: Served;
    let client: Client;
    let store = '';

    beforeAll(async () => {
      store = await mkdtemp(join(tmpdir(), 'mcp-native-store-'));
      disposers.push(async () => rm(store, { recursive: true, force: true }));
      served = launch(project, undefined, {
        env: nativeEnvironment(store),
        imports: [pathToFileURL(rosterHook).href],
      });
      disposers.push(stopIfRunning(served));
      disposers.push(async () => keepFrames('prepare-in-server', served));
      client = new Client({ name: 'tau-mcp-integration-native', version: '1' });
      await connect(client, served);
    }, kernelCallLimit);

    it('should answer initialize and list prepare_kernel with its annotations before any download', async () => {
      const { tools } = await client.listTools();

      expect(tools.find(({ name }) => name === 'prepare_kernel')).toMatchObject({
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        inputSchema: { required: ['kernel'] },
      });
      const entries = await entriesOf(store);
      expect(mirror.requests).toEqual([]);
      expect(entries.filter((entry) => entry.includes('closures'))).toEqual([]);
    });

    it(
      'should refuse .py and .cs with KERNEL_NOT_PREPARED naming the exact call and the bytes it downloads',
      async () => {
        const python = await callOn(client, { name: 'evaluate_model', arguments: { targetFile: 'main.py' } });
        const csharp = await callOn(client, { name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });

        expect(build123dBytes).toBeGreaterThan(0);
        expect(kernelIssuesOf(python)[0]).toMatchObject({
          code: 'KERNEL_NOT_PREPARED',
          details: {
            kernel: 'build123d',
            package: '@taucad/build123d',
            extension: '.py',
            byteLength: build123dBytes,
            prepare: { tool: 'prepare_kernel', input: { kernel: 'build123d' } },
          },
        });
        expect(kernelIssuesOf(csharp)[0]).toMatchObject({
          code: 'KERNEL_NOT_PREPARED',
          details: {
            kernel: 'picogk',
            byteLength: syntheticBytes,
            prepare: { tool: 'prepare_kernel', input: { kernel: 'picogk' } },
          },
        });
        /* Read-only tools never download (I5). */
        expect(mirror.requests).toEqual([]);
      },
      kernelCallLimit,
    );

    it('should refuse an unknown kernel, naming the kernels that can be prepared', async () => {
      const result = await callOn(client, { name: 'prepare_kernel', arguments: { kernel: 'cadquery' } });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(
        "No native kernel is called 'cadquery'. Kernels that can be prepared: build123d, picogk, smlibpy.",
      );
    });

    it(
      'should keep the verified payloads of a cancelled preparation, so the next call fetches only the rest',
      async () => {
        const worker = hexOf(synthetic.worker);
        const dotnet = hexOf(synthetic.dotnet);
        const gate = mirror.stall(worker);
        const controller = new AbortController();
        const pending = callOn(
          client,
          { name: 'prepare_kernel', arguments: { kernel: 'picogk' } },
          { signal: controller.signal },
        );

        await until(
          () => mirror.requests.some((request) => request.hex === dotnet && request.completed),
          'the runtime payload download',
        );
        await until(() => mirror.requests.some((request) => request.hex === worker), 'the layer request');
        controller.abort();
        await expect(pending).rejects.toThrow();
        /* The server stops the held download: the cancellation reached its fetch. */
        await until(
          () => mirror.requests.some((request) => request.hex === worker && request.closed && !request.completed),
          'the layer download to stop',
          30_000,
        );
        gate.resolve();
        const cancelled = served
          .frames()
          .filter(({ direction }) => direction === 'client->server')
          .map(({ frame }) => JSON.parse(frame) as { method?: string })
          .filter(({ method }) => method === 'notifications/cancelled');
        expect(cancelled).toHaveLength(1);
        const kept = await entriesOf(store);
        expect(kept.some((entry) => entry.endsWith(dotnet))).toBe(true);
        expect(kept.filter((entry) => entry.includes('closures'))).toEqual([]);

        const progress: Array<{ progress: number; total?: number }> = [];
        const ready = await callOn(
          client,
          { name: 'prepare_kernel', arguments: { kernel: 'picogk' } },
          { onprogress: (report) => progress.push(report) },
        );

        expect(ready.isError ?? false, textOf(ready)).toBe(false);
        expect(ready.structuredContent).toMatchObject({
          status: 'ready',
          kernel: 'picogk',
          closureIntegrity: expect.stringMatching(/^sha256-[\w+/]+=*$/u) as string,
          treeIntegrity: expect.stringMatching(/^sha256-[\w+/]+=*$/u) as string,
        });
        expect(progress.length).toBeGreaterThanOrEqual(3);
        expect(progress.every(({ total }) => total === syntheticBytes)).toBe(true);
        for (const [index, report] of progress.entries()) {
          expect(report.progress).toBeGreaterThan(progress[index - 1]?.progress ?? 0);
        }
        /* The runtime payload was fetched once; only the layer, which was cut off, was fetched again. */
        expect(mirror.requests.filter(({ hex }) => hex === dotnet)).toHaveLength(1);
        expect(mirror.requests.filter(({ hex }) => hex === worker)).toHaveLength(2);
      },
      kernelCallLimit,
    );

    it(
      'should compose PicoGK from the prepared closure on the next call, and keep refusing Build123d',
      async () => {
        const csharp = await callOn(client, { name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });
        const python = await callOn(client, { name: 'evaluate_model', arguments: { targetFile: 'main.py' } });

        expect(kernelIssuesOf(csharp).map(({ code }) => code)).not.toContain('KERNEL_NOT_PREPARED');
        expect(await served.kernelModules()).toContainEqual(expect.stringMatching(/\/picogk\.kernel\.(?:ts|mjs|js)$/u));
        expect(kernelIssuesOf(python)[0]).toMatchObject({
          code: 'KERNEL_NOT_PREPARED',
          details: { kernel: 'build123d' },
        });
      },
      kernelCallLimit,
    );

    it(
      'G1: should make no request while a second server evaluates .cs and .ts on the warm store under TAU_ACQUISITION=locked',
      async () => {
        /* Warm the store here rather than rely on the tests above; on a sealed closure this is a no-op. */
        const warmed = await callOn(client, { name: 'prepare_kernel', arguments: { kernel: 'picogk' } });
        expect(warmed.structuredContent, textOf(warmed)).toMatchObject({ status: 'ready', kernel: 'picogk' });
        const tripwire = await fetchTripwire('g1-locked');
        const mirrorRequests = mirror.requests.length;
        const env = nativeEnvironment(store);
        env['TAU_ACQUISITION'] = 'locked';
        const locked = launch(project, undefined, {
          env,
          imports: [pathToFileURL(rosterHook).href, tripwire.specifier],
        });
        disposers.push(stopIfRunning(locked));
        const lockedClient = new Client({ name: 'tau-mcp-integration-native-g1', version: '1' });
        await connect(lockedClient, locked);

        const prepared = await callOn(lockedClient, { name: 'prepare_kernel', arguments: { kernel: 'picogk' } });
        const csharp = await callOn(lockedClient, { name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });
        const typescript = await callOn(lockedClient, { name: 'evaluate_model', arguments: { targetFile: 'main.ts' } });
        const python = await callOn(lockedClient, { name: 'evaluate_model', arguments: { targetFile: 'main.py' } });
        await keepFrames('g1-locked', locked);
        await lockedClient.close();

        expect(prepared.structuredContent, textOf(prepared)).toMatchObject({ status: 'ready', kernel: 'picogk' });
        expect(kernelIssuesOf(csharp).map(({ code }) => code)).not.toContain('KERNEL_NOT_PREPARED');
        expect(typescript.structuredContent, textOf(typescript)).toMatchObject({ status: 'ready' });
        expect(kernelIssuesOf(python)[0]).toMatchObject({
          code: 'KERNEL_NOT_PREPARED',
          details: { kernel: 'build123d' },
        });
        expect(await tripwire.fetched()).toEqual([]);
        expect(mirror.requests).toHaveLength(mirrorRequests);
      },
      kernelCallLimit,
    );
  });

  it(
    'should use a closure `tau prepare` sealed in another process on the next call, with no prepare_kernel',
    async () => {
      const store = await mkdtemp(join(tmpdir(), 'mcp-native-store-'));
      disposers.push(async () => rm(store, { recursive: true, force: true }));
      const env = nativeEnvironment(store);
      const served = launch(project, undefined, { env, imports: [pathToFileURL(rosterHook).href] });
      disposers.push(stopIfRunning(served));
      const client = new Client({ name: 'tau-mcp-integration-native-other', version: '1' });
      await connect(client, served);

      const before = await callOn(client, { name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });
      const prepared = await new Promise<{ code: number | undefined; stdout: string }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', '--import', pathToFileURL(rosterHook).href, binPath, 'prepare', 'picogk', '--json'],
          { cwd: repoRoot, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] },
        );
        let stdout = '';
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.once('error', reject);
        child.once('exit', (code) => {
          resolve({ code: code ?? undefined, stdout });
        });
      });
      const after = await callOn(client, { name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });
      await keepFrames('prepare-in-other-process', served);

      expect(kernelIssuesOf(before)[0]).toMatchObject({ code: 'KERNEL_NOT_PREPARED' });
      expect(prepared.code, prepared.stdout).toBe(0);
      expect(JSON.parse(prepared.stdout)).toMatchObject({ status: 'ready', kernel: 'picogk' });
      expect(kernelIssuesOf(after).map(({ code }) => code)).not.toContain('KERNEL_NOT_PREPARED');
      expect(
        served.frames().some(({ frame }) => frame.includes('"prepare_kernel"') && frame.includes('tools/call')),
      ).toBe(false);
      await client.close();
    },
    kernelCallLimit,
  );
});

/*
 * Tier 4b (W5, D30): the same server on a darwin-arm64 host with real bytes. Nothing is synthetic: the store starts
 * empty, `prepare_kernel` downloads each kernel's pinned closure from the origins its manifest names (Build123d's
 * CPython and wheels; Microsoft's .NET runtime and the published Tau PicoGK layer), and the next calls evaluate a real
 * `.py` and a real `.cs` model to geometry. Each model first tries to reach the network and fails its evaluation if it
 * can, and a loopback canary must see no connection: the worker keeps zero egress (I7). It downloads about 210 MB, so
 * it runs only where the `native-darwin` CI job opts in with `TAU_NATIVE_DARWIN=1`.
 */
const nativeDarwin =
  process.env['TAU_NATIVE_DARWIN'] === '1' && process.platform === 'darwin' && process.arch === 'arm64';

/** Milliseconds one real preparation may take: the download, the unpack, the seal and its `compileall`. */
const realPrepareLimit = 600_000;

/** A loopback listener the models try to reach; it counts every connection it accepts. */
const startCanary = async (): Promise<{ readonly port: number; readonly connections: () => number }> => {
  let connections = 0;
  const server = createServer((_request, response) => {
    response.writeHead(204).end();
  });
  server.on('connection', () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  disposers.push(
    async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  );
  return { port: (server.address() as AddressInfo).port, connections: () => connections };
};

/** A Build123d model that refuses to evaluate when its worker can open a socket to the network or the canary. */
const egressCheckedPython = (canaryPort: number): string => `import socket
from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def reachable():
    for address in (("1.1.1.1", 53), ("127.0.0.1", ${String(canaryPort)})):
        try:
            socket.create_connection(address, timeout=5).close()
            return "%s:%d" % address
        except Exception:
            pass
    return None


def main(params: Params):
    leak = reachable()
    if leak is not None:
        raise RuntimeError("worker egress allowed to " + leak)
    return Box(params.width, 20, 30)
`;

/** A PicoGK model, a 20 mm sphere, that refuses to evaluate when its worker can open a socket. */
const egressCheckedCsharp = (canaryPort: number): string => `using System;
using System.ComponentModel.DataAnnotations;
using System.Net.Sockets;
using System.Numerics;
using PicoGK;

var leak = Egress.Reachable();
if (leak.Length > 0)
{
    throw new InvalidOperationException("worker egress allowed to " + leak);
}

Library.Go(Params.VoxelSizeMm, () =>
{
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, Params.RadiusMm));
});

public static class Params
{
    [Range(0.05, 5.0)]
    public static float VoxelSizeMm { get; set; } = 1.0f;

    [Range(1.0, 100.0)]
    public static float RadiusMm { get; set; } = 20.0f;
}

public static class Egress
{
    public static string Reachable()
    {
        foreach (var (host, port) in new[] { ("1.1.1.1", 53), ("127.0.0.1", ${String(canaryPort)}) })
        {
            try
            {
                using var client = new TcpClient();
                if (client.ConnectAsync(host, port).Wait(5000))
                {
                    return host + ":" + port;
                }
            }
            catch (Exception)
            {
            }
        }
        return "";
    }
}
`;

/** The exported GLB's bounding-box extents in metres, smallest first, so the check does not depend on axis order. */
const sortedExtents = async (glb: Uint8Array<ArrayBuffer>): Promise<number[]> => {
  const bounds = getBoundingBoxFromInspect(await getInspectReport(glb));
  return [...(bounds?.size ?? [])].toSorted((left, right) => left - right);
};

describe.runIf(nativeDarwin)('tau mcp native kernels on darwin-arm64 (W5 tier 4b, native-darwin)', () => {
  let served: Served;
  let client: Client;
  let store = '';
  let project = '';
  let canary: Awaited<ReturnType<typeof startCanary>>;

  const callOn = async (
    params: CallToolRequest['params'],
    options: {
      readonly onprogress?: (progress: { progress: number; total?: number }) => void;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<CallToolResult> =>
    CallToolResultSchema.parse(await client.callTool(params, undefined, { timeout: realPrepareLimit, ...options }));

  /**
   * Built by assignment so no environment key is a source literal. The rest of the managed profile is cleared: the
   * manifests' own origins, this host's target, this suite's store.
   */
  const darwinEnvironment = (acquisition: '' | 'locked'): Record<string, string> => {
    const env: Record<string, string> = {};
    env['TAU_CONFIG_DIR'] = store;
    env['TAU_ACQUISITION'] = acquisition;
    env['TAU_PAYLOAD_DIR'] = '';
    env['TAU_PAYLOAD_MIRROR'] = '';
    env['TAU_PAYLOAD_MIRROR_NO_FALLBACK'] = '';
    env['TAU_PAYLOAD_TARGET'] = '';
    return env;
  };

  const closuresIn = async (): Promise<string[]> => {
    const entries = await entriesOf(store);
    return entries.filter((entry) => /(?:^|\/)closures\/sha256\/[\da-f]{64}\/receipt\.json$/u.test(entry));
  };

  beforeAll(async () => {
    canary = await startCanary();
    project = join(scratch, 'native-darwin');
    await mkdir(project);
    await writeFile(join(project, 'main.py'), egressCheckedPython(canary.port));
    await writeFile(join(project, 'main.cs'), egressCheckedCsharp(canary.port));
    await writeFile(join(project, 'main.ts'), files.block['main.ts']);
    store = await mkdtemp(join(tmpdir(), 'mcp-native-darwin-store-'));
    disposers.push(async () => rm(store, { recursive: true, force: true }));
    served = launch(project, undefined, { env: darwinEnvironment('') });
    disposers.push(stopIfRunning(served));
    disposers.push(async () => {
      const directory = process.env['TAU_TEST_FRAME_LOG_DIR'];
      if (directory !== undefined && directory !== '') {
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, 'native-darwin-mcp.frames.jsonl'),
          served
            .frames()
            .map((frame) => JSON.stringify(frame))
            .join('\n'),
        );
      }
    });
    client = new Client({ name: 'tau-mcp-integration-native-darwin', version: '1' });
    await connect(client, served);
  }, kernelCallLimit);

  it(
    'should refuse .py and .cs with KERNEL_NOT_PREPARED from an empty store',
    async () => {
      const python = await callOn({ name: 'evaluate_model', arguments: { targetFile: 'main.py' } });
      const csharp = await callOn({ name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });

      expect(kernelIssuesOf(python)[0]).toMatchObject({
        code: 'KERNEL_NOT_PREPARED',
        details: { kernel: 'build123d', prepare: { tool: 'prepare_kernel', input: { kernel: 'build123d' } } },
      });
      expect(kernelIssuesOf(csharp)[0]).toMatchObject({
        code: 'KERNEL_NOT_PREPARED',
        details: { kernel: 'picogk', prepare: { tool: 'prepare_kernel', input: { kernel: 'picogk' } } },
      });
      expect(await closuresIn()).toEqual([]);
    },
    kernelCallLimit,
  );

  it(
    'should stop a real download when the client cancels, leaving no closure',
    async ({ annotate }) => {
      const controller = new AbortController();
      const firstProgress = Promise.withResolvers<void>();
      const pending = callOn(
        { name: 'prepare_kernel', arguments: { kernel: 'build123d' } },
        {
          signal: controller.signal,
          onprogress: () => {
            firstProgress.resolve();
          },
        },
      );
      await firstProgress.promise;
      const cancelledAt = performance.now();
      controller.abort();

      await expect(pending).rejects.toThrow();
      await annotate(`cancelled ${String(Math.round(performance.now() - cancelledAt))} ms after the first progress`);
      const cancelled = served
        .frames()
        .filter(({ direction }) => direction === 'client->server')
        .map(({ frame }) => JSON.parse(frame) as { method?: string })
        .filter(({ method }) => method === 'notifications/cancelled');
      expect(cancelled).toHaveLength(1);
      /* No wait for the cancelled attempt to wind down: the next test prepares at once, in a fresh attempt. */
      expect(await closuresIn()).toEqual([]);
    },
    realPrepareLimit,
  );

  for (const kernel of ['build123d', 'picogk'] as const) {
    it(
      `should prepare ${kernel} from its pinned origins with one prepare_kernel, reporting progress`,
      async ({ annotate }) => {
        const progress: Array<{ progress: number; total?: number }> = [];
        const sealedBefore = await closuresIn();
        const started = performance.now();
        const ready = await callOn(
          { name: 'prepare_kernel', arguments: { kernel } },
          { onprogress: (report) => progress.push(report) },
        );
        await annotate(`${kernel} prepared in ${String(Math.round(performance.now() - started))} ms`);

        expect(ready.isError ?? false, textOf(ready)).toBe(false);
        expect(ready.structuredContent).toMatchObject({
          status: 'ready',
          kernel,
          closureIntegrity: expect.stringMatching(/^sha256-[\w+/]+=*$/u) as string,
          treeIntegrity: expect.stringMatching(/^sha256-[\w+/]+=*$/u) as string,
        });
        expect(progress.length).toBeGreaterThanOrEqual(3);
        for (const [step, report] of progress.entries()) {
          expect(report.progress).toBeGreaterThanOrEqual(progress[step - 1]?.progress ?? 0);
        }
        /* The preparation sealed new closures into the store. */
        const sealedAfter = await closuresIn();
        expect(sealedAfter.length).toBeGreaterThan(sealedBefore.length);
      },
      realPrepareLimit,
    );
  }

  it(
    'should evaluate the .py model with Build123d and export its 10 x 20 x 30 mm box',
    async ({ annotate }) => {
      const started = performance.now();
      const evaluated = await callOn({ name: 'evaluate_model', arguments: { targetFile: 'main.py' } });
      await annotate(`main.py evaluated in ${String(Math.round(performance.now() - started))} ms`);
      expect(evaluated.structuredContent, textOf(evaluated)).toMatchObject({ status: 'ready' });
      expect(kernelIssuesOf(evaluated)).toEqual([]);

      const exported = await callOn({ name: 'export_model', arguments: { targetFile: 'main.py', to: 'glb' } });
      expect(exported.isError ?? false, textOf(exported)).toBe(false);
      const artifactPath = (exported.structuredContent as { files?: Array<{ artifactPath: string }> } | undefined)
        ?.files?.[0]?.artifactPath;
      const glb = new Uint8Array(await readFile(join(project, artifactPath ?? '')));

      expect(await sortedExtents(glb)).toEqual([
        expect.closeTo(0.01, 6),
        expect.closeTo(0.02, 6),
        expect.closeTo(0.03, 6),
      ]);
    },
    kernelCallLimit,
  );

  it(
    'should evaluate the .cs model with PicoGK and export its 40 mm sphere',
    async ({ annotate }) => {
      const started = performance.now();
      const evaluated = await callOn({ name: 'evaluate_model', arguments: { targetFile: 'main.cs' } });
      await annotate(`main.cs evaluated in ${String(Math.round(performance.now() - started))} ms`);
      expect(evaluated.structuredContent, textOf(evaluated)).toMatchObject({ status: 'ready' });
      expect(kernelIssuesOf(evaluated)).toEqual([]);

      const exported = await callOn({ name: 'export_model', arguments: { targetFile: 'main.cs', to: 'glb' } });
      expect(exported.isError ?? false, textOf(exported)).toBe(false);
      const artifactPath = (exported.structuredContent as { files?: Array<{ artifactPath: string }> } | undefined)
        ?.files?.[0]?.artifactPath;
      const glb = new Uint8Array(await readFile(join(project, artifactPath ?? '')));

      /* A voxel sphere of radius 20 mm at 1 mm voxels: 40 mm across within a voxel either way. */
      const extents = await sortedExtents(glb);
      expect(extents).toHaveLength(3);
      for (const extent of extents) {
        expect(extent).toBeGreaterThan(0.038);
        expect(extent).toBeLessThan(0.042);
      }
    },
    kernelCallLimit,
  );

  it(
    'G1: should evaluate .py, .cs and .ts with no request from a second server on the warm store under TAU_ACQUISITION=locked',
    async () => {
      const tripwire = await fetchTripwire('g1-native-darwin');
      const locked = launch(project, undefined, { env: darwinEnvironment('locked'), imports: [tripwire.specifier] });
      disposers.push(stopIfRunning(locked));
      const lockedClient = new Client({ name: 'tau-mcp-integration-native-darwin-g1', version: '1' });
      await connect(lockedClient, locked);

      const results: Array<[string, CallToolResult]> = [];
      for (const targetFile of ['main.py', 'main.cs', 'main.ts']) {
        // oxlint-disable-next-line no-await-in-loop -- one server, one evaluation at a time.
        const evaluated = await lockedClient.callTool(
          { name: 'evaluate_model', arguments: { targetFile } },
          undefined,
          { timeout: kernelCallLimit },
        );
        results.push([targetFile, CallToolResultSchema.parse(evaluated)]);
      }
      await lockedClient.close();

      for (const [targetFile, evaluated] of results) {
        expect(evaluated.structuredContent, `${targetFile}: ${textOf(evaluated)}`).toMatchObject({ status: 'ready' });
        expect(kernelIssuesOf(evaluated), targetFile).toEqual([]);
      }
      expect(await tripwire.fetched()).toEqual([]);
    },
    kernelCallLimit * 3,
  );

  it('should keep both workers from reaching the network or the loopback canary', () => {
    expect(canary.connections()).toBe(0);
  });
});
