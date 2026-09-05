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

import { createRequire } from 'node:module';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { ResourceQueue } from '@taucad/filesystem';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { rpcClientErrorCode } from '@taucad/chat';
import { toRpcError } from '@taucad/chat/rpc';
import type {
  RpcGeoSpecClient,
  RpcGraphicsClient,
  RpcImageClient,
  RpcRuntimeClient,
  RpcSkillResolver,
} from '@taucad/chat/rpc';
import { createChatToolRegistry, createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { createSkillResolver } from '@taucad/agent-tools/skills';
import { buildCaptureExportOptions, canonicalCaptureViews } from '@taucad/agent-tools/capture';
import { runGeoSpecTests } from '@taucad/agent-tools/geospec';
import type { GeoSpecRunner } from 'geospec/runner/worker';
import { assertRootedPath } from '@taucad/utils/path';

/* Not `@taucad/types`: that barrel is an `export type *` the dts bundler cannot
 * follow, and it bundles rather than externalises. `@taucad/runtime` is a peer,
 * and re-exports the same declaration by name, so the emitted `.d.mts` keeps it
 * as an external import. */
import type { ExportFile } from '@taucad/runtime/types';

import type { ToolRegistry } from '@taucad/agent-host';

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
 * Declared structurally rather than imported so this module never pins one
 * runtime client implementation: `tau serve` passes the loopback client bound
 * to its supervised child, and a test passes a fake.
 *
 * @public
 */
export type HostRuntimeClient = {
  render(input: {
    readonly source: { readonly path: string };
    readonly parameters: Record<string, never>;
    readonly content: { readonly includeEdges: boolean };
  }): Promise<{
    readonly superseded: boolean;
    readonly geometry: { readonly success: boolean; readonly issues: readonly unknown[] };
  }>;
  export(
    format: string,
    options?: { readonly exportOptions?: Record<string, unknown> },
  ): Promise<
    | { readonly success: true; readonly data: readonly HostExportFile[] }
    | { readonly success: false; readonly issues: ReadonlyArray<{ readonly message: string }> }
  >;
  readonly capabilities?:
    | { readonly routes: ReadonlyArray<{ readonly targetFormat: string; readonly kernelId: string }> }
    | undefined;
  readonly activeKernelId?: string | undefined;
};

/** Capture size in pixels, matching the browser worker's. */
const captureSize = 1600;

const dataUrl = (file: HostExportFile): string =>
  `data:${file.mimeType};base64,${Buffer.from(file.bytes).toString('base64')}`;

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
    const resolve = createRequire(import.meta.url);
    resolve.resolve('@taucad/geospec-engine/register/node');
    resolve.resolve('geospec/runner/node');
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
 * @returns A runner scoped to one `test_model` call.
 */
const createNodeGeoSpecRunner = async (workspaceRoot: string): Promise<GeoSpecRunner> => {
  await import('@taucad/geospec-engine/register/node');
  const [{ createGeoSpecNodeRunner, createNodeVmFileSystem }, { createModelLoader }] = await Promise.all([
    import('geospec/runner/node'),
    import('geospec/model'),
  ]);
  return createGeoSpecNodeRunner({
    projectPath: workspaceRoot,
    filesystem: createNodeVmFileSystem(workspaceRoot),
    modelLoader: createModelLoader({ projectPath: workspaceRoot }),
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
   */
  readonly runtimeClient?: (() => Promise<HostRuntimeClient>) | undefined;
  /**
   * Builds the GeoSpec runner one `test_model` call runs on. Defaults to the
   * engine's Node runner when `@taucad/geospec-engine` resolves; pass `false`
   * to withhold `test_model` from an installation that has the engine.
   */
  readonly geospecRunner?: (() => Promise<GeoSpecRunner>) | false | undefined;
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
  const provider = new NodeFsProvider(options.workspaceRoot);
  const mutations = new ResourceQueue();
  const { runtimeClient } = options;

  const requireRuntime = async (): Promise<HostRuntimeClient> => {
    if (!runtimeClient) {
      throw Object.assign(new Error('This Tau Host has no runtime attached.'), { code: 'RUNTIME_UNAVAILABLE' });
    }
    return runtimeClient();
  };

  const render = async (targetFile: string) => {
    const client = await requireRuntime();
    let result = await client.render({
      source: { path: assertRootedPath(targetFile) },
      parameters: {},
      content: { includeEdges: true },
    });
    while (result.superseded) {
      // oxlint-disable-next-line no-await-in-loop -- a superseded render must retry against the newest file generation.
      result = await client.render({
        source: { path: assertRootedPath(targetFile) },
        parameters: {},
        content: { includeEdges: true },
      });
    }
    return result.geometry;
  };

  /** The best route this runtime's *active* kernel offers for one format. */
  const routeFor = async (format: string): Promise<string | undefined> => {
    const client = await requireRuntime();
    const active = client.activeKernelId;
    return client.capabilities?.routes.find(
      (route) => route.targetFormat === format && (active === undefined || route.kernelId === active),
    )?.targetFormat;
  };

  const kernelClient: RpcRuntimeClient = {
    async getKernelResult(targetFile) {
      try {
        const geometry = await render(targetFile);
        return {
          success: true,
          status: geometry.success ? 'ready' : 'error',
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime issue rows are the kernel-issue shape the RPC declares.
          kernelIssues: geometry.issues as never,
        };
      } catch (error) {
        return runtimeFailure(error, targetFile);
      }
    },
  };

  const graphics: RpcGraphicsClient = {
    async exportGeometry({ targetFile, format }) {
      try {
        const geometry = await render(targetFile);
        if (!geometry.success) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: issueMessage(geometry.issues as ReadonlyArray<{ readonly message: string }>, 'Render failed'),
          };
        }
        const route = await routeFor(format);
        if (!route) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: `Export format ${format} is not available for ${targetFile}`,
          };
        }
        const client = await requireRuntime();
        const result = await client.export(route);
        return result.success
          ? { success: true, files: [...result.data] }
          : {
              success: false,
              errorCode: rpcClientErrorCode.unknown,
              message: issueMessage(result.issues, 'Geometry export failed'),
            };
      } catch (error) {
        return runtimeFailure(error, targetFile);
      }
    },
  };

  const images: RpcImageClient = {
    async captureImages(input) {
      try {
        const geometry = await render(input.targetFile);
        if (!geometry.success) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: issueMessage(geometry.issues as ReadonlyArray<{ readonly message: string }>, 'Render failed'),
          };
        }
        const route = await routeFor('webp');
        if (!route) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: `This runtime cannot capture ${input.targetFile} as an image`,
          };
        }
        const multiAngle = input.mode === 'multi_angle';
        const exportOptions = buildCaptureExportOptions({
          mode: input.mode,
          size: captureSize,
          ...(input.includeEdges === undefined ? {} : { includeEdges: input.includeEdges }),
        });
        const client = await requireRuntime();
        const result = await client.export(route, { exportOptions });
        if (!result.success) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: issueMessage(result.issues, 'Image capture failed'),
          };
        }
        const expected = multiAngle ? canonicalCaptureViews.length : 1;
        if (result.data.length !== expected || result.data.some((file) => file.bytes.length === 0)) {
          return {
            success: false,
            errorCode: rpcClientErrorCode.unknown,
            message: `Image capture expected ${String(expected)} non-empty artifact(s)`,
          };
        }
        return {
          success: true,
          images: multiAngle
            ? canonicalCaptureViews.map((view, index) => ({ view: view.id, dataUrl: dataUrl(result.data[index]!) }))
            : [{ view: 'isometric', dataUrl: dataUrl(result.data[0]!) }],
        };
      } catch (error) {
        return runtimeFailure(error, input.targetFile);
      }
    },
  };

  /**
   * Skills are files, so the resolver reads the workspace directly rather than
   * going back through the RPC filesystem. There is no system-skill layer here:
   * the UI's catalog is built from bundler-only `?raw` imports of each kernel
   * package's agent guide, and a daemon has no bundler.
   */
  const skillResolver: RpcSkillResolver = createSkillResolver({
    readFile: async (path) => new Uint8Array(await provider.readFile(assertRootedPath(path))),
    listDirectory: async (path) => {
      const root = join(options.workspaceRoot, assertRootedPath(path));
      const names = await readdir(root);
      return Promise.all(
        names.map(async (name) => {
          const entry = await stat(join(root, name));
          return { name, isFolder: entry.isDirectory() };
        }),
      );
    },
  });

  const runnerFactory =
    options.geospecRunner === false
      ? undefined
      : (options.geospecRunner ??
        (geoSpecEngineResolves() ? async () => createNodeGeoSpecRunner(options.workspaceRoot) : undefined));

  /**
   * `test_model` in process: discovery walks the real directory, the runner
   * executes the selected specs, and the projection is the same one the browser
   * worker returns — the only host-specific part is which runner ran.
   */
  const geospec: RpcGeoSpecClient | undefined = runnerFactory && {
    async runTests(args) {
      try {
        const runner = await runnerFactory();
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
            projectPath: options.workspaceRoot,
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
    fileSystemFor: (signal) => createProviderRpcFileSystem({ provider, mutations, signal }),
    ...(runtimeClient === undefined ? {} : { kernelClient, graphics, images }),
    ...(geospec === undefined ? {} : { geospec }),
    skillResolver,
    testingEnabled: geospec !== undefined,
  });
};
