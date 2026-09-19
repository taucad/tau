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
import { picogkAnalysisSchema, picogkBuildSchema } from '#picogk.protocol.js';
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
  version: '2.3.0+dotnet10.roslyn5.9.host2.protocol4.topology1',
  optionsSchema: picogkOptionsSchema,
  // D2: `cancel` stops an in-flight build at the model's next viewer call and keeps the worker warm.
  liveEdit: true,
  exportFormats: { glb: { optionsSchema: picogkExportSchemas.glb } },

  async initialize(options, runtime) {
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
      logger: runtime.logger,
    });
    return { mirror, session };
  },

  async getDependencies({ entryPath }, runtime, context) {
    try {
      const paths = await context.mirror.sync(runtime.filesystem, runtime.fileContentCache);
      return {
        resolved: paths.filter((path) => !tauSystemArtifacts.has(path)),
        unresolved: [],
      };
    } catch (error) {
      throw new PicogkKernelError(issuesFrom(error, entryPath));
    }
  },

  async getParameters({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem, runtime.fileContentCache);
    /* D8: the worker's own stage timings are attributes on the span that measured the request. The
     * span's duration is the total, so nothing here times the call a second time. */
    const span = runtime.tracer.startSpan('picogk.analyze', { entryPath });
    try {
      const analysis = await context.session.request({
        method: 'analyze',
        params: { entryPath },
        schema: picogkAnalysisSchema,
        signal: runtime.signal,
      });
      span.end({ ...analysis.timings });
      return createKernelSuccess(
        createKernelParameterDeclaration(analysis.defaultParameters, analysis.jsonSchema, {
          id: 'urn:taucad:picogk:parameters',
          name: 'PicoGkParameters',
        }),
      );
    } catch (error) {
      return createKernelError(issuesFrom(error, entryPath));
    } finally {
      /* Idempotent: the success path already ended it with its attributes. A failed request must
       * still close it, or the tracer keeps parenting later spans under a span that never ended. */
      span.end();
    }
  },

  async createGeometry({ entryPath, parameters }, runtime, context) {
    await context.mirror.sync(runtime.filesystem, runtime.fileContentCache);
    const span = runtime.tracer.startSpan('picogk.build', { entryPath });
    try {
      const result = await context.session.request({
        method: 'build',
        params: { entryPath, parameters },
        schema: picogkBuildSchema,
        signal: runtime.signal,
        // W17: an abort stops the build cooperatively rather than ending the worker generation.
        cancelMethod: 'cancel',
      });
      try {
        const readSpan = runtime.tracer.startSpan('picogk.artifact-read');
        let artifact;
        try {
          artifact = await context.session.readArtifact(result);
        } finally {
          readSpan.end();
        }
        const transformSpan = runtime.tracer.startSpan('picogk.glb-transform');
        let glb;
        try {
          glb = picogkArtifactToGlb(artifact, result);
        } finally {
          transformSpan.end();
        }
        runtime.signal.throwIfAborted();
        span.end({ ...result.timings, ...result.metrics });
        return {
          geometry: { format: 'gltf', content: glb },
          nativeHandle: { glb },
        };
      } finally {
        if (result.recycleAfterResponse) {
          await context.session.recycle();
        }
      }
    } catch (error) {
      throw new PicogkKernelError(issuesFrom(error, entryPath));
    } finally {
      span.end();
    }
  },

  async exportGeometry(input) {
    try {
      const bytes = await transformGltfExportBytes(input.nativeHandle.glb, {
        format: 'glb',
        ...input.options,
      });
      return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(bytes))]);
    } catch (error) {
      return createKernelError(issuesFrom(error));
    }
  },

  serializeNativeHandle: ({ nativeHandle }) => new Uint8Array(nativeHandle.glb),
  deserializeNativeHandle: ({ serializedNativeHandle }) => ({
    glb: new Uint8Array(serializedNativeHandle),
  }),

  async cleanup(context) {
    try {
      await context.session.cleanup();
    } finally {
      await context.mirror.cleanup();
    }
  },
});
