/**
 * The daemon's tool registry: the canonical chat RPC dispatcher, in process,
 * over a rooted `NodeFsProvider` and the supervised runtime child.
 *
 * The tool *definitions* come from `@taucad/chat` and the registry itself from
 * `@taucad/agent-tools` — the same two sources the browser worker reads — so a
 * daemon-placed run sees the same names, descriptions and JSON Schemas a
 * browser-placed run does. Only the backing clients differ: disk instead of a
 * filesystem bridge, and the loopback runtime child instead of a kernel worker.
 *
 * Rendering is *not* browser-only: the runtime's image plugin renders through
 * the native raster backend, which resolves and runs under plain Node — probed
 * on this machine at 512² webp in 16.6 ms cold and ~2.9 ms warm on the Metal
 * adapter (`substrate/capture/nanoraster-node-probe.txt`). `screenshot` and
 * `export_geometry` are therefore offered whenever a runtime client is
 * attached, exactly like `get_kernel_result`.
 *
 * `test_model` and `use_skill` were the two absentees, both for the same
 * reason: their adapters lived in `apps/ui`. They now live in
 * `@taucad/agent-tools`, so this module only has to supply the Node halves —
 * a disk reader for skills, and the engine's Node runner for GeoSpec.
 */

import { readFile, realpath, readdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { ResourceQueue } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { rpcClientErrorCode } from '@taucad/chat';
import { toRpcError } from '@taucad/chat/rpc';
import type { RpcGeoSpecClient, RpcSkillResolver } from '@taucad/chat/rpc';
import {
  createChatToolRegistry,
  createProviderRpcFileSystem,
  createRuntimeWorkbenchClient,
  createSkillBundleOverlay,
  createSkillBundleRegistry,
} from '@taucad/agent-tools/registry';
import type { ReadSkillResource } from '@taucad/agent-tools/registry';
import { createSkillResolver } from '@taucad/agent-tools/skills';
import { createRuntimeAgentClients, createRuntimeParameterAgentClient } from '@taucad/agent-tools/runtime';
import { createProjectModelLoader, runGeoSpecTests } from '@taucad/agent-tools/geospec';
import type { GeoSpecRuntimeClient } from 'geospec/model';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import type { Engine as NativeGeoSpecEngine } from '@taucad/geospec-engine-native/node';
import { assertRootedPath } from '@taucad/utils/path';

/* Not `@taucad/types`: that barrel is an `export type *` the dts bundler cannot
 * follow, and it bundles rather than externalises. `@taucad/runtime` is a peer,
 * and re-exports the same declaration by name, so the emitted `.d.mts` keeps it
 * as an external import. */
import type { ExportFile, RuntimeFileSystemBase, SourceRevision } from '@taucad/runtime/types';
import type { RuntimeClient } from '@taucad/runtime/client';
import type { MachineClient } from '@taucad/runtime/machine';
import type { RuntimeTransportFacet } from '@taucad/runtime/transport';
import type { ActorRefFrom } from 'xstate';
import type { parameterSetMachine } from '@taucad/parameters/set-machine';

import type { ToolRegistry } from '@taucad/agent-host';

import type { ProjectRevisions } from '#revisions.js';

type ParameterActor = ActorRefFrom<typeof parameterSetMachine>;

/** Runtime surface accepted by the host's GeoSpec model loader. @public */
export type HostGeoSpecRuntimeClient = GeoSpecRuntimeClient;

/**
 * A GeoSpec runner that can also name the sources its models were loaded from (R4, invariant I5).
 *
 * Optional because a runner whose loader is the CLI's own — no Tau runtime behind it — resolves
 * sources the runtime never hashed, and has no revision to report.
 * @public
 */
export type HostGeoSpecRunner = GeoSpecRunner & {
  readonly sourceRevisions?: () => readonly SourceRevision[];
};

/**
 * One rendered artifact returned by a runtime export route.
 *
 * Aliased rather than restated: the RPC contract hands these straight back to
 * the model, and a local re-declaration would drift from the `MimeType` union
 * the chat schemas validate against.
 *
 * @public
 */
export type HostExportFile = ExportFile;

/**
 * The runtime surface the daemon's tools need.
 *
 * Projected from the public runtime contract so published declarations never
 * expose the private agent adapter. `tau serve` passes its loopback client;
 * tests may supply a structural fake of these three operations.
 *
 * @public
 */
export type HostRuntimeClient = Pick<RuntimeClient, 'evaluate' | 'export' | 'transcode' | 'connect' | 'capabilities'>;

/** Filesystem capability the host tool registry consumes. @public */
export type HostToolFileSystem = Omit<RuntimeFileSystemBase, 'watch'>;

/** One package-owned skill bundle accepted by the host. @public */
export type HostSystemSkillBundle = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  readonly body: string;
  readonly fingerprint: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly url: string;
    readonly byteLength: number;
    readonly lineCount: number;
    readonly contentKind: 'text';
    readonly mediaType: 'text/markdown';
    readonly sha256: string;
  }>;
};

