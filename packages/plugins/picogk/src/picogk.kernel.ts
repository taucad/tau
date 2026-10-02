import { contentDigest } from '@taucad/cache-core';
import { createComputeWorkerTransport } from '#compute-worker-transport.js';
import { transformGltfExportBytes } from '@taucad/geometry-core';
import { createWorkspaceMirror } from '@taucad/native-process-core';
import {
  asBuffer,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
} from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkAnalysisSchema, picogkBuildSchema, picogkResolveSchema } from '#picogk.protocol.js';
import { picogkExportSchemas, picogkOptionsSchema } from '#picogk.schemas.js';
import { PicogkSession, PicogkWorkerError } from '#picogk-session.js';

/** Immutable mesh evidence retained by the runtime for display and export. @public */
export type PicogkNativeHandle = { readonly glb: Uint8Array<ArrayBuffer> };

// Tau metadata remains execution context; the generated root thumbnail is not an execution input.
const tauSystemArtifacts = new Set(['tau.json', 'thumbnail.webp']);

class PicogkKernelError extends Error {
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

/** `picogk` native C# kernel capability. @public */
export const picogkKernel = defineKernel({
  id: 'picogk',
  extensions: ['cs'],
  name: 'PicogkKernel',
  version: '2.5.2+dotnet10.roslyn5.9.host19.protocol8.material2.mechanism2.compute1',
  optionsSchema: picogkOptionsSchema,
  // D2: `cancel` stops an in-flight build at the model's next viewer call and keeps the worker warm.
  cancellation: 'cooperative',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: picogkExportSchemas.glb,
    },
    gltf: {
      title: 'glTF JSON',
      mimeType: 'model/gltf+json',
      extension: 'gltf',
      optionsSchema: picogkExportSchemas.gltf,
    },
  },

  async initialize(options, services) {
    const mirror = await createWorkspaceMirror({
      temporaryPrefix: 'tau-picogk-',
      displayName: 'PicoGK',
      excludedDirectories: ['bin', 'obj', '.vs'],
      excludedFileSuffixes: ['.dll', '.exe', '.pdb'],
      excludedPaths: ['thumbnail.webp'],
    });
    const session = new PicogkSession({
      ...options,
      ...mirror,
      logger: services.logger,
    });
    const computeTransport = createComputeWorkerTransport({
      producer: {
        id: 'picogk',
        version: 'operation-v1.codec2.layout1',
        implementationAssets: [options.workerSha256, ...options.resourceFiles.map(({ sha256 }) => sha256)]
          .sort()
          .map((hash) => contentDigest({ value: `sha256:${hash.toLowerCase()}` })),
      },
      environment: {
        platform: process.platform,
        architecture: process.arch,
        endian: 'little',
        arithmetic: 'float32-ordered',
        archive: 'openvdb-8.1.0-seekless-uuid21',
        layout: 'tau-vertex-normals-v3.tau-surface-coordinates-v1',
      },
      maxEncodedBytes: 256 * 1024 * 1024,
      maxNativeBytes: 256 * 1024 * 1024,
      maxEntries: 4096,
    });
    return {
      mirror,
      session,
      computeTransport,
      artifactPath: mirror.artifactPath,
    };
  },

  async resolve({ entryPath }, services, context) {
    try {
      const paths = await context.mirror.sync(services.filesystem, services.fileContentCache, services.operationId);
      /* The worker's Roslyn parse picks the C# this entry compiles with: its program and every
       * helper. Another program in the project is an independent model, so its edits never
       * re-render this one. Other files stay dependencies: a model may read any project asset. */
      let compiled: ReadonlySet<string> | undefined;
      try {
        const { sources } = await context.session.request({
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
    await context.mirror.sync(services.filesystem, services.fileContentCache, services.operationId);
    /* D8: the worker's own stage timings are attributes on the span that measured the request. The
     * span's duration is the total, so nothing here times the call a second time. */
    const span = services.tracer.startSpan('picogk.analyze', { entryPath });
    try {
      const analysis = await context.session.request({
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

  async evaluate({ entryPath, parameters }, services, context) {
    await context.mirror.sync(services.filesystem, services.fileContentCache, services.operationId);
    const span = services.tracer.startSpan('picogk.build', { entryPath });
    let computeJob: Awaited<ReturnType<typeof context.computeTransport.open>>;
    try {
      try {
        computeJob = await context.computeTransport.open({
          compute: services.compute,
          sessionRoot: context.artifactPath,
          signal: services.signal,
        });
      } catch (error) {
        services.signal.throwIfAborted();
        services.logger.debug(`PicoGK compute preload bypass: ${String(error)}`);
      }
      const result = await context.session.request({
        method: 'build',
        params: {
          entryPath,
          parameters,
          ...(computeJob ? { computeReuse: computeJob.request } : {}),
        },
        schema: picogkBuildSchema,
        signal: computeJob?.signal ?? services.signal,
        // W17: an abort stops the build cooperatively rather than ending the worker generation.
        cancelMethod: 'cancel',
      });
      try {
        const readSpan = services.tracer.startSpan('picogk.artifact-read');
        let artifact;
        try {
          artifact = await context.session.readArtifact(result);
        } finally {
          readSpan.end();
        }
        const transformSpan = services.tracer.startSpan('picogk.glb-transform');
        let glb;
        const issues: KernelIssue[] = (result.warnings ?? []).map(
          ({ code: workerCode, type: workerType, ...warning }) => ({
            ...warning,
            code: 'INVALID_ANNOTATION',
            type: 'kernel',
            details: {
              producer: { kernelId: 'picogk' },
              workerCode,
              workerType,
            },
          }),
        );
        try {
          glb = picogkArtifactToGlb(artifact, result, (mechanismIssues) => issues.push(...mechanismIssues));
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
        span.end({ ...result.timings, ...result.metrics });
        return {
          handle: { glb },
          issues,
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
      throw new PicogkKernelError(issuesFrom(error, entryPath));
    } finally {
      span.end();
    }
  },

  async render({ handle }) {
    return { content: handle.glb };
  },

  async export(input) {
    try {
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

  serializeHandle: ({ handle }) => new Uint8Array(handle.glb),
  deserializeHandle: ({ serialized }) => ({
    glb: new Uint8Array(serialized),
  }),

  async onDispose(context) {
    try {
      context.computeTransport.dispose();
    } finally {
      try {
        await context.session.cleanup();
      } finally {
        await context.mirror.cleanup();
      }
    }
  },
});
