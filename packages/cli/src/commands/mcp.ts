import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';

import {
  defaultMachineProviders,
  keyedResource,
  openLocalMachines,
  openLocalParameterActors,
  serveLocalHostMcp,
} from '@taucad/host';
import type { LocalMachines } from '@taucad/host';
import { createHostToolRegistry } from '@taucad/host/agent-tools';
import { systemSkillBundles } from '@taucad/skills/resources';
import type { AnyRuntimeDefinition, RuntimeClient } from '@taucad/runtime';
import { defineCommand } from 'citty';

import { childEnvironment } from '#child-environment.js';
import { exitNow } from '#exit-now.js';
import type * as NativeKernels from '#native-kernels.js';
import type { NativeComposition, NativePreparation } from '#native-kernels.js';
import type { RuntimeWorkerData } from '#runtime.worker.js';

/**
 * Milliseconds a stopping server waits for its kernels before it exits anyway.
 *
 * The server exits within five seconds of its client closing. The grace is shorter than that bound because the bound
 * also covers delivering the end of stdin and exiting: a grace equal to it overran the bound whenever a kernel thread
 * was still terminating when the grace ran out.
 */
const shutdownGrace = 4000;

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
 * Serves Tau's CAD tools — evaluate, test, screenshot, export, parameters
 * and the workbench record — over stdio (MCP) to the agent that launched it. The
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
 * With `--machines` it also serves the print tools over the printers this computer's Tau apps share
 * (`<config>/machines`). A print starts only after the person approves it in the agent app's own form; an app that
 * cannot show one leaves the request for Tau's Print pane. Each print names the project of the folder its call works
 * in. The store has one writer, so the flag is off by default: a server holding it keeps the desktop app from its
 * printers until the agent closes, and a server whose one folder holds no `tau.json` does not take it.
 *
 * Native kernels (Build123d for `.py`, PicoGK for `.cs`) run from closures in the payload store that `tau prepare`
 * and the `prepare_kernel` tool fill (D7). The CAD tools never download: a file whose kernel is not prepared answers
 * `KERNEL_NOT_PREPARED`, naming `prepare_kernel` and its input. The store is read again on every such refusal, so a
 * closure another process prepared is used at once; after a preparation, each project's runtime is replaced, and the
 * old one shuts down once its calls in flight finish. Runtime threads get only the environment
 * {@link childEnvironment} allows, never the agent app's own.
 *
 * @example <caption>Serve one project to an MCP client</caption>
 * ```text
 * tau mcp --project ./bracket
 * ```
 */
/**
 * The viewer page a launcher named, with the digest that names its `ui://` URI.
 *
 * A page that cannot be read leaves the CAD tools serving without the viewer,
 * and says why on stderr: the agent keeps working either way.
 *
 * @param path - The page's path, if any.
 * @returns The page, or `undefined`.
 */