const issueMessage = (issues: ReadonlyArray<{ readonly message: string }>, fallback: string): string =>
  issues.map((issue) => issue.message).join('; ') || fallback;

/**
 * A throw out of the runtime client is *this host's* failure, never a verdict
 * on the model.
 *
 * A geometry error is not a throw — it comes back as `{ success: true, status:
 * 'error' }` with its kernel issues — so the only way to reach this is a child
 * that would not start, an engine that would not load, or a wire that died.
 * Routing that through `toRpcError` classified it by *message*: the G4 live
 * proof answered six `get_kernel_result` calls and one `screenshot` with
 * `{"errorCode":"IO_ERROR","message":"Runtime render failed"}` while the
 * daemon's log named the real cause, and `IO_ERROR` on a file the model had
 * just written reads as "your geometry is wrong". The reason now travels
 * verbatim under the host's own name.
 *
 * @param error - Whatever the runtime client threw.
 * @param targetFile - The file the tool was asked about.
 * @returns The RPC failure the model sees.
 */
const runtimeFailure = (
  error: unknown,
  targetFile: string,
): { readonly success: false; readonly errorCode: 'UNKNOWN' | 'RESULT_TOO_LARGE'; readonly message: string } => {
  const reason = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error ? (error as Error & { readonly code?: unknown }).code : undefined;
  const isUnavailable = code === 'RUNTIME_UNAVAILABLE';
  return {
    success: false,
    errorCode: code === 'RESULT_TOO_LARGE' ? rpcClientErrorCode.resultTooLarge : rpcClientErrorCode.unknown,
    /* `RUNTIME_UNAVAILABLE` already reads as a sentence about this host — the
     * supervisor's own failure, verbatim — so it is not wrapped twice. */
    message: isUnavailable ? reason : `This Tau Host could not render ${targetFile}: ${reason}`,
  };
};

/**
 * The GeoSpec engine is an optional peer: a daemon shipped without it is still
 * a complete file-and-geometry host, it just cannot verify. `list()` is
 * synchronous and a tool must never be advertised before its engine is known to
 * exist, so resolution is probed here rather than discovered on first call.
 *
 * @returns True when this installation can run GeoSpec.
 */
const geoSpecEngineResolves = (): boolean => {
  try {
    /* Both are this host's own declared dependencies, so its own module is the
     * correct base — unlike the kernel plugins next door. */
    import.meta.resolve('@taucad/geospec-engine/register/node');
    import.meta.resolve('geospec/runner/node');
    return true;
  } catch {
    return false;
  }
};

/**
 * Build the engine's serial Node runner over the workspace directory.
 *
 * Serial, not pooled: a pool shards across `worker_threads` for a whole test
 * suite, while an agent's `test_model` is one selection at a time and pays only
 * the spawn cost. The model loader is deliberately *not* in the VM world — it
 * drives the Tau runtime against the real directory, exactly as the CLI does.
 *
 * @param workspaceRoot - Absolute project root the runner executes against.
 * @param runtime - Optional project runtime used to load every model.
 * @returns A runner scoped to one `test_model` call.
 * @public
 */
