import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';

import {
  defaultConfigDirectory,
  defaultMachineProviders,
  keyedResource,
  openLocalMachines,
  openLocalParameterActors,
  parseTauMcpLaunch,
  serveLocalHostMcp,
} from '@taucad/host';
import type { LocalMachines } from '@taucad/host';
import { createHostToolRegistry } from '@taucad/host/agent-tools';
import type { HostSystemSkillBundle } from '@taucad/host/agent-tools';
import { systemSkillBundles } from '@taucad/skills/resources';
import type { AnyRuntimeDefinition, RuntimeClient } from '@taucad/runtime';
import type { NativePreparation } from '@taucad/native-process-core/store';
import type { ComputeBinding } from '@taucad/runtime/types';
import { defineCommand } from 'citty';

import { childEnvironment } from '#child-environment.js';
import type { ComputeStoreHost } from '#compute-store.js';
import { exitNow } from '#exit-now.js';
import { installedVersion } from '#installed-version.js';
import { exitCodeFor } from '#output.js';
import { resolveProjectRoot } from '#project-root.js';
import type * as NativeKernels from '#native-kernels.js';
import type { DescribedRuntime } from '#native-kernels.js';
import type { RuntimeWorkerData } from '#runtime.worker.js';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load the CLI's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../../package.json' with { type: 'json' };

/**
 * Milliseconds a stopping server waits for its kernels before it exits anyway.
 *
 * The server exits within five seconds of its client closing. The grace is shorter than that bound because the bound
 * also covers delivering the end of stdin and exiting: a grace equal to it overran the bound whenever a kernel thread
 * was still terminating when the grace ran out.
 */
