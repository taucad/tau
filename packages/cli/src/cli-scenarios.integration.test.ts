/**
 * The CLI headless scenarios T1–T12 (charter D29, W17; readiness lane C1 § A6) against the real built binary: tier 5,
 * `cli:test` after `cli:build`. Each `describe` names its scenario. Every process starts from an empty config
 * directory and home, so nothing a developer machine holds is visible to it, and no scenario reaches the network
 * except where it says so.
 *
 * Scenarios owned by another surface are named here and proved there: T3's desktop hand-off and T8 in `apps/ui-e2e`
 * and `apps/desktop-e2e` (W18), T9 in `apps/ui-e2e/src/support/serve-ui-build.test.ts`, the published closure of T1 in
 * `scripts/src/check-pack-install.ts`, and the prepare-then-export half of T6 in
 * `build123d-export.integration.test.ts` (each payload fetched once from a no-fallback mirror).
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { validateGlbData } from '@taucad/runtime-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../..');
const cliBinPath = resolvePath(repoRoot, 'packages/cli/dist/bin/tau.mjs');
const examplesRoot = resolvePath(repoRoot, 'libs/tau-examples/src/kernels');

/** What one run of the built `tau` produced. */
type Run = { readonly code: number | undefined; readonly stdout: string; readonly stderr: string };

let scratch = '';

/**
 * The environment every scenario runs in: an empty home and config directory, no managed profile, and no CI opener.
 *
 * @param extra - Variables this scenario adds.
 * @returns The child environment.
 */
const isolated = (extra: Readonly<Record<string, string>> = {}): Record<string, string> => {
  /* Built by assignment so no environment key is a source literal. */
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  env['HOME'] = join(scratch, 'home');
  env['TAU_CONFIG_DIR'] = join(scratch, 'config');
  env['XDG_CONFIG_HOME'] = join(scratch, 'home', '.config');
  env['XDG_CACHE_HOME'] = join(scratch, 'home', '.cache');
  env['XDG_DATA_HOME'] = join(scratch, 'home', '.local', 'share');
  env['TAU_ACQUISITION'] = '';
  env['TAU_PAYLOAD_DIR'] = '';
  env['TAU_PAYLOAD_MIRROR'] = '';
  env['TAU_HOST_RELAY_URL'] = '';
  env['TAU_HOST_UI_DIR'] = '';
  env['TAU_HOST_AGENT_PORT'] = '';
  env['NX_PREFER_NODE_STRIP_TYPES'] = 'true';
  env['CI'] = 'true';
  return { ...env, ...extra };
};

/** The argv that runs the built binary; the workspace's `@taucad/*` export TypeScript source, so it needs a loader. */
const binArguments = (args: readonly string[]): string[] => [
  '--import',
  '@oxc-node/core/register',
  cliBinPath,
  ...args,
];

/**
 * Run the built `tau` to completion.
 *
 * @param args - Its arguments.
 * @param options - Environment additions and a working directory.
 * @returns Its exit code and output.
 */
const tau = async (
  args: readonly string[],
  options: {
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
    readonly runTimeout?: number;
  } = {},
): Promise<Run> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, binArguments(args), {
      cwd: options.cwd ?? repoRoot,
      env: isolated(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.runTimeout ?? 300_000);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? undefined, stdout, stderr });
    });
  });

/** A long-running `tau` whose stdout is watched as it arrives. */
type Running = {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stdout: () => string;
  readonly stderr: () => string;
  readonly firstLine: Promise<string>;
  readonly exited: Promise<number | undefined>;
  stop(): Promise<number | undefined>;
};

const start = (args: readonly string[], env: Readonly<Record<string, string>> = {}): Running => {
  const child = spawn(process.execPath, binArguments(args), { cwd: repoRoot, env: isolated(env), stdio: 'pipe' });
  let stdout = '';
  let stderr = '';
  const firstLine = Promise.withResolvers<string>();
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
    const newline = stdout.indexOf('\n');
    if (newline !== -1) {
      firstLine.resolve(stdout.slice(0, newline));
    }
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = new Promise<number | undefined>((resolve) => {
    child.once('exit', (code) => {
      firstLine.reject(new Error(`tau exited ${String(code)} before printing a line:\n${stderr}`));
      resolve(code ?? undefined);
    });
  });
  return {
    child,
    stdout: () => stdout,
    stderr: () => stderr,
    firstLine: firstLine.promise,
    exited,
    async stop() {
      if (child.exitCode === null) {
        child.kill('SIGINT');
      }
      return exited;
    },
  };
};