export const createHostGeoSpecRunner = async (
  workspaceRoot: string,
  runtime?: HostGeoSpecRuntimeClient,
): Promise<HostGeoSpecRunner> => {
  await import('@taucad/geospec-engine/register/node');
  const [{ createGeoSpecNodeRunner, createNodeVmFileSystem }, { createModelLoader }] = await Promise.all([
    import('geospec/runner/node'),
    import('geospec/model'),
  ]);
  const loader = runtime ? createProjectModelLoader({ runtime }) : undefined;
  const runner = createGeoSpecNodeRunner({
    projectPath: workspaceRoot,
    filesystem: createNodeVmFileSystem(workspaceRoot),
    modelLoader: loader ? loader.modelLoader : createModelLoader({ projectPath: workspaceRoot }),
  });
  /* R4/I5: the loader is per-runner and nothing else can reach it, so the runner is where its
   * provenance belongs — every factory that returns this runner carries it without extra wiring. */
  return loader ? Object.assign(runner, { sourceRevisions: loader.sourceRevisions }) : runner;
};

/** One serialized native engine retains subjects only within its canonical root. */
type NativeGeoSpecSession = {
  readonly root: string;
  readonly engine: NativeGeoSpecEngine;
  readonly carried: Map<string, unknown>;
};

let nativeSession: NativeGeoSpecSession | undefined;
let nativeTail: Promise<void> = Promise.resolve();

const openNativeGeoSpecSession = async (root: string): Promise<NativeGeoSpecSession> => {
  const canonicalRoot = await realpath(root);
  if (nativeSession?.root === canonicalRoot) {
    return nativeSession;
  }
  const previous = nativeSession;
  nativeSession = undefined;
  previous?.carried.clear();
  previous?.engine.close();
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the native package's constructor export.
  const { Engine } = await import('@taucad/geospec-engine-native/node');
  const cacheRoot = join(homedir() || tmpdir(), '.cache', 'geospec', 'evidence');
  let engine: NativeGeoSpecEngine;
  try {
    engine = new Engine({ root: cacheRoot, projectRoot: canonicalRoot });
  } catch (error) {
    console.warn('GeoSpec native cache unavailable; using a resident engine:', error);
    engine = new Engine();
  }
  const session = {
    root: canonicalRoot,
    engine,
    carried: new Map<string, unknown>(),
  };
  nativeSession = session;
  return session;
};

/**
 * Create an opt-in native runner for one tool call using the host's existing runtime.
 *
 * Every call in this process shares one engine and runs after the previous call's runner
 * closes. A call keeps its subjects admitted until the next call settles, which releases
 * those it did not load again, so repeating `test_model` on unchanged models is digest-only.
 * The runtime is borrowed; closing this runner hands the engine to the next call.
 *
 * @param workspaceRoot - Absolute project root the runner executes against.
 * @param runtime - Existing project runtime used to export authored models.
 * @returns The ordinary GeoSpec runner contract over the shared native engine.
 * @public
 */