const shutdownGrace = 4000;
/** Milliseconds the compute store may take to open a project's store file before builds stay in memory. */
const computeStoreOpenLimit = 10_000;

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
 * temporary folder its screenshots were saved in. A server that cannot start
 * serving prints why on stderr and exits non-zero at once.
 *
 * A call works in the first of: `--project`; the folder Codex names with each
 * call (`_meta["codex/sandbox-state-meta"].sandboxCwd`); `CLAUDE_PROJECT_DIR`,
 * which Claude Code sets for the servers it launches; the working directory.
 * That folder is the project root every `targetFile` and every GeoSpec
 * `loadModel({ file })` resolves against: each result names it as
 * `projectRoot`, and stderr names each root once, with where it came from.
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
 * Native kernels (each one the runtime definition lists: built-ins, `--plugin` and `--config`) run from closures in
 * the payload store that `tau prepare` and the `prepare_kernel` tool fill (D7). The CAD tools never download: a file
 * whose kernel is not prepared answers `KERNEL_NOT_PREPARED`, naming `prepare_kernel` and its input. The kernel reads
 * the store again on every operation until it binds, so a closure another process prepared is used at once, with no
 * runtime replaced. `prepare_kernel` learns which kernels the runtime lists from a thread that builds it, so no kernel
 * module loads in this process. Runtime threads get only the environment {@link childEnvironment} allows, never the
 * agent app's own.
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
    computeMode: {
      type: 'string',
      description: 'Compute reuse mode: off, memory, or durable (kept across restarts, shared with tau serve)',
      default: 'durable',
    },
  },
  async run({ args }) {
    if (args.machines && !/^(1|true)$/iu.test(process.env['TAU_MACHINES_ENABLED'] ?? '')) {
      throw new Error('Machines are not available in this release.');
    }
    const operationTimeout = seconds('operation-timeout', args['operation-timeout'], defaultOperationTimeout) * 1000;
    const idleRelease = seconds('idle-release', args['idle-release'], defaultIdleRelease) * 1000;
    if (args.computeMode !== 'off' && args.computeMode !== 'memory' && args.computeMode !== 'durable') {
      throw new TypeError('--compute-mode must be off, memory, or durable');
    }
    const { computeMode } = args;

    try {
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

      const started = resolveProjectRoot({
        project: args.project,
        claudeProjectDir: process.env['CLAUDE_PROJECT_DIR'],
        cwd: process.cwd(),
      });
      const workspaceRoot = started.root;
      const pinned = started.source === '--project';
      process.stderr.write(
        `tau mcp: project root ${workspaceRoot} (${started.source})${pinned ? '' : '; a call that names its own folder works there'}\n`,
      );
      /* Loaded on first use: preparation reads the payload store, which `initialize` must not wait for. */
      let nativeModule: Promise<typeof NativeKernels> | undefined;
      const native = async (): Promise<typeof NativeKernels> => {
        nativeModule ??= import('#native-kernels.js');
        return nativeModule;
      };
      /* The agent app's environment is not scrubbed (ruling X9): a runtime thread gets the allowed names only. */
      const environment = childEnvironment(process.env);
      /** A runtime thread started with {@link environment} rather than this process's own. */
      class RuntimeThread extends Worker {
        public constructor(url: string | URL, options?: WorkerOptions) {
          super(url, { ...options, env: environment });
        }
      }
      const runtimeInputs = {
        projectRoot: workspaceRoot,
        ...(args.plugin === undefined ? {} : { plugin: [args.plugin].flat() }),
        ...(args.config === undefined ? {} : { config: args.config }),
      } satisfies RuntimeWorkerData;
      /* What the runtime definition lists (its native deployments and plugins), from a thread of its own that builds
       * it and serves nothing: kernel modules load there, never in this process. */
      let described: Promise<DescribedRuntime> | undefined;
      const describe = async (): Promise<DescribedRuntime> => {
        described ??= (async () => {
          const { describeRuntime } = await native();
          return describeRuntime({ ...runtimeInputs, env: environment });
        })();
        return described;
      };
      /* The kernels `prepare_kernel` names: none until the runtime is described. */
      let preparable: ReturnType<typeof NativeKernels.preparableKernelsOf> = [];
      /* A runtime with `--plugin` or `--config` may list plugins beyond the built-ins, whose kernels and skill bundles
       * the tool list names, so it is described before serving; the built-ins' skills ship in `systemSkillBundles`. */
      let skillBundles: readonly HostSystemSkillBundle[] = systemSkillBundles;
      if (args.plugin !== undefined || args.config !== undefined) {
        try {
          const [{ preparableKernelsOf }, { pluginSkillBundles }, runtime] = await Promise.all([
            native(),
            import('#plugin-skills.js'),
            describe(),
          ]);
          preparable = preparableKernelsOf(runtime.report);
          skillBundles = [
            ...systemSkillBundles,
            ...(await pluginSkillBundles({
              projectRoot: workspaceRoot,
              plugins: runtime.plugins,
              exclude: new Set(systemSkillBundles.map(({ slug }) => slug)),
            })),
          ];
        } catch (error) {
          process.stderr.write(`tau mcp: serving without the plugins' kernels and skills: ${String(error)}\n`);
        }
      }
      /* The durable compute store Tau Desktop and tau serve use: a model built once, by any Tau process, is reused
       * after a restart. Loaded and started with the first project's runtime, never before `initialize`. */
      let computeStore: Promise<ComputeStoreHost | undefined> | undefined;
      const openComputeStore = async (): Promise<ComputeStoreHost | undefined> => {
        try {
          const { createComputeStoreHost } = await import('#compute-store.js');
          return createComputeStoreHost({
            directory: join(defaultConfigDirectory(), 'compute'),
            onError: (error) => {
              process.stderr.write(`tau mcp: the compute store failed: ${error.message}\n`);
            },
          });
        } catch (error) {
          process.stderr.write(`tau mcp: keeping builds in memory; the compute store did not load: ${String(error)}\n`);
          return undefined;
        }
      };
      /* A store that cannot open or connect leaves this runtime with in-memory reuse; the next one tries again. */
      const computeFor = async (projectPath: string): Promise<ComputeBinding> => {
        if (computeMode !== 'durable') {
          return { mode: computeMode };
        }
        computeStore ??= openComputeStore();
        const host = await computeStore;
        if (host === undefined) {
          computeStore = undefined;
          return { mode: 'memory' };
        }
        try {
          const connection = host.connect(projectPath);
          /* The runtime fails every evaluation on a store that cannot open (an unwritable folder), so ask it first. */
          await connection.control.inspect({ signal: AbortSignal.timeout(computeStoreOpenLimit) });
          return { mode: 'durable', store: connection.store };
        } catch (error) {
          process.stderr.write(`tau mcp: keeping builds in memory; the compute store did not open: ${String(error)}\n`);
          computeStore = undefined;
          await host.close().catch(() => undefined);
          return { mode: 'memory' };
        }
      };
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
            workerCtor: RuntimeThread,
            url: new URL(
              import.meta.url.endsWith('.ts') ? '../runtime.worker.ts' : './runtime-worker.mjs',
              import.meta.url,
            ),
            workerData: runtimeInputs,
            fileSystem: fromNodeFs(projectPath),
            compute: await computeFor(projectPath),
          }),
          operationTimeout,
        });
      };
      /* A client whose thread exited is terminated, and replaced on its project's next call. */
      const clients = keyedResource<string, ProjectRuntimeClient>(
        openClient,
        async (client) => {
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
        const evictOnTimeout = async (operation: Promise<unknown>): Promise<unknown> => {
          try {
            return await operation;
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
      /* The printers this computer's Tau apps share, before the tools: the print tools are offered only over a store
       * this process holds. Another Tau app holding it leaves the CAD tools serving without printers. A server whose
       * calls all work in one folder (`--project`, or Claude Code's project) holds the store only when that folder is a
       * Tau project; Codex names each call's folder, so a server it starts names the project per call. */
      const opened = args.machines
        ? await openLocalMachines({
            workspaceRoot,
            requireProject: started.source !== 'working directory',
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
        const { openNativePreparation, reportedDeployments } = await native();
        return openNativePreparation({
          deployments: async () => {
            const { report } = await describe();
            return reportedDeployments(report);
          },
        });
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
        systemSkillBundles: skillBundles,
        ...(machines === undefined ? {} : { machines: machines.facet, projectIdOf: machines.projectOf }),
        preparableKernels: () => preparable,
        /* In this process, with its unrestricted fetch (D4); a ready kernel binds on its next operation. */
        prepareKernel: async ({ kernel }, { signal, onProgress }) => {
          const opened = await openPreparation();
          return opened.prepare(kernel, { signal, onProgress });
        },
      });
      /* The idle release waits for a project's last tool call to settle, not its last operation: a call may work
       * between two operations (GeoSpec checks between a test's exports) for longer than the release. The project is
       * found as the registry finds it, and a folder a call names is said once, as the start root was. */
      const named = new Set([workspaceRoot]);
      const registry: typeof tools = {
        ...tools,
        invoke: async (invocation) => {
          const projectPath =
            (invocation.runId === undefined ? undefined : checkouts.get(invocation.runId)?.cwd) ?? workspaceRoot;
          if (!named.has(projectPath)) {
            named.add(projectPath);
            process.stderr.write(`tau mcp: project root ${projectPath} (the folder a call named)\n`);
          }
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
      const viewerPage = await readViewerPage(args['viewer-page'] ?? process.env['TAU_VIEWER_PAGE']);
      const local = await serveLocalHostMcp(
        {
          workspaceRoot,
          pinned,
          registry,
          checkouts,
          viewerPage,
          runtimeClient: clientFor,
          /* The agent plugin's launcher says which rung started this CLI; `initialize` names it with this version. */
          runtime: {
            version: installedVersion(import.meta.url, { name: packageJson.name, version: packageJson.version }),
            launch: parseTauMcpLaunch(process.env['TAU_LAUNCH']),
          },
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
        try {
          const store = await computeStore;
          await store?.close();
        } catch (error) {
          process.stderr.write(`tau mcp: the compute store did not close: ${String(error)}\n`);
        }
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
    } catch (error) {
      /* A server that cannot start says so and exits at once: the signal and stdin listeners it already holds would
       * keep it running, so neither its host nor `doctor` would ever see it fail. */
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      process.stderr.write(`tau mcp: could not start: ${detail}\n`);
      await exitNow(exitCodeFor(error));
    }
  },
});
