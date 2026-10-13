import { resolve as resolvePath } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

import { keyedResource, serveLocalHostMcp } from '@taucad/host';
import { createHostToolRegistry } from '@taucad/host/agent-tools';
import { systemSkillBundles } from '@taucad/skills/resources';
import type { AnyRuntimeDefinition, RuntimeClient } from '@taucad/runtime';
import { defineCommand } from 'citty';

import type { RuntimeWorkerData } from '#runtime.worker.js';

/** Milliseconds a stopping server waits for its kernels before it exits anyway. */
const shutdownGrace = 5000;

/**
 * One project's client. Its thread composes the CLI runtime from `--plugin` and `--config` at run time, so the
 * dynamic definition (`RuntimeClient`'s default) is the honest compile-time witness.
 */
export type ProjectRuntimeClient = RuntimeClient;

/** Seconds one operation may run before its project's thread is replaced. */
const defaultOperationTimeout = 600;

/** Seconds a project's thread may sit unused before it is released. */
const defaultIdleRelease = 900;

/** The longest delay a timer keeps, 2^31 - 1 ms, in whole seconds; a longer one fires at once. */
const longestSeconds = 2_147_483;

const seconds = (name: string, value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > longestSeconds) {
    throw new TypeError(`--${name} must be a whole number of seconds from 1 to ${String(longestSeconds)}`);
  }
  return parsed;
};

/**
 * `tau mcp` command.
 *
 * Serves Tau's CAD tools — evaluate, test, screenshot, export and the
 * workbench record — over stdio (MCP) to the agent that launched it. The
 * `@taucad/agent-plugin` launcher runs it for Codex and Claude Code; any MCP
 * client may run `tau mcp` itself.
 *
 * Stdout carries the protocol and nothing else: every other write this process
 * makes goes to stderr. The server answers `initialize` before any kernel
 * loads; the first tool call loads the runtime. It exits when the agent closes
 * stdin, on SIGTERM or SIGINT, or when the transport closes, removing the
 * temporary folder its screenshots were saved in.
 *
 * A call works in the first of: `--project`; the folder Codex names with each
 * call (`_meta["codex/sandbox-state-meta"].sandboxCwd`); `CLAUDE_PROJECT_DIR`,
 * which Claude Code sets for the servers it launches; the working directory.
 * Each project gets its own runtime thread on its first call: a model that
 * runs past `--operation-timeout` or ends its thread costs only that project
 * its thread, which its next call replaces, and a thread with no tool call
 * in flight for `--idle-release` is released.
 *
 * @example <caption>Serve one project to an MCP client</caption>
 * ```text
 * tau mcp --project ./bracket
 * ```
 */
