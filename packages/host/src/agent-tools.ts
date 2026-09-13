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

import { readFile, readdir, stat } from 'node:fs/promises';

import { ResourceQueue } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { rpcClientErrorCode } from '@taucad/chat';
import { toRpcError } from '@taucad/chat/rpc';
import type { RpcGeoSpecClient, RpcSkillResolver } from '@taucad/chat/rpc';
import {
  createChatToolRegistry,
  createProviderRpcFileSystem,
  createSkillBundleOverlay,
  createSkillBundleRegistry,
} from '@taucad/agent-tools/registry';
import type { ReadSkillResource } from '@taucad/agent-tools/registry';
import { createSkillResolver } from '@taucad/agent-tools/skills';
import { createRuntimeAgentClients } from '@taucad/agent-tools/runtime';
import { createProjectModelLoader, runGeoSpecTests } from '@taucad/agent-tools/geospec';
import type { GeoSpecRuntimeClient } from 'geospec/model';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import { assertRootedPath } from '@taucad/utils/path';

/* Not `@taucad/types`: that barrel is an `export type *` the dts bundler cannot
 * follow, and it bundles rather than externalises. `@taucad/runtime` is a peer,
 * and re-exports the same declaration by name, so the emitted `.d.mts` keeps it
 * as an external import. */
import type { ExportFile } from '@taucad/runtime/types';
import type { RuntimeClient } from '@taucad/runtime/client';

import type { ToolRegistry } from '@taucad/agent-host';

import type { ProjectRevisions } from '#revisions.js';

/** Runtime surface accepted by the host's GeoSpec model loader. @public */
export type HostGeoSpecRuntimeClient = GeoSpecRuntimeClient;

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
export type HostRuntimeClient = Pick<RuntimeClient, 'evaluate' | 'export' | 'transcode'>;

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
): { readonly success: false; readonly errorCode: 'UNKNOWN'; readonly message: string } => {
  const reason = error instanceof Error ? error.message : String(error);
  const isUnavailable =
    error instanceof Error && (error as Error & { readonly code?: unknown }).code === 'RUNTIME_UNAVAILABLE';
  return {
    success: false,
    errorCode: rpcClientErrorCode.unknown,
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
): Promise<GeoSpecRunner> => {
  await import('@taucad/geospec-engine/register/node');
  const [{ createGeoSpecNodeRunner, createNodeVmFileSystem }, { createModelLoader }] = await Promise.all([
    import('geospec/runner/node'),
    import('geospec/model'),
  ]);
  return createGeoSpecNodeRunner({
    projectPath: workspaceRoot,
    filesystem: createNodeVmFileSystem(workspaceRoot),
    modelLoader: runtime
      ? createProjectModelLoader({ runtime }).modelLoader
      : createModelLoader({ projectPath: workspaceRoot }),
  });
};

/** Options for {@link createHostToolRegistry}. @public */
export type HostToolRegistryOptions = {
  /** Absolute workspace root every file tool is confined to. */
  readonly workspaceRoot: string;
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
  /**
   * Builds the GeoSpec runner one `test_model` call runs on, in the root the
   * calling turn works in. Defaults to the engine's Node runner when
   * `@taucad/geospec-engine` resolves; pass `false` to withhold `test_model`
   * from an installation that has the engine.
   */
  readonly geospecRunner?: ((workspaceRoot: string) => Promise<GeoSpecRunner>) | false | undefined;
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
    const provider = new NodeFsProvider(workspaceRoot);
    const view = composeView(
      { filesystem: provider },
      { consumer: 'agent', ...(skillOverlay === undefined ? {} : { overlays: [skillOverlay] }) },
    );
    const mutations = new ResourceQueue();
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
          throw new Error(issueMessage(result.issues, 'Image capture failed'));
        }
        return result.data;
      },
    });

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
      async runTests(args) {
        try {
          const runner = await runnerFactory(workspaceRoot);
          try {
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
            });
            return { success: true, ...output };
          } finally {
            await runner.close();
          }
        } catch (error) {
          return toRpcError(error);
        }
      },
    };

    return createChatToolRegistry({
      fileSystemFor: (signal) => createProviderRpcFileSystem({ provider: view, mutations, signal }),
      ...(runtimeClient === undefined ? {} : { kernelClient, graphics, images }),
      ...(geospec === undefined ? {} : { geospec }),
      ...(options.revisions === undefined ? {} : { revisions: options.revisions }),
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
    invoke: async (invocation) =>
      rootedRegistry(
        (invocation.runId === undefined ? undefined : options.checkouts?.get(invocation.runId)?.cwd) ??
          options.workspaceRoot,
      ).invoke(invocation),
  };
};