export const createHostNativeGeoSpecRunner = async (
  workspaceRoot: string,
  runtime: HostGeoSpecRuntimeClient,
): Promise<HostGeoSpecRunner> => {
  const previous = nativeTail;
  let endTurn = (): void => undefined;
  nativeTail = new Promise<void>((resolve) => {
    endTurn = resolve;
  });
  await previous;
  try {
    const [session, { createNativeGeoSpecRunner }, { createNodeVmFileSystem }] = await Promise.all([
      openNativeGeoSpecSession(workspaceRoot),
      import('geospec/runner/native'),
      import('@taucad/geospec-engine/node-filesystem'),
    ]);
    const revisions = new Map<string, SourceRevision>();
    const trackedRuntime = new Proxy(runtime, {
      get(target, property, receiver: unknown): unknown {
        if (property !== 'export') {
          return Reflect.get(target, property, receiver) as unknown;
        }
        return async (...args: Parameters<HostGeoSpecRuntimeClient['export']>) => {
          const result = await target.export(...args);
          if (result.sourceRevision) {
            revisions.set(result.sourceRevision.entry, result.sourceRevision);
          }
          return result;
        };
      },
    });
    const filesystem = createNodeVmFileSystem(workspaceRoot);
    const runner = createNativeGeoSpecRunner({
      filesystem,
      // PERF-OUTPUT-01: the product reads verdicts and localized failures, so
      // it selects the bounded success evidence (ruling 13).
      nativeAssertions: { engine: session.engine, evidenceProfile: 'bounded' },
      model: {
        projectPath: workspaceRoot,
        runtime: trackedRuntime,
        readSource: async (source) => {
          if (typeof source !== 'string') {
            throw new TypeError('Native GeoSpec file sources must be project paths.');
          }
          return filesystem.readFile(assertRootedPath(source));
        },
        carried: session.carried,
      },
    });
    let closed = false;
    return {
      ...runner,
      sourceRevisions: () => [...revisions.values()],
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        try {
          await runner.close();
        } finally {
          endTurn();
        }
      },
    };
  } catch (error) {
    endTurn();
    throw error;
  }
};

/** Options for {@link createHostToolRegistry}. @public */
export type HostToolRegistryOptions = {
  /** Absolute workspace root every file tool is confined to. */
  readonly workspaceRoot: string;
  /**
   * Open the host-owned filesystem view for one admitted execution root.
   *
   * The embedding host owns root admission and provider lifetime. Defaults to
   * a standalone {@link NodeFsProvider} for callers that have no shared Node
   * authority.
   */
  readonly filesystem?: ((workspaceRoot: string) => HostToolFileSystem) | undefined;
  /**
   * Resolves the loopback runtime client backing every geometry tool. A thunk,
   * because the daemon starts its runtime child on first use. Omit it and the
   * geometry tools are not offered rather than offered-and-failing.
   *
   * Takes the root the *calling turn* works in, which is the workspace root for
   * every direct turn and the turn's checkout for a candidate one. A
   * composition that cannot re-root its runtime ignores the argument and
   * answers with its own; the file tools are re-rooted either way.
   */
  readonly runtimeClient?: ((workspaceRoot: string) => Promise<HostRuntimeClient>) | undefined;
  /** Open the one host-owned semantic parameter client for a source target. */
  readonly parameterActor?:
    | ((workspaceRoot: string, targetFile: string) => ParameterActor | Promise<ParameterActor>)
    | undefined;
  /**
   * Builds the GeoSpec runner one `test_model` call runs on, in the root the
   * calling turn works in. Defaults to the engine's Node runner when
   * `@taucad/geospec-engine` resolves; pass `false` to withhold `test_model`
   * from an installation that has the engine.
   */
  readonly geospecRunner?: ((workspaceRoot: string) => Promise<HostGeoSpecRunner>) | false | undefined;
  /**
   * Authoring API of `geospecRunner`, advertised before the first model turn.
   * Defaults to legacy, matching the built-in runner. A custom native runner
   * must explicitly pair with `native`; arbitrary factories cannot be inspected
   * to infer their backend. The caller owns this pairing.
   */
  readonly geospecAuthoringMode?: 'legacy' | 'native' | undefined;
  /**
   * Where each admitted run works, by run id — the map `createProjectRevisions`
   * publishes (V19).
   *
   * One registry serves every concurrent run, and a candidate turn works in its
   * own checkout rather than in the live tree. Reading the run's root per
   * invocation is what makes that true of Tau's own tools: without it the tools
   * write the project folder while the turn is recorded as a branch, which is
   * the one thing a host must never do. Omit it on a host that records every
   * turn directly.
   */
  readonly checkouts?: ReadonlyMap<string, { readonly cwd: string }> | undefined;
  /** Package-owned skills supplied by the embedding application. */
  readonly systemSkillBundles?: readonly HostSystemSkillBundle[] | undefined;
  /**
   * The read-only revision history the `revisions` tool answers from (S28).
   *
   * `createProjectRevisions(...).history` on a disk host. Omit it and the tool
   * is not offered rather than offered-and-failing — the same rule every other
   * client here follows.
   */
  readonly revisions?: ProjectRevisions['history'] | undefined;
  /**
   * The machines facet this host serves its machine tools over, once the
   * composition has negotiated and granted it — the daemon under
   * `tau serve --machines`, the desktop services utility. Omit it and no
   * machine tool is offered rather than offered-and-failing (the same rule
   * every other client here follows); a facet that is present but not
   * `available` offers none either.
   */
  readonly machines?: RuntimeTransportFacet<MachineClient> | undefined;
  /**
   * The `tau.json` id of the project `workspaceRoot` holds: the desktop's
   * attached project, or the daemon's served root. Every artifact `request_print`
   * slices names it, which is how a machine host finds the file again. Omit it
   * and `request_print` is not offered: a host that cannot name its project
   * never guesses one.
   */
  readonly projectId?: string | undefined;
};