const replicadBox = "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n";
const build123dBox = 'from build123d import Box\n\nresult = Box(10, 20, 30)\n';
const picogkSphere = `using PicoGK;

public static class Model
{
    public static Voxels Main() => new Voxels(Utils.mshCreateCube(new BBox3(-5, -5, -5, 5, 5, 5)));
}
`;

/** A GeoSpec suite with one passing and, when asked, one failing test over a 20 x 10 x 4 mm block. */
const geoSpecProject = async (directory: string, failing: boolean): Promise<void> => {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'block.ts'),
    "import { drawRectangle } from 'replicad';\n\nexport default function main() {\n  return drawRectangle(20, 10).sketchOnPlane('XY').extrude(4);\n}\n",
  );
  await writeFile(
    join(directory, 'block.geospec.ts'),
    `import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

describe('block', () => {
  it('is 20 x 10 x 4 mm', async () => {
    const model = await loadModel({ file: 'block.ts', format: 'step' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 20, y: 10, z: 4 }, tolerance: 0.001 });
  });
${
  failing
    ? `  it('is 21 mm long', async () => {
    const model = await loadModel({ file: 'block.ts', format: 'step' });
    expectGeo(model).toHaveBoundingBox({ size: { x: 21, y: 10, z: 4 }, tolerance: 0.001 });
  });
`
    : ''
}});
`,
  );
};

/** The one JSON record a `--json` run printed. */
const recordOf = (run: Run): Record<string, unknown> => {
  const lines = run.stdout.trim().split('\n').filter(Boolean);
  expect(lines, `${run.stdout}\n${run.stderr}`).toHaveLength(1);
  return JSON.parse(lines[0]!) as Record<string, unknown>;
};

/** Hold a loopback port so a scenario can watch `tau serve` move past it. */
const holdPort = async (): Promise<Server & { port: number }> => {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  return Object.assign(server, { port: (server.address() as AddressInfo).port });
};