export const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description: 'Serve Tau CAD tools to a local agent over stdio (MCP)',
  },
  args: {
    project: {
      type: 'string',
      description: 'Project folder for every call (default: the folder the agent names, CLAUDE_PROJECT_DIR, the cwd)',
    },
    plugin: {
      type: 'string',
      description: 'Additional plugin specifier to load (repeatable)',
    },
    config: {
      type: 'string',
      description: 'Path to a tau.config module that exports plugins',
    },
    'operation-timeout': {
      type: 'string',
      description: `Seconds one model operation may run before its project's thread is replaced (default: ${String(defaultOperationTimeout)})`,
    },
    'idle-release': {
      type: 'string',
      description: `Seconds an unused project's thread is kept (default: ${String(defaultIdleRelease)})`,
    },
  },
  async run({ args }) {
    const operationTimeout = seconds('operation-timeout', args['operation-timeout'], defaultOperationTimeout) * 1000;
    const idleRelease = seconds('idle-release', args['idle-release'], defaultIdleRelease) * 1000;

    /* Stdout belongs to the protocol. The transport keeps the original writer;
     * any other write — a kernel's console.log, Emscripten glue, a worker's
     * forwarded stdout — goes to stderr instead of corrupting the stream. */
    const protocolWrite = process.stdout.write.bind(process.stdout);
    const stdout = new Writable({
      write: (chunk: Uint8Array<ArrayBuffer>, _encoding, callback) => {
        protocolWrite(chunk, callback);
      },
    });
    process.stdout.write = process.stderr.write.bind(process.stderr);
    /* A worker's stdout is piped into process.stdout; once stderr is full, the pipe waits for stdout's 'drain'. */
    process.stderr.on('drain', () => process.stdout.emit('drain'));
    console.log = console.error;
    console.info = console.error;
    console.debug = console.error;

    const stopped = Promise.withResolvers<void>();
    const stop = (): void => {
      stopped.resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.stdin.once('end', stop);
    /* The agent stopped reading. */
    stdout.once('error', stop);

    const workspaceRoot = resolvePath(args.project ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd());
    /* One realm per project (kernel-realm-shared-state blueprint, I8): each
     * project's kernels run in their own thread, which loads every kernel
     * module there — never in this process, never before `initialize`. */
    const openClient = async (projectPath: string): Promise<ProjectRuntimeClient> => {
      const [{ createRuntimeClient }, { nodeWorkerTransport }, { fromNodeFs }] = await Promise.all([
        import('@taucad/runtime'),
        import('@taucad/runtime/transport/node'),
        import('@taucad/runtime/filesystem/node'),
      ]);
      return createRuntimeClient<AnyRuntimeDefinition>({
        transport: nodeWorkerTransport({
          url: new URL(
            import.meta.url.endsWith('.ts') ? '../runtime.worker.ts' : './runtime-worker.mjs',
            import.meta.url,
          ),
          workerData: {
            projectRoot: workspaceRoot,
            ...(args.plugin === undefined ? {} : { plugin: [args.plugin].flat() }),
            ...(args.config === undefined ? {} : { config: args.config }),
          } satisfies RuntimeWorkerData,
          fileSystem: fromNodeFs(projectPath),
        }),
        operationTimeout,
      });
    };
    /* A client whose thread exited is terminated, and replaced on its project's next call. */
    const clients = keyedResource<string, ProjectRuntimeClient>(
      openClient,
      async (client) => client.shutdown(),
      (client) => client.lifecycleState !== 'terminated',
    );
    const inFlight = new Map<string, number>();
    const idleTimers = new Map<string, NodeJS.Timeout>();
    const release = async (projectPath: string, incarnation?: number): Promise<void> => {
      try {
        await clients.close(projectPath, incarnation);
      } catch {
        /* Evicted all the same: a client that fails to close is kept, and server close tries it again. */
      }
    };
    const armIdleRelease = (projectPath: string): void => {
      clearTimeout(idleTimers.get(projectPath));
      idleTimers.set(
        projectPath,
        setTimeout(() => {
          idleTimers.delete(projectPath);
          void release(projectPath);
        }, idleRelease).unref(),
      );
    };
    const clientFor = async (projectPath: string): Promise<ProjectRuntimeClient> => {
      const [{ value, incarnation }, { isOperationTimeoutError }] = await Promise.all([
        clients.acquire(projectPath),
        import('@taucad/runtime'),
      ]);
      /* Acquired outside any tool call of this project's (the workbench's default-folder client): release it if unused. */
      if ((inFlight.get(projectPath) ?? 0) === 0) {
        armIdleRelease(projectPath);
      }
      /* An operation that times out evicts its thread at once (the eviction is synchronous), so the next call starts
       * a fresh one rather than meeting a thread the runtime terminates only after its grace. The tools turn the
       * rejection into a result, so the client's own calls are where it shows. */
      const evictOnTimeout = async (pending: Promise<unknown>): Promise<unknown> => {
        try {
          return await pending;
        } catch (error) {
          if (isOperationTimeoutError(error)) {
            void release(projectPath, incarnation);
          }
          throw error;
        }
      };
      // ponytail: a Proxy over every method beats a hand-written wrapper of HostRuntimeClient's generic surface.
      // oxlint-disable-next-line typescript/no-restricted-types -- a Proxy target is any object.
      const track = <Target extends object>(target: Target): Target =>
        new Proxy(target, {
          get(object, key) {
            const member: unknown = Reflect.get(object, key);
            if (typeof member !== 'function') {
              return member;
            }
            return (...parameters: unknown[]): unknown => {
              const result: unknown = Reflect.apply(member, object, parameters);
              if (result instanceof Promise) {
                return evictOnTimeout(result);
              }
              return typeof result === 'object' && result !== null ? track(result) : result;
            };
          },
        });
      return track(value);
    };
    const checkouts = new Map<string, { readonly cwd: string }>();
    const tools = createHostToolRegistry({
      workspaceRoot,
      checkouts,
      runtimeClient: clientFor,
      systemSkillBundles,
    });
    /* The idle release waits for a project's last tool call to settle, not its last operation: a call may work
     * between two operations (GeoSpec checks between a test's exports) for longer than the release. The project is
     * found as the registry finds it. */
    const registry: typeof tools = {
      ...tools,
      invoke: async (invocation) => {
        const projectPath =
          (invocation.runId === undefined ? undefined : checkouts.get(invocation.runId)?.cwd) ?? workspaceRoot;
        inFlight.set(projectPath, (inFlight.get(projectPath) ?? 0) + 1);
        clearTimeout(idleTimers.get(projectPath));
        try {
          return await tools.invoke(invocation);
        } finally {
          const left = (inFlight.get(projectPath) ?? 1) - 1;
          inFlight.set(projectPath, left);
          if (left === 0) {
            armIdleRelease(projectPath);
          }
        }
      },
    };
    const local = await serveLocalHostMcp(
      { workspaceRoot, pinned: args.project !== undefined, registry, checkouts },
      { stdout },
    );
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- The SDK server exposes an onclose callback, not EventTarget.
    local.server.server.onclose = stop;

    await stopped.promise;
    const close = async (): Promise<void> => {
      /* The server and its evidence folder go first, so a kernel that ignores
       * shutdown cannot keep the folder past the grace. */
      await local.close();
      for (const timer of idleTimers.values()) {
        clearTimeout(timer);
      }
      await clients.closeAll();
    };
    await Promise.race([close().catch(() => undefined), sleep(shutdownGrace)]);
    // oxlint-disable-next-line unicorn/no-process-exit -- a kernel thread that ignores termination would keep the event loop alive; the protocol is already closed, so no reader is truncated.
    process.exit(0);
  },
});