/**
 * Build the daemon's tool registry.
 *
 * @param options - Workspace root and the optional runtime client.
 * @returns A {@link ToolRegistry} over the canonical chat RPC dispatcher.
 * @public
 *
 * @example <caption>File tools only, with no runtime attached</caption>
 * ```typescript
 * import { createHostToolRegistry } from '@taucad/host';
 *
 * const registry = createHostToolRegistry({ workspaceRoot: process.cwd() });
 * ```
 */
export const createHostToolRegistry = (options: HostToolRegistryOptions): ToolRegistry => {
  const rooted = new Map<string, ToolRegistry>();
  const liveProvider =
    options.filesystem?.(options.workspaceRoot) ?? new NodeFsProvider(options.workspaceRoot, { policy: tauPathPolicy });
  const liveWorkbenchView = composeView({ filesystem: liveProvider }, { consumer: 'user', policy: tauPathPolicy });
  const liveMutations = new ResourceQueue();
  const skillRegistry =
    options.systemSkillBundles === undefined ? undefined : createSkillBundleRegistry(options.systemSkillBundles);
  const systemSkills = skillRegistry?.bundles.map((bundle) => ({
    slug: bundle.slug,
    name: bundle.name,
    version: bundle.version,
    whenToUse: bundle.whenToUse,
    skillMarkdown: bundle.body,
    fingerprint: bundle.fingerprint,
    files: bundle.files,
  }));
  const readSkillResource: ReadSkillResource = async (resource, input) => {
    input.signal?.throwIfAborted();
    const bytes = new Uint8Array(await readFile(new URL(resource.url)));
    input.signal?.throwIfAborted();
    return bytes;
  };
  const skillOverlay =
    skillRegistry === undefined ? undefined : createSkillBundleOverlay(skillRegistry, readSkillResource);

  /**
   * Every tool this host serves, over one absolute root.
   *
   * @param workspaceRoot - The tree this registry's tools read and write.
   * @returns The registry for that tree.
   */
  const registryFor = (workspaceRoot: string): ToolRegistry => {
    /* The fence and the skill overlay are one function on every host (charter
     * D1): this provider is the checkout, and what the agent sees over it is
     * the composed view. The skill resolver below reads the disk directly and
     * mutates nothing. */
    const provider =
      workspaceRoot === options.workspaceRoot
        ? liveProvider
        : (options.filesystem?.(workspaceRoot) ?? new NodeFsProvider(workspaceRoot, { policy: tauPathPolicy }));
    const view = composeView(
      { filesystem: provider },
      {
        consumer: 'agent',
        policy: tauPathPolicy,
        ...(skillOverlay === undefined ? {} : { overlays: [skillOverlay] }),
      },
    );
    const recordView = composeView({ filesystem: provider }, { consumer: 'user', policy: tauPathPolicy });
    const mutations = workspaceRoot === options.workspaceRoot ? liveMutations : new ResourceQueue();
    const { runtimeClient } = options;

    const requireRuntime = async (input: { readonly signal?: AbortSignal } = {}): Promise<HostRuntimeClient> => {
      input.signal?.throwIfAborted();
      if (!runtimeClient) {
        throw Object.assign(new Error('This Tau Host has no runtime attached.'), { code: 'RUNTIME_UNAVAILABLE' });
      }
      const client = await runtimeClient(workspaceRoot);
      input.signal?.throwIfAborted();
      return client;
    };

    const runtime = {
      async evaluate(input: Parameters<HostRuntimeClient['evaluate']>[0]) {
        const client = await requireRuntime(input);
        return client.evaluate(input);
      },
      async export(format: string, exportOptions: Parameters<HostRuntimeClient['export']>[1]) {
        const client = await requireRuntime(exportOptions);
        return client.export(format, exportOptions);
      },
    };
    const { kernelClient, graphics, images } = createRuntimeAgentClients({
      runtime,
      mapRuntimeError: runtimeFailure,
      async exportImage(job) {
        const client = await requireRuntime(job);
        const bytes = job.sourceFormat === 'svg' ? new TextEncoder().encode(job.content) : job.content;
        const result = await client.transcode({
          from: job.sourceFormat,
          to: job.format,
          files: [
            {
              name: job.sourceFormat === 'svg' ? 'drawing.svg' : 'render.glb',
              mimeType: job.sourceFormat === 'svg' ? 'image/svg+xml' : 'model/gltf-binary',
              bytes,
            },
          ],
          options: job.exportOptions,
          signal: job.signal,
        });
        if (!result.success) {
          const message = issueMessage(result.issues, 'Image capture failed');
          const overLimit = result.issues.some(
            (issue) =>
              issue.details !== null &&
              typeof issue.details === 'object' &&
              'type' in issue.details &&
              issue.details.type === 'render' &&
              'code' in issue.details &&
              issue.details.code === 'parse' &&
              /accessor \d+ count \d+ exceeds \d+|declared accessor values exceed \d+/u.test(issue.message),
          );
          throw Object.assign(new Error(message), overLimit ? { code: 'RESULT_TOO_LARGE' } : {});
        }
        return result.data;
      },
    });
    const { parameterActor } = options;
    const parameters = parameterActor
      ? createRuntimeParameterAgentClient({
          mapRuntimeError: runtimeFailure,
          parameterActorFor: async (targetFile) => parameterActor(workspaceRoot, targetFile),
        })
      : undefined;

    /** Workspace skills remain authored files; package skills come from the injected registry. */
    const skillReaders = {
      readFile: async (path: string): Promise<Uint8Array<ArrayBuffer>> =>
        new Uint8Array(await provider.readFile(assertRootedPath(path))),
      listDirectory: async (path: string): Promise<ReadonlyArray<{ name: string; isFolder: boolean }>> => {
        const directory = assertRootedPath(path);
        const names = await provider.readdir(directory);
        return Promise.all(
          names.map(async (name) => {
            const entry = await provider.stat(`${directory}/${name}`);
            return { name, isFolder: entry.type === 'dir' };
          }),
        );
      },
    };
    const skillResolver: RpcSkillResolver = {
      resolveSkill: async (skillName) => createSkillResolver({ ...skillReaders, systemSkills }).resolveSkill(skillName),
    };

    const runnerFactory =
      options.geospecRunner === false
        ? undefined
        : (options.geospecRunner ??
          (geoSpecEngineResolves() ? async () => createHostGeoSpecRunner(workspaceRoot) : undefined));

    /**
     * `test_model` in process: discovery walks the real directory, the runner
     * executes the selected specs, and the projection is the same one the browser
     * worker returns — the only host-specific part is which runner ran.
     */
    const geospec: RpcGeoSpecClient | undefined = runnerFactory && {
      async runTests(args, context) {
        try {
          context?.signal?.throwIfAborted();
          const runner = await runnerFactory(workspaceRoot);
          const abortRunner = (): void => {
            runner.abort('test_model request cancelled');
          };
          context?.signal?.addEventListener('abort', abortRunner, { once: true });
          try {
            context?.signal?.throwIfAborted();
            const output = await runGeoSpecTests({
              discovery: {
                readdir: async (path) => readdir(path),
                stat: async (path) => {
                  const entry = await stat(path);
                  return { kind: entry.isDirectory() ? 'directory' : 'file' };
                },
              },
              runner,
              projectPath: workspaceRoot,
              args,
              // R4/I5: absent on a runner with no Tau runtime behind it — a CLI-style model loader
              // resolves its own sources, and an unproven verdict must not claim a revision.
              ...(runner.sourceRevisions === undefined ? {} : { sourceRevisions: runner.sourceRevisions }),
            });
            context?.signal?.throwIfAborted();
            return { success: true, ...output };
          } finally {
            context?.signal?.removeEventListener('abort', abortRunner);
            await runner.close();
          }
        } catch (error) {
          return toRpcError(error);
        }
      },
    };

    /* `request_print` needs every leg of the print path: the project id here
     * names the artifact's project, and the registry offers the tool only when
     * a runtime to slice with and a machine to ask are attached too. A
     * candidate turn's slice lands in its checkout, which the machine host
     * finds through the same project id. */
    const { revisions, machines, projectId } = options;
    return createChatToolRegistry({
      fileSystemFor: (signal) => createProviderRpcFileSystem({ provider: view, mutations, signal }),
      recordFileSystemFor: (signal) => createProviderRpcFileSystem({ provider: recordView, mutations, signal }),
      workbenchFileSystemFor: (signal) =>
        createProviderRpcFileSystem({ provider: liveWorkbenchView, mutations: liveMutations, signal }),
      workbench: createRuntimeWorkbenchClient(
        runtimeClient === undefined ? undefined : async () => runtimeClient(options.workspaceRoot),
      ),
      ...(runtimeClient === undefined ? {} : { kernelClient, graphics, images }),
      ...(parameters === undefined ? {} : { parameters }),
      ...(geospec === undefined ? {} : { geospec }),
      geospecAuthoringMode: options.geospecAuthoringMode,
      ...(revisions === undefined ? {} : { revisions }),
      ...(projectId === undefined
        ? {}
        : {
            print: {
              projectId,
              readArtifact: async ({ path, signal }) => {
                signal.throwIfAborted();
                const bytes = await recordView.readFile(assertRootedPath(path));
                signal.throwIfAborted();
                return bytes;
              },
            },
          }),
      ...(machines === undefined ? {} : { machines }),
      skillResolver,
      testingEnabled: geospec !== undefined,
    });
  };

  /**
   * The registry for one root, built once and kept while that root is live.
   *
   * Memoized rather than rebuilt per call, because a registry compiles every
   * tool's JSON Schema and a turn invokes many tools. Bounded by the live
   * checkouts, because a checkout lives only as long as the turns it serves: a
   * memo that only grew would keep one registry per checkout this host has ever
   * run, for the life of the host (5-review S4). Eviction runs where the map
   * would grow, so a steady state costs nothing.
   *
   * @param workspaceRoot - The tree the calling turn works in.
   * @returns That tree's registry.
   */
  const rootedRegistry = (workspaceRoot: string): ToolRegistry => {
    const existing = rooted.get(workspaceRoot);
    if (existing) {
      return existing;
    }
    const live = new Set([options.workspaceRoot, ...[...(options.checkouts?.values() ?? [])].map(({ cwd }) => cwd)]);
    for (const cached of rooted.keys()) {
      if (!live.has(cached)) {
        rooted.delete(cached);
      }
    }
    const created = registryFor(workspaceRoot);
    rooted.set(workspaceRoot, created);
    return created;
  };

  const live = rootedRegistry(options.workspaceRoot);
  return {
    /* The tool *list* is the host's, not the turn's: every root serves the same
     * names, descriptions and schemas, and the list is read before any run
     * exists. */
    list: () => live.list(),
    /* An answer names no checkout: every root's registry settles it through the same machine client (D5). */
    answerApproval: async (answer) => live.answerApproval?.(answer),
    invoke: async (invocation) =>
      rootedRegistry(
        (invocation.runId === undefined ? undefined : options.checkouts?.get(invocation.runId)?.cwd) ??
          options.workspaceRoot,
      ).invoke(invocation),
  };
};