beforeAll(async () => {
  if (!existsSync(cliBinPath)) {
    throw new Error(`${cliBinPath} is missing: run \`pnpm nx test cli\`, which builds the CLI first.`);
  }
  scratch = await mkdtemp(join(tmpdir(), 'tau-cli-scenarios-'));
  await mkdir(join(scratch, 'home'), { recursive: true });
  await mkdir(join(scratch, 'config'), { recursive: true });
  const project = join(scratch, 'project');
  await mkdir(project);
  await writeFile(join(project, 'tau.json'), '{}\n');
  await writeFile(join(project, 'main.ts'), replicadBox);
  await writeFile(join(project, 'main.py'), build123dBox);
  await writeFile(join(project, 'main.cs'), picogkSphere);
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const project = (): string => join(scratch, 'project');

describe('T1 — a fresh machine exports a model', () => {
  it('should export a GLB from an empty config directory and home', async () => {
    const output = join(scratch, 't1.glb');
    const run = await tau(['export', join(project(), 'main.ts'), '--ext=glb', `--output=${output}`]);

    expect(run.code, run.stderr).toBe(0);
    validateGlbData(new Uint8Array(await readFile(output)));
  });
});

describe('T2 — tau serve prints one URL and answers', () => {
  it('should serve a folder with no relay and no --trust-projects, printing its URL once on stdout', async () => {
    const served = start(['serve', project(), '--print', '--port=0', '--no-external-agents']);
    try {
      const url = await served.firstLine;
      const descriptor = await fetch(new URL('/.well-known/tau-host', url));

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/u);
      expect(descriptor.status).toBe(200);
      expect(await descriptor.json()).toMatchObject({ v: 1, agent: true });
      expect(served.stdout().trim().split('\n')).toEqual([url]);
      expect(served.stderr()).not.toContain('Pair Tau Host');
    } finally {
      await served.stop();
    }
  });

  it('should print one serve record under --json and nothing else on stdout', async () => {
    const run = await tau(['serve', project(), '--json', '--smoke-test', '--port=0', '--no-external-agents']);

    expect(run.code, run.stderr).toBe(0);
    expect(recordOf(run)).toMatchObject({
      v: 1,
      kind: 'serve',
      ok: true,
      relay: null,
      ui: false,
      workspace: project(),
    });
    expect(run.stdout.match(/http:\/\/127\.0\.0\.1:\d+\//gu)).toHaveLength(1);
  });
});

describe('T2b — tau serve --allowed-origins (S32 website cell, X32)', () => {
  it('should grant a listed origin the descriptor across origins and nothing to another', async () => {
    const served = start([
      'serve',
      project(),
      '--print',
      '--port=0',
      '--no-external-agents',
      '--allowed-origins=https://tau.new,http://localhost:3000',
    ]);
    try {
      const url = await served.firstLine;
      const listed = await fetch(new URL('/.well-known/tau-host', url), {
        headers: { origin: 'http://localhost:3000' },
      });
      const unlisted = await fetch(new URL('/.well-known/tau-host', url), {
        headers: { origin: 'https://evil.example' },
      });

      expect(listed.status).toBe(200);
      expect(listed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(unlisted.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await served.stop();
    }
  });

  it('should refuse a wildcard as a usage error', async () => {
    const run = await tau(['serve', project(), '--smoke-test', '--port=0', '--allowed-origins=*']);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain('--allowed-origins takes exact origins');
  });
});

describe('T3 — tau open --desktop (best effort until the W18 hand-off)', () => {
  it('should fall back to the browser URL and say why the desktop cannot take a served folder', async () => {
    const ui = join(scratch, 'ui');
    await mkdir(ui, { recursive: true });
    await writeFile(join(ui, 'index.html'), '<!doctype html><title>Tau</title>');
    const opened = start(['open', project(), '--desktop', '--print', `--ui=${ui}`, '--port=0']);
    try {
      const url = await opened.firstLine;

      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/u);
      expect(opened.stderr()).toContain('Tau Desktop cannot open a served folder');
    } finally {
      await opened.stop();
    }
  });
});

describe('T4 — tau open of a Tau URL', () => {
  it('should print a website URL without opening it', async () => {
    const run = await tau(['open', 'https://tau.new/w/workspace/project', '--print']);

    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toBe('https://tau.new/w/workspace/project\n');
  });

  it('should refuse to open a folder with no UI to show it in, naming --ui', async () => {
    const run = await tau(['open', project(), '--print']);

    expect(run.code).toBe(3);
    expect(run.stderr).toContain('--ui');
    expect(run.stdout).toBe('');
  });
});

describe('T5 — offline', () => {
  it('should export with every network route refused', async () => {
    const output = join(scratch, 't5.glb');
    const run = await tau(['export', join(project(), 'main.ts'), '--ext=glb', `--output=${output}`], {
      /* eslint-disable @typescript-eslint/naming-convention -- environment variable names */
      env: { HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NODE_USE_ENV_PROXY: '1' },
      /* eslint-enable @typescript-eslint/naming-convention -- end environment variable names */
    });

    expect(run.code, run.stderr).toBe(0);
    validateGlbData(new Uint8Array(await readFile(output)));
  });

  it('should keep serving through an unreachable relay, warning rather than dying', async () => {
    const run = await tau(
      [
        'serve',
        project(),
        '--relay=http://127.0.0.1:1',
        '--trust-projects',
        '--smoke-test',
        '--port=0',
        '--no-external-agents',
      ],
      { runTimeout: 120_000 },
    );

    /* Exit 0 is the smoke test's pass: the descriptor answered while pairing kept failing. */
    expect(run.code, run.stderr).toBe(0);
    expect(run.stderr).toContain('Retrying pairing with http://127.0.0.1:1');
  });

  it('should refuse a relay without --trust-projects as a usage error', async () => {
    const run = await tau(['serve', project(), '--relay=http://127.0.0.1:1', '--port=0']);

    expect(run.code).toBe(2);
    expect(run.stderr).toContain('--trust-projects');
  });
});

describe('T6 — a native kernel that is not prepared', () => {
  it('should refuse tau export main.py with exit 3 naming tau prepare build123d, and write nothing', async () => {
    const output = join(scratch, 't6.glb');
    const run = await tau(['export', join(project(), 'main.py'), '--ext=glb', `--output=${output}`]);

    expect(run.code).toBe(3);
    expect(run.stderr).toContain('tau prepare build123d');
    expect(existsSync(output)).toBe(false);
  });

  it('should refuse tau check main.py and main.cs with exit 3 and a typed record', async () => {
    const python = await tau(['check', join(project(), 'main.py'), '--json']);
    const csharp = await tau(['check', join(project(), 'main.cs'), '--json']);

    expect(python.code).toBe(3);
    const pythonRecord = recordOf(python);
    const [pythonIssue] = pythonRecord['issues'] as Array<{ code: string; message: string }>;
    expect(pythonRecord).toMatchObject({ kind: 'evaluation', status: 'refused' });
    expect(pythonIssue?.code).toBe('KERNEL_NOT_PREPARED');
    expect(pythonIssue?.message).toContain('tau prepare build123d');
    expect(csharp.code).toBe(3);
    /* PicoGK runs on darwin-arm64 only (D13): elsewhere the refusal is the unsupported target, not preparation. */
    const [csharpIssue] = recordOf(csharp)['issues'] as Array<{ code: string }>;
    expect(csharpIssue?.code).toBe(
      process.platform === 'darwin' && process.arch === 'arm64' ? 'KERNEL_NOT_PREPARED' : 'KERNEL_CAPABILITY_MISSING',
    );
  });

  it('should answer MCP evaluate_model on main.py with the typed refusal', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: binArguments(['mcp', `--project=${project()}`]),
      cwd: repoRoot,
      env: isolated(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'tau-cli-scenarios', version: '1' });
    await client.connect(transport);
    try {
      const result = CallToolResultSchema.parse(
        await client.callTool({ name: 'evaluate_model', arguments: { targetFile: 'main.py' } }, undefined, {
          timeout: 120_000,
        }),
      );
      const content = result.structuredContent as { status?: string; kernelIssues?: Array<{ code?: string }> };

      expect(content.status).toBe('error');
      expect(content.kernelIssues?.[0]?.code).toBe('KERNEL_NOT_PREPARED');
    } finally {
      await client.close();
    }
  });
});

describe('T7 — export formats', () => {
  it('should stream exactly one artifact to stdout with --output -', async () => {
    const run = await new Promise<{ code: number | undefined; bytes: Uint8Array<ArrayBuffer> }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        binArguments(['export', join(project(), 'main.ts'), '--ext=stl', '--output=-']),
        { cwd: repoRoot, env: isolated(), stdio: ['ignore', 'pipe', 'ignore'] },
      );
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
      child.once('error', reject);
      child.once('exit', (code) => {
        resolve({ code: code ?? undefined, bytes: Buffer.concat(chunks) });
      });
    });

    expect(run.code).toBe(0);
    /* A binary STL: an 80-byte header, a triangle count, then 50 bytes per triangle and nothing after. */
    const triangles = new DataView(run.bytes.buffer, run.bytes.byteOffset, run.bytes.byteLength).getUint32(80, true);
    expect(triangles).toBeGreaterThan(0);
    expect(run.bytes.byteLength).toBe(84 + triangles * 50);
  });
});