const readViewerPage = async (path: string | undefined): Promise<{ html: string; sha256: string } | undefined> => {
  if (path === undefined || path === '') {
    return undefined;
  }
  try {
    const html = await readFile(resolvePath(path), 'utf8');
    return { html, sha256: createHash('sha256').update(html).digest('hex') };
  } catch (error) {
    process.stderr.write(`tau mcp: serving without the viewer; ${path} could not be read: ${String(error)}\n`);
    return undefined;
  }
};

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
    machines: {
      type: 'boolean',
      description:
        "Offer the machine tools over this computer's Tau machines; a job starts only after the person approves it in Tau's Print pane (TAU_HOST_MACHINES=true)",
      default: process.env['TAU_HOST_MACHINES'] === 'true',
    },
    'viewer-page': {
      type: 'string',
      description:
        'Single-file viewer page to serve with show_model (default: TAU_VIEWER_PAGE; none disables the viewer)',
    },
  },
  async run({ args }) {
    if (args.machines && !/^(1|true)$/iu.test(process.env['TAU_MACHINES_ENABLED'] ?? '')) {
      throw new Error('Machines are not available in this release.');
    }
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
    /* The native kernels every new runtime thread composes, read from the store's receipts once per generation; a
     * profile no host can honour leaves the native kernels out rather than every CAD tool. */
    let composition: Promise<NativeComposition> | undefined;
    /* Loaded on first use: the native packages' entries import their kernels, which `initialize` must not wait for. */
    let nativeModule: Promise<typeof NativeKernels> | undefined;
    const native = async (): Promise<typeof NativeKernels> => {
      nativeModule ??= import('#native-kernels.js');
      return nativeModule;
    };
    const composeOrNone = async (): Promise<NativeComposition> => {
      try {
        const { composeNativeKernels } = await native();
        return await composeNativeKernels();
      } catch (error) {
        process.stderr.write(`tau mcp: serving without native kernels: ${String(error)}\n`);
        return { unavailable: [] };
      }
    };
    const nativeKernels = async (): Promise<NativeComposition> => {
      composition ??= composeOrNone();
      return composition;
    };
    /* The agent app's environment is not scrubbed (ruling X9): a runtime thread gets the allowed names only. */
    const environment = childEnvironment(process.env);
    /** A runtime thread started with {@link environment} rather than this process's own. */
    class RuntimeThread extends Worker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, { ...options, env: environment });
      }
    }
    /* One realm per project (kernel-realm-shared-state blueprint, I8): each
     * project's kernels run in their own thread, which loads every kernel
     * module there — never in this process, never before `initialize`. */
    const openClient = async (projectPath: string): Promise<ProjectRuntimeClient> => {
      const [{ createRuntimeClient }, { nodeWorkerTransport }, { fromNodeFs }] = await Promise.all([
        import('@taucad/runtime'),
        import('@taucad/runtime/transport/node'),
        import('@taucad/runtime/filesystem/node'),
      ]);
      const native = await nativeKernels();
      return createRuntimeClient<AnyRuntimeDefinition>({
        transport: nodeWorkerTransport({
          workerCtor: RuntimeThread,
          url: new URL(
            import.meta.url.endsWith('.ts') ? '../runtime.worker.ts' : './runtime-worker.mjs',
            import.meta.url,
          ),
          workerData: {
            projectRoot: workspaceRoot,
            ...(args.plugin === undefined ? {} : { plugin: [args.plugin].flat() }),
            ...(args.config === undefined ? {} : { config: args.config }),
            native,
          } satisfies RuntimeWorkerData,
          fileSystem: fromNodeFs(projectPath),
        }),
        operationTimeout,
      });
    };
    /* Each client's operations in flight, so a retired client shuts down only once they settle. */
    const pending = new WeakMap<ProjectRuntimeClient, Set<Promise<unknown>>>();
    const retiring = new WeakSet<ProjectRuntimeClient>();
    /* A client whose thread exited is terminated, and replaced on its project's next call. */
    const clients = keyedResource<string, ProjectRuntimeClient>(
      openClient,
      async (client) => {
        if (retiring.has(client)) {
          await Promise.allSettled(pending.get(client) ?? []);
        }
        await client.shutdown();
      },
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
    /**
     * Replace every project's runtime with one composed from `next` (or the store, read again on next use). Each old
     * client is evicted at once, so the next call starts a fresh thread, and shuts down after its calls in flight
     * settle (D7, AR1-8).
     * @param next - The composition the next clients use; omitted, the store is read again on next use.
     * @returns Once every old client is evicted, before they drain.
     */
    const retireClients = async (next?: NativeComposition): Promise<void> => {
      composition = next === undefined ? undefined : Promise.resolve(next);
      await Promise.all(
        clients.keys().map(async (projectPath) => {
          let acquired: Awaited<ReturnType<typeof clients.acquire>>;
          try {
            acquired = await clients.acquire(projectPath);
          } catch {
            /* A client that failed to start has nothing to retire. */
            return;
          }
          retiring.add(acquired.value);
          void release(projectPath, acquired.incarnation);
        }),
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
      const inFlightOf = pending.get(value) ?? new Set<Promise<unknown>>();
      pending.set(value, inFlightOf);
      const evictOnTimeout = async (operation: Promise<unknown>): Promise<unknown> => {
        inFlightOf.add(operation);
        try {
          return await operation;
        } catch (error) {
          if (isOperationTimeoutError(error)) {
            void release(projectPath, incarnation);
          }
          throw error;
        } finally {
          inFlightOf.delete(operation);
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
    /* The printers this computer's Tau apps share, before the tools: the print tools are offered only over a store
     * this process holds. Another Tau app holding it leaves the CAD tools serving without printers. A server whose
     * calls all work in one folder (`--project`, or Claude Code's project) holds the store only when that folder is a
     * Tau project; Codex names each call's folder, so a server it starts names the project per call. */
    const opened = args.machines
      ? await openLocalMachines({
          workspaceRoot,
          requireProject: args.project !== undefined || process.env['CLAUDE_PROJECT_DIR'] !== undefined,
          providers: await defaultMachineProviders(),
          actorId: 'tau-mcp',
          onWarning: ({ message }) => {
            process.stderr.write(`tau mcp: ${message}\n`);
          },
        })
      : undefined;
    const machines: LocalMachines | undefined = opened === undefined || 'refused' in opened ? undefined : opened;
    if (opened !== undefined && 'refused' in opened) {
      process.stderr.write(
        opened.refused === 'in-use'
          ? 'tau mcp: printers are in use by another Tau app on this computer, so this server offers no print tools. Quit it and restart the agent to print from here.\n'
          : `tau mcp: ${workspaceRoot} holds no tau.json, so this server offers no print tools and leaves the printers to Tau's other apps. Restart the agent in a Tau project to print from here.\n`,
      );
    }
    const checkouts = new Map<string, { readonly cwd: string }>();
    /* `get_parameters` and `apply_parameter_operation`: one actor per entry, writing its sidecar. */
    const parameters = openLocalParameterActors({ runtimeClient: clientFor });
    let preparation: Promise<NativePreparation> | undefined;
    const startPreparation = async (): Promise<NativePreparation> => {
      const { openNativePreparation } = await native();
      return openNativePreparation();
    };
    const openPreparation = async (): Promise<NativePreparation> => {
      preparation ??= startPreparation();
      return preparation;
    };
    const tools = createHostToolRegistry({
      workspaceRoot,
      checkouts,
      runtimeClient: clientFor,
      parameterActor: parameters.parameterActor,
      systemSkillBundles,
      ...(machines === undefined ? {} : { machines: machines.facet, projectIdOf: machines.projectOf }),
      /* In this process, with its unrestricted fetch (D4); a ready kernel is composed by every later call. */
      prepareKernel: async ({ kernel }, { signal, onProgress }) => {
        const opened = await openPreparation();
        const outcome = await opened.prepare(kernel, { signal, onProgress });
        if (outcome.status === 'ready') {
          await retireClients();
        }
        return outcome;
      },
    });
    /**
     * A call that met an unprepared kernel reads the store again: a closure `tau prepare`, the desktop or another
     * `tau mcp` sealed meanwhile is composed and the call repeated once, with no `prepare_kernel` (AR1-3).
     * @param invocation - The registry call.
     * @returns Its result, or the repeated call's.
     */
    const invokeComposed: typeof tools.invoke = async (invocation) => {
      const result = await tools.invoke(invocation);
      /* A refusal can only come from a runtime thread, which loaded the module already. */
      if (nativeModule === undefined) {
        return result;
      }
      const { composeNativeKernels, refusedKernels } = await native();
      const refused = refusedKernels(result.content);
      if (refused.size === 0) {
        return result;
      }
      let fresh: NativeComposition;
      try {
        fresh = await composeNativeKernels();
      } catch {
        return result;
      }
      const stillRefused = new Set(
        fresh.unavailable.filter(({ reason }) => reason === 'not-prepared').map(({ kernel }) => kernel),
      );
      if ([...refused].every((kernel) => stillRefused.has(kernel))) {
        return result;
      }
      await retireClients(fresh);
      return tools.invoke(invocation);
    };
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
          return await invokeComposed(invocation);
        } finally {
          const left = (inFlight.get(projectPath) ?? 1) - 1;
          inFlight.set(projectPath, left);
          if (left === 0) {
            armIdleRelease(projectPath);
          }
        }
      },
    };
    const viewerPage = await readViewerPage(args['viewer-page'] ?? process.env['TAU_VIEWER_PAGE']);
    const local = await serveLocalHostMcp(
      {
        workspaceRoot,
        pinned: args.project !== undefined,
        registry,
        checkouts,
        viewerPage,
        runtimeClient: clientFor,
        /* The direct share link packs the shown entry's source closure, as the Tau app does. */
        snapshotSource: async ({ root, entryPath, additionalPaths, signal }) => {
          const client = await clientFor(root);
          const snapshot = await client.snapshotSource({ source: { path: entryPath }, additionalPaths, signal });
          return snapshot.success
            ? snapshot.data
            : {
                errorCode: 'SNAPSHOT_FAILED',
                message: snapshot.issues[0]?.message ?? 'The project source snapshot could not be collected.',
              };
        },
      },
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
      try {
        await parameters.close();
      } catch (error) {
        process.stderr.write(`tau mcp: a parameter write did not close: ${String(error)}\n`);
      }
      await machines?.close().catch((error: unknown) => {
        process.stderr.write(`tau mcp: the printer store did not close: ${String(error)}\n`);
      });
      await clients.closeAll();
      if (preparation !== undefined) {
        const opened = await preparation;
        await opened.dispose();
      }
    };
    await Promise.race([close().catch(() => undefined), sleep(shutdownGrace)]);
    /* Not `process.exit`: a kernel's WebAssembly tier-up still compiling on V8's threads would hold it for seconds,
     * and a kernel thread that ignores termination would keep the event loop alive. The protocol is already closed,
     * so no reader is truncated. */
    await exitNow(0);
  },
});
