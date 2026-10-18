/**
 * `tau mcp`'s thread bookkeeping, in process: the host's tool registry and the
 * runtime are stand-ins, so a tool call can pause between two operations for
 * as long as the test likes. The real server is driven over stdio in
 * `mcp.integration.test.ts`.
 */

import { PassThrough } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import { runCommand } from 'citty';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Host from '@taucad/host';
import { createHostToolRegistry } from '@taucad/host/agent-tools';
import type { HostRuntimeClient, HostToolRegistryOptions } from '@taucad/host/agent-tools';
import type * as Runtime from '@taucad/runtime';

/** What each tool call does with its project's runtime; set by a test. */
const toolBody = vi.hoisted(() => ({
  run: async (_runtimeClient: (root: string) => Promise<HostRuntimeClient>): Promise<void> => undefined,
}));
const serveLocalHostMcp = vi.hoisted(() =>
  vi.fn(async (_options: Host.LocalHostMcpOptions) => ({ server: { server: {} }, close: async () => undefined })),
);
/* One call per thread the server starts. */
const createRuntimeClient = vi.hoisted(() =>
  vi.fn(() => ({
    lifecycleState: 'connected',
    describe: async () => ({ kernelId: 'fixture' }),
    shutdown: async () => undefined,
  })),
);

vi.mock('@taucad/host', async (importOriginal) => ({
  ...(await importOriginal<typeof Host>()),
  serveLocalHostMcp,
}));
vi.mock('@taucad/host/agent-tools', () => ({
  createHostToolRegistry: vi.fn((options: HostToolRegistryOptions) => ({
    list: () => [],
    invoke: async () => {
      if (options.runtimeClient !== undefined) {
        await toolBody.run(options.runtimeClient);
      }
      return { status: 'success', output: null };
    },
  })),
}));
vi.mock('@taucad/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof Runtime>()),
  createRuntimeClient,
}));
const exitNow = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#exit-now.js', () => ({ exitNow }));
vi.mock('@taucad/runtime/transport/node', () => ({ nodeWorkerTransport: vi.fn(() => ({})) }));
vi.mock('@taucad/runtime/filesystem/node', () => ({ fromNodeFs: vi.fn(() => ({})) }));

const importMcpCommand = async () => {
  const { mcpCommand } = await import('#commands/mcp.js');
  return mcpCommand;
};