describe('T10 — MCP over stdio from the built binary', () => {
  it('should answer initialize and list the CAD tools', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: binArguments(['mcp', `--project=${project()}`]),
      cwd: repoRoot,
      env: isolated(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'tau-cli-scenarios', version: '1' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();

      expect(client.getServerVersion()?.name).toBe('@taucad/mcp');
      expect(tools.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['evaluate_model', 'export_model', 'prepare_kernel']),
      );
    } finally {
      await client.close();
    }
  });
});

describe('T11 — tau check and tau test in CI', () => {
  it('should classify every libs/tau-examples fixture with the three exit codes, one record each', async () => {
    type Entry = { kernel: string; name: string; mainFile?: string; files: string[] };
    const manifest = JSON.parse(
      await readFile(resolvePath(repoRoot, 'libs/tau-examples/src/manifest.json'), 'utf8'),
    ) as Entry[];
    const broken = join(scratch, 'broken');
    await mkdir(broken, { recursive: true });
    /* A kernel is chosen by the model's imports, so the synthetic error imports one and then throws. */
    await writeFile(
      join(broken, 'main.ts'),
      "import { primitives } from '@jscad/modeling';\nexport default function main() {\n  if (primitives) throw new Error('a model error');\n  return primitives;\n}\n",
    );
    const inputs = [
      ...manifest.map((entry) => ({
        label: `${entry.kernel}/${entry.name}`,
        file: join(
          examplesRoot,
          entry.kernel,
          entry.name,
          entry.mainFile ?? entry.files.find((file) => file.startsWith('test-exports/')) ?? '',
        ),
      })),
      { label: 'synthetic/model-error', file: join(broken, 'main.ts') },
    ];
    const statusExit: Record<string, number> = { ok: 0, error: 1, refused: 3 };
    const outcomes: Array<{ label: string; code: number | undefined; status: unknown }> = [];
    const queue = [...inputs];
    const worker = async (): Promise<void> => {
      for (let input = queue.shift(); input !== undefined; input = queue.shift()) {
        // oxlint-disable-next-line no-await-in-loop -- a bounded pool drains the queue.
        const run = await tau(['check', input.file, '--json']);
        let status: unknown;
        try {
          ({ status } = recordOf(run));
        } catch {
          status = `unparsed: ${run.stderr.slice(-400)}`;
        }
        outcomes.push({ label: input.label, code: run.code, status });
      }
    };
    await Promise.all(Array.from({ length: Math.max(2, Math.min(4, availableParallelism() - 1)) }, worker));

    /* Evidence: one line per fixture where the run asks for it. */
    const log = process.env['TAU_CLI_SCENARIO_LOG'];
    if (log !== undefined && log !== '') {
      await writeFile(
        log,
        outcomes
          .toSorted((left, right) => left.label.localeCompare(right.label))
          .map(({ label, code, status }) => `${String(code)} ${String(status)} ${label}`)
          .join('\n'),
      );
    }
    const unclassified = outcomes.filter(
      ({ code, status }) =>
        typeof status !== 'string' || statusExit[status] === undefined || statusExit[status] !== code,
    );
    expect(unclassified).toEqual([]);
    expect(outcomes).toHaveLength(inputs.length);
    expect(new Set(outcomes.map(({ code }) => code))).toEqual(new Set([0, 1, 3]));
    expect(outcomes.find(({ label }) => label === 'synthetic/model-error')?.code).toBe(1);
    expect(outcomes.filter(({ label }) => /^(?:build123d|picogk)\//u.test(label)).every(({ code }) => code === 3)).toBe(
      true,
    );
  }, 1_800_000);

  it('should exit 0 when every GeoSpec test passes and 1 with a failure, one record each', async () => {
    const passing = join(scratch, 'geospec-pass');
    const failing = join(scratch, 'geospec-fail');
    await geoSpecProject(passing, false);
    await geoSpecProject(failing, true);

    const passed = await tau(['test', passing, '--json']);
    const failed = await tau(['test', failing, '--json']);

    expect(passed.code, passed.stderr).toBe(0);
    expect(recordOf(passed)).toMatchObject({ kind: 'test', ok: true, status: 'passed', passed: 1, failed: 0 });
    expect(failed.code, failed.stderr).toBe(1);
    expect(recordOf(failed)).toMatchObject({ kind: 'test', ok: false, status: 'failed', passed: 1, failed: 1 });
  });

  it('should refuse with exit 3 when a project has no GeoSpec suite', async () => {
    const run = await tau(['test', project()]);

    expect(run.code).toBe(3);
    expect(run.stderr).toContain('No GeoSpec suite');
  });
});

describe('T12 — serve start-and-exit and port semantics', () => {
  it('should move past a taken port, and refuse it under --strict-port', async () => {
    const held = await holdPort();
    try {
      const moved = await tau([
        'serve',
        project(),
        '--json',
        '--smoke-test',
        `--port=${String(held.port)}`,
        '--no-external-agents',
      ]);
      const strict = await tau([
        'serve',
        project(),
        '--smoke-test',
        `--port=${String(held.port)}`,
        '--strict-port',
        '--no-external-agents',
      ]);

      expect(moved.code, moved.stderr).toBe(0);
      const url = new URL(String(recordOf(moved)['url']));
      expect(Number(url.port)).toBeGreaterThan(held.port);
      expect(strict.code).toBe(3);
      expect(strict.stderr).toContain('--strict-port');
    } finally {
      held.close();
    }
  });
});
