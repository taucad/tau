import type { z } from 'zod';
import type { createComputeWorkerTransport } from '#compute-worker-transport.js';
import type { DotnetRequest } from '@taucad/dotnet-kernel-core';
import type { PicogkSession } from '#picogk-session.js';
import { transformGltfExportBytes } from '@taucad/geometry-core';
import {
  asBuffer,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  nonemptyExportFiles,
} from '@taucad/runtime/kernel';
import type { KernelDefinition, KernelServices, KernelIssue, TessellationReport } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';

import { picogkArtifactToGlb, picogkTessellation, picogkTessellationSchema } from '#picogk-mesh.js';
import { picogkAnalysisSchema, picogkBuildSchema, picogkResolveSchema } from '#picogk.protocol.js';
import type { PicogkBuild, PicogkMeshing } from '#picogk.protocol.js';
import { picogkExportSchemas, picogkPreviewAdaptivity, picogkRenderSchema } from '#picogk-render.schemas.js';
import { PicogkWorkerError } from '#picogk-worker-error.js';
import { libraryVersionMismatches } from '#project-manifest.js';

/** Immutable mesh evidence retained by the runtime for display and export. @public */
export type PicogkNativeHandle = {
  readonly glb: Uint8Array<ArrayBuffer>;
  readonly authoredFiles?: ReadonlyArray<{
    readonly name: string;
    readonly mimeType: string;
    readonly bytes: Uint8Array<ArrayBuffer>;
  }>;
  /** What the delivered mesh cost, reported with each rendered view. */
  readonly tessellation?: TessellationReport;
};

/** Snapshot of a native handle: its GLB bytes, with the mesh cost when the build reported one. */
type PicogkSerializedHandle =
  | Uint8Array<ArrayBuffer>
  | Readonly<{
      glb: Uint8Array<ArrayBuffer>;
      tessellation?: TessellationReport;
      authoredFiles?: PicogkNativeHandle['authoredFiles'];
    }>;

// Tau metadata remains execution context; the generated root thumbnail is not an execution input.
const tauSystemArtifacts = new Set(['tau.json', 'thumbnail.webp']);

/** Structured issues from environment initialization or shared geometry operations. @internal */
export class PicogkKernelError extends Error {
  public readonly issues: KernelIssue[];

  public constructor(issues: KernelIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = issues;
    this.name = 'PicogkKernelError';
  }
}

const issuesFrom = (error: unknown, fileName?: string): KernelIssue[] => {
  if (error instanceof PicogkWorkerError) {
    return error.issues.map(({ code: workerCode, type: workerType, ...issue }) => ({
      ...issue,
      code: 'RUNTIME',
      type: workerType === 'syntax' || workerType === 'validation' ? 'compilation' : workerType,
      details: { workerCode, workerType },
    }));
  }
  return [
    {
      message: error instanceof Error ? error.message : String(error),
      code: 'RUNTIME',
      type: 'runtime',
      severity: 'error',
      ...(fileName ? { location: { fileName, startLineNumber: 1, startColumn: 1 } } : {}),
    },
  ];
};

const sameMeshing = (requested: PicogkMeshing, applied: PicogkMeshing | undefined): boolean =>
  applied !== undefined && applied.adaptivity === requested.adaptivity && applied.relax === requested.relax;

const meshingUnsupportedIssue = (requested: PicogkMeshing): KernelIssue => ({
  message: `This PicoGK runtime cannot mesh adaptively (meshAdaptivity ${String(requested.adaptivity)}). Set meshAdaptivity to 0 for the uniform mesh, or update the PicoGK runtime.`,
  code: 'RUNTIME',
  type: 'kernel',
  severity: 'error',
  details: { reason: 'meshing-unsupported', meshAdaptivity: requested.adaptivity, meshRelax: requested.relax },
});

/** Environment-owned resources behind the shared PicoGK behavior. @internal */
export type PicogkKernelContext = {
  readonly mirror: {
    readonly sync: (services: KernelServices) => Promise<readonly string[]>;
    readonly cleanup: () => Promise<void>;
  };
  readonly session: Pick<PicogkSession, 'recycle' | 'sampleResident' | 'cleanup'> & {
    readonly request: <Result>(
      request: DotnetRequest<Result> & { readonly operationId: KernelServices['operationId'] },
    ) => Promise<Result>;
    readonly readArtifact: (
      result: Pick<PicogkBuild, 'artifactPath' | 'byteLength' | 'sha256'>,
    ) => Promise<Uint8Array<ArrayBuffer>>;
  };
  readonly computeTransport?: ReturnType<typeof createComputeWorkerTransport>;
  readonly artifactPath: string;
};