describe('mcpCommand', () => {
  const stdoutWrite = process.stdout.write;
  const { log, info, debug } = console;
  const signalListeners = new Map(
    (['SIGINT', 'SIGTERM'] as const).map((signal) => [signal, process.listeners(signal)] as const),
  );

  /**
   * Start `tau mcp` in this process and wait for it to serve.
   *
   * @param rawArgs - Its options.
   * @returns The registry and checkouts it serves, and a stop that waits for its exit.
   */
  const serve = async (rawArgs: readonly string[]) => {
    const mcpCommand = await importMcpCommand();
    const running = runCommand(mcpCommand, { rawArgs: [...rawArgs] });
    const [served] = await vi.waitFor(() => {
      const call = serveLocalHostMcp.mock.calls.at(-1);
      if (call === undefined) {
        throw new Error('tau mcp is not serving yet');
      }
      return call;
    });
    return {
      ...served,
      stop: async (): Promise<void> => {
        process.emit('SIGTERM');
        await running;
        expect(exitNow).toHaveBeenCalledWith(0);
      },
    };
  };

  afterEach(() => {
    process.stdout.write = stdoutWrite;
    Object.assign(console, { log, info, debug });
    for (const [signal, kept] of signalListeners) {
      for (const listener of process.listeners(signal)) {
        if (!kept.includes(listener)) {
          process.removeListener(signal, listener);
        }
      }
    }
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['operation-timeout', 'idle-release'])(
    'should refuse --%s beyond the longest timer delay',
    async (option) => {
      const mcpCommand = await importMcpCommand();

      await expect(runCommand(mcpCommand, { rawArgs: [`--${option}`, '2147484'] })).rejects.toThrow(
        `--${option} must be`,
      );
    },
  );

  it('should exit non-zero with its error when it cannot start serving', async () => {
    vi.mocked(createHostToolRegistry).mockImplementationOnce(() => {
      throw new Error('Provider tool schema has a tuple that cannot use one items schema');
    });
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array<ArrayBuffer>) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    const mcpCommand = await importMcpCommand();

    await runCommand(mcpCommand, { rawArgs: [] });

    expect(exitNow).toHaveBeenCalledExactlyOnceWith(1);
    expect(written.join('')).toContain(
      'tau mcp: could not start: Error: Provider tool schema has a tuple that cannot use one items schema',
    );
    expect(serveLocalHostMcp).not.toHaveBeenCalled();
  });

  it('should name a --project root on stderr and pin every call to it', async () => {
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array<ArrayBuffer>) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

    const server = await serve(['--project', '/fixture/project']);

    expect(server.workspaceRoot).toBe('/fixture/project');
    expect(server.pinned).toBe(true);
    expect(written).toContain('tau mcp: project root /fixture/project (--project)\n');
    await server.stop();
  });

  it('should name its start root and each folder a call names once, with where each came from', async () => {
    vi.stubEnv('CLAUDE_PROJECT_DIR', '/fixture/claude');
    const written: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array<ArrayBuffer>) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    const server = await serve([]);
    const call = async (runId?: string) =>
      server.registry.invoke({
        toolCallId: 'call-1',
        toolName: 'evaluate_model',
        ...(runId === undefined ? {} : { runId }),
        input: {},
        signal: new AbortController().signal,
      });

    server.checkouts.set('mcp:/fixture/codex', { cwd: '/fixture/codex' });
    await call();
    await call('mcp:/fixture/codex');
    await call('mcp:/fixture/codex');

    expect(server.pinned).toBe(false);
    expect(written.filter((line) => line.startsWith('tau mcp: project root'))).toEqual([
      'tau mcp: project root /fixture/claude (CLAUDE_PROJECT_DIR); a call that names its own folder works there\n',
      'tau mcp: project root /fixture/codex (the folder a call named)\n',
    ]);
    await server.stop();
  });

  it('should keep a thread while its tool call works between two operations past the idle release', async () => {
    const project = '/fixture/project';
    toolBody.run = async (runtimeClient) => {
      const first = await runtimeClient(project);
      await first.describe({ source: { path: 'main.ts' } });
      /* Main-thread work, as GeoSpec checks run between a test's exports: longer than the one-second release. */
      await sleep(1500);
      const second = await runtimeClient(project);
      await second.describe({ source: { path: 'main.ts' } });
    };
    const server = await serve(['--idle-release', '1']);

    server.checkouts.set(`mcp:${project}`, { cwd: project });
    await server.registry.invoke({
      toolCallId: 'call-1',
      toolName: 'evaluate_model',
      runId: `mcp:${project}`,
      input: {},
      signal: new AbortController().signal,
    });

    expect(createRuntimeClient).toHaveBeenCalledTimes(1);
    await server.stop();
  }, 10_000);

  it("should resume forwarding a worker's output once stderr drains", async () => {
    const forwarded: string[] = [];
    /* A full stderr pipe: every write asks the writer to wait for 'drain'. */
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array<ArrayBuffer>) => {
      forwarded.push(String(chunk));
      return false;
    }) as typeof process.stderr.write);
    const server = await serve([]);
    /* As `node:worker_threads` forwards a worker's stdout. */
    const workerStdout = new PassThrough();
    workerStdout.pipe(process.stdout);

    workerStdout.write('first');
    workerStdout.write('second');
    await vi.waitFor(() => {
      expect(forwarded.join('')).toContain('first');
    });
    process.stderr.emit('drain');

    await vi.waitFor(() => {
      expect(forwarded.join('')).toContain('second');
    });
    workerStdout.unpipe(process.stdout);
    await server.stop();
  });
});