/**
 * Bind the existing PicoGK behavior to environment-owned initialization.
 * @internal
 * @param setup - Environment options, cache identity and resource acquisition.
 * @returns The existing kernel capability with environment-specific resource ownership.
 */
/* oxlint-disable typescript/explicit-module-boundary-types -- Preserve defineKernel's exact inferred view/export registration, as in the existing OpenRSCAD factory. */
export const createPicogkKernelDefinition = <OptionsSchema extends z.ZodType>(setup: {
  readonly optionsSchema: OptionsSchema;
  readonly version: string;
  readonly cancellation?: 'cooperative';
  readonly authoredOutputs?: boolean;
  readonly initialize: KernelDefinition<
    'picogk',
    readonly ['cs'],
    PicogkKernelContext,
    PicogkNativeHandle,
    PicogkSerializedHandle,
    OptionsSchema,
    typeof picogkRenderSchema,
    Record<never, never>,
    Record<never, never>
  >['initialize'];
}) =>
  defineKernel({
    id: 'picogk',
    extensions: ['cs'],
    name: 'PicogkKernel',
    version: setup.version,
    optionsSchema: setup.optionsSchema,
    evaluateOptionsSchema: picogkRenderSchema,
    // D2: `cancel` stops an in-flight build at the model's next viewer call and keeps the worker warm.
    ...(setup.cancellation === undefined ? {} : { cancellation: setup.cancellation }),
    /* A marching-cubes mesh has no B-rep edges, so the complete native answer to `includeEdges` is
     * the model's own lines and no overlay. Claiming it keeps the fallback dihedral detector, which
     * finds only voxel staircase and scales with the largest meshes Tau renders, off every PicoGK
     * mesh. Topology is not claimed: it is always written and cannot yet be withheld on request. */
    views: { model: { title: 'Model', mimeType: 'model/gltf-binary', content: ['includeEdges'] } },
    exports: {
      ...(setup.authoredOutputs
        ? {
            authoredStl: { title: 'Authored STL files', mimeType: 'model/stl', extension: 'stl' },
            authoredVdb: { title: 'Authored VDB files', mimeType: 'application/vnd.openvdb', extension: 'vdb' },
          }
        : {}),
      glb: {
        title: 'glTF binary',
        mimeType: 'model/gltf-binary',
        extension: 'glb',
        optionsSchema: picogkExportSchemas.glb,
        content: ['includeEdges'],
      },
      gltf: {
        title: 'glTF JSON',
        mimeType: 'model/gltf+json',
        extension: 'gltf',
        optionsSchema: picogkExportSchemas.gltf,
        content: ['includeEdges'],
      },
    },

    async initialize(options, services) {
      return setup.initialize(options, services);
    },

    async resolve({ entryPath }, services, context) {
      try {
        const paths = await context.mirror.sync(services);
        /* The worker's Roslyn parse picks the C# this entry compiles with: its program and every
         * helper. Another program in the project is an independent model, so its edits never
         * re-render this one. Other files stay dependencies: a model may read any project asset. */
        let compiled: ReadonlySet<string> | undefined;
        try {
          const { sources } = await context.session.request({
            operationId: services.operationId,
            method: 'resolve',
            params: { entryPath },
            schema: picogkResolveSchema,
            signal: services.signal,
          });
          compiled = new Set(sources);
        } catch (error) {
          /* An entry the worker cannot select, such as a helper two programs could claim, depends on
           * every file, because any edit can settle it. `analyze` then reports why, located. */
          if (!(error instanceof PicogkWorkerError)) {
            throw error;
          }
        }
        return {
          resolved: paths.filter(
            (path) => !tauSystemArtifacts.has(path) && (!path.endsWith('.cs') || (compiled?.has(path) ?? true)),
          ),
          unresolved: [],
        };
      } catch (error) {
        throw new PicogkKernelError(issuesFrom(error, entryPath));
      }
    },

    async describe({ entryPath }, services, context) {
      await context.mirror.sync(services);
      /* D8: the worker's own stage timings are attributes on the span that measured the request. The
       * span's duration is the total, so nothing here times the call a second time. */
      const span = services.tracer.startSpan('picogk.analyze', { entryPath });
      try {
        const analysis = await context.session.request({
          operationId: services.operationId,
          method: 'analyze',
          params: { entryPath },
          schema: picogkAnalysisSchema,
          signal: services.signal,
        });
        span.end({ ...analysis.timings });
        return createKernelSuccess({
          parameters: createKernelParameterDeclaration(analysis.defaultParameters, analysis.jsonSchema, {
            id: 'urn:taucad:picogk:parameters',
            name: 'PicoGkParameters',
          }),
        });
      } catch (error) {
        return createKernelError(issuesFrom(error, entryPath));
      } finally {
        /* Idempotent: the success path already ended it with its attributes. A failed request must
         * still close it, or the tracer keeps parenting later spans under a span that never ended. */
        span.end();
      }
    },

    async evaluate({ entryPath, parameters, options }, services, context) {
      /* Only an adaptive request crosses the protocol, so an explicit 0 sends the uniform request. An unset value asks
       * for Balanced: whether the worker meshes adaptively is known only from its echo, because the ready frame
       * carries no capability and the published layers predate the echo. */
      const defaulted = options.meshAdaptivity === undefined;
      const adaptivity = options.meshAdaptivity ?? picogkPreviewAdaptivity;
      const meshing = adaptivity > 0 ? { adaptivity, relax: options.meshRelax } : undefined;
      const paths = await context.mirror.sync(services);
      // D35: the project's own references must name the PicoGK this kernel runs, or it runs differently outside Tau.
      const manifestIssues: KernelIssue[] = [];
      for (const manifest of paths.filter((path) => !path.includes('/') && path.endsWith('.csproj'))) {
        // oxlint-disable-next-line no-await-in-loop -- A project root holds one or two project files.
        const text = await services.filesystem.readFile(manifest, 'utf8');
        manifestIssues.push(...libraryVersionMismatches(manifest, text));
      }
      const span = services.tracer.startSpan('picogk.build', { entryPath });
      let computeJob: Awaited<ReturnType<ReturnType<typeof createComputeWorkerTransport>['open']>>;
      try {
        try {
          computeJob = await context.computeTransport?.open({
            compute: services.compute,
            sessionRoot: context.artifactPath,
            signal: services.signal,
          });
        } catch (error) {
          services.signal.throwIfAborted();
          services.logger.debug(`PicoGK compute preload bypass: ${String(error)}`);
        }
        const result = await context.session.request({
          operationId: services.operationId,
          method: 'build',
          params: {
            entryPath,
            parameters,
            ...(computeJob ? { computeReuse: computeJob.request } : {}),
            ...(meshing ? { meshing } : {}),
          },
          schema: picogkBuildSchema,
          signal: computeJob?.signal ?? services.signal,
          // W17: an abort stops the build cooperatively rather than ending the worker generation.
          cancelMethod: 'cancel',
        });
        try {
          if (meshing && !sameMeshing(meshing, result.meshing)) {
            /* A worker that predates adaptive meshing ignores the request and builds the uniform mesh, which its
             * report states by carrying no meshing. The default accepts that mesh, built once; an explicit request,
             * or a worker that echoes other meshing, is refused rather than shown as adaptive. */
            if (!defaulted || result.meshing !== undefined) {
              throw new PicogkKernelError([meshingUnsupportedIssue(meshing)]);
            }
            services.logger.debug('PicoGK worker meshed the default view uniformly: it predates adaptive meshing.');
          }
          const readSpan = services.tracer.startSpan('picogk.artifact-read');
          let artifact;
          try {
            artifact = await context.session.readArtifact(result);
          } finally {
            readSpan.end();
          }
          const transformSpan = services.tracer.startSpan('picogk.glb-transform');
          let glb;
          const issues: KernelIssue[] = [
            ...manifestIssues,
            ...(result.warnings ?? []).map(
              ({ code: workerCode, type: workerType, ...warning }): KernelIssue => ({
                ...warning,
                code: 'INVALID_ANNOTATION',
                type: 'kernel',
                details: {
                  producer: { kernelId: 'picogk' },
                  workerCode,
                  workerType,
                },
              }),
            ),
          ];
          try {
            glb = await picogkArtifactToGlb(artifact, result, (mechanismIssues) => issues.push(...mechanismIssues));
          } finally {
            transformSpan.end();
          }
          services.signal.throwIfAborted();
          if (computeJob) {
            const receipt = await computeJob.delivered(result.computeReuseManifest);
            if (receipt.omission) {
              services.logger.debug(`PicoGK compute result bypass: ${receipt.omission.reason}`);
            }
            computeJob = undefined;
          }
          const { processWorkingSetBytes, ...metrics } = result.metrics;
          span.end({
            ...result.timings,
            ...metrics,
            ...(processWorkingSetBytes === null ? {} : { processWorkingSetBytes }),
          });
          const authoredFiles: Array<NonNullable<PicogkNativeHandle['authoredFiles']>[number]> = [];
          if (setup.authoredOutputs) {
            for (const output of result.authoredOutputs ?? []) {
              // oxlint-disable-next-line no-await-in-loop -- Transfer one receipt at a time to bound transient chunk memory.
              const bytes = await context.session.readArtifact(output);
              authoredFiles.push({ name: output.name, mimeType: output.mimeType, bytes });
            }
          }
          services.signal.throwIfAborted();
          const handle: PicogkNativeHandle = {
            glb,
            tessellation: picogkTessellation(result),
            ...(setup.authoredOutputs ? { authoredFiles } : {}),
          };
          return {
            handle,
            issues,
            ...(setup.authoredOutputs
              ? {
                  exports: [
                    'glb',
                    'gltf',
                    ...(authoredFiles.some((file) => file.mimeType === 'model/stl') ? (['authoredStl'] as const) : []),
                    ...(authoredFiles.some((file) => file.mimeType === 'application/vnd.openvdb')
                      ? (['authoredVdb'] as const)
                      : []),
                  ],
                }
              : {}),
          };
        } finally {
          if (result.recycleAfterResponse) {
            await computeJob?.failed();
            computeJob = undefined;
            await context.session.recycle();
          }
        }
      } catch (error) {
        await computeJob?.failed();
        throw error instanceof PicogkKernelError ? error : new PicogkKernelError(issuesFrom(error, entryPath));
      } finally {
        span.end();
      }
    },

    /* The report names the mesh a handle holds: no adaptivity is the uniform mesh (also what a worker that predates
     * adaptive meshing answers a default view with), otherwise its adaptivity and relax. An export asking for that same
     * meshing reuses the handle; any other export builds. A snapshot without a report says nothing. */
    effectiveOptions: ({ handle, options }) =>
      handle.tessellation === undefined
        ? undefined
        : {
            ...options,
            meshAdaptivity: handle.tessellation.adaptivity ?? 0,
            meshRelax: handle.tessellation.relax ?? false,
          },

    async render({ handle }) {
      return { content: handle.glb, ...(handle.tessellation ? { tessellation: handle.tessellation } : {}) };
    },

    async export(input) {
      try {
        if (!input) {
          throw new TypeError('A PicoGK export request is required.');
        }
        if (input.exportId === 'authoredStl' || input.exportId === 'authoredVdb') {
          const mimeType = input.exportId === 'authoredStl' ? 'model/stl' : 'application/vnd.openvdb';
          return {
            files: nonemptyExportFiles(
              (input.handle.authoredFiles ?? [])
                .filter((file) => file.mimeType === mimeType)
                .map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })),
            ),
          };
        }
        const bytes = await transformGltfExportBytes(input.handle.glb, {
          ...input.options,
          format: input.exportId,
          preserveMeshTopology: true,
        });
        return {
          files: [createExportFile(input.exportId, `model.${input.exportId}`, asBuffer(bytes))],
        };
      } catch (error) {
        throw new PicogkKernelError(issuesFrom(error));
      }
    },

    // A handle without a report snapshots as its GLB bytes alone, as it always has.
    serializeHandle: ({ handle }): PicogkSerializedHandle =>
      handle.tessellation === undefined && handle.authoredFiles === undefined
        ? new Uint8Array(handle.glb)
        : {
            glb: new Uint8Array(handle.glb),
            tessellation: handle.tessellation,
            ...(handle.authoredFiles
              ? { authoredFiles: handle.authoredFiles.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })) }
              : {}),
          },
    deserializeHandle: ({ serialized }): PicogkNativeHandle => {
      if (serialized instanceof Uint8Array) {
        return { glb: new Uint8Array(serialized) };
      }
      if (!(serialized.glb instanceof Uint8Array)) {
        throw new TypeError('Invalid PicoGK serialized handle: expected GLB bytes.');
      }
      return {
        glb: new Uint8Array(serialized.glb),
        ...(serialized.authoredFiles !== undefined && serialized.tessellation === undefined
          ? {}
          : { tessellation: picogkTessellationSchema.parse(serialized.tessellation) }),
        ...(serialized.authoredFiles
          ? {
              authoredFiles: serialized.authoredFiles.map((file) => {
                if (!(file.bytes instanceof Uint8Array)) {
                  throw new TypeError('Invalid authored file bytes.');
                }
                return { ...file, bytes: new Uint8Array(file.bytes) };
              }),
            }
          : {}),
      };
    },

    // Observation only: the resident set of the worker's process tree; `heapBytes` stays unimplemented, so recycling
    // and `rendering.heapBytes` are unchanged.
    observedChildResidentBytes: async (context) => context.session.sampleResident(),

    async onDispose(context) {
      try {
        context.computeTransport?.dispose();
      } finally {
        try {
          await context.session.cleanup();
        } finally {
          await context.mirror.cleanup();
        }
      }
    },
  });

/* oxlint-enable typescript/explicit-module-boundary-types */
