import { transformGltfExportBytes } from '@taucad/geometry-core';
import { createWorkspaceMirror } from '@taucad/native-process-core';
import { asBuffer, createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';

import { picogkArtifactToGlb } from '#picogk-mesh.js';
import { picogkAnalysisSchema, picogkBuildSchema } from '#picogk.protocol.js';
import { picogkExportSchemas, picogkOptionsSchema, picogkRenderSchema } from '#picogk.schemas.js';
import { PicogkSession, PicogkWorkerError } from '#picogk-session.js';

/** Immutable mesh evidence retained by the runtime for display and export. @public */
export type PicogkNativeHandle = { readonly glb: Uint8Array<ArrayBuffer> };

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
  version: '2.3.0+dotnet10.roslyn5.9.protocol1.topology1',
  optionsSchema: picogkOptionsSchema,
  render: { optionsSchema: picogkRenderSchema },
  exportFormats: { glb: { optionsSchema: picogkExportSchemas.glb } },

  async initialize(options, runtime) {
    const mirror = await createWorkspaceMirror({
      temporaryPrefix: 'tau-picogk-',
      displayName: 'PicoGK',
      excludedDirectories: ['bin', 'obj', '.vs'],
      excludedFileSuffixes: ['.dll', '.exe', '.pdb'],
    });
    const session = new PicogkSession({ ...options, ...mirror, logger: runtime.logger });
    return { mirror, session };
  },

  async getDependencies({ entryPath }, runtime, context) {
    try {
      const paths = await context.mirror.sync(runtime.filesystem);
      return { resolved: [...paths], unresolved: [] };
    } catch (error) {
      throw new PicogkKernelError(issuesFrom(error, entryPath));
    }
  },

  async getParameters({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem);
    try {
      const started = performance.now();
      const analysis = await context.session.request({
        method: 'analyze',
        params: { entryPath },
        schema: picogkAnalysisSchema,
        signal: runtime.signal,
      });
      runtime.logger.debug('PicoGK C# analysis performance', {
        data: { ...analysis.timings, total: performance.now() - started },
      });
      return createKernelSuccess({
        defaultParameters: analysis.defaultParameters,
        jsonSchema: analysis.jsonSchema,
      });
    } catch (error) {
      return createKernelError(issuesFrom(error, entryPath));
    }
  },

  async createGeometry({ entryPath, parameters }, runtime, context) {
    await context.mirror.sync(runtime.filesystem);
    try {
      const started = performance.now();
      const result = await context.session.request({
        method: 'build',
        params: { entryPath, parameters },
        schema: picogkBuildSchema,
        signal: runtime.signal,
      });
      try {
        const readStarted = performance.now();
        const artifact = await context.session.readArtifact(result);
        const artifactRead = performance.now() - readStarted;
        const transformStarted = performance.now();
        const glb = picogkArtifactToGlb(artifact, result);
        runtime.logger.debug('PicoGK C# build performance', {
          data: {
            ...result.timings,
            metrics: result.metrics,
            artifactRead,
            glbTransform: performance.now() - transformStarted,
            total: performance.now() - started,
          },
        });
        return { geometry: { format: 'gltf', content: glb }, nativeHandle: { glb } };
      } finally {
        if (result.recycleAfterResponse) {
          await context.session.recycle();
        }
      }
    } catch (error) {
      throw new PicogkKernelError(issuesFrom(error, entryPath));
    }
  },

  async exportGeometry(input) {
    try {
      const bytes = await transformGltfExportBytes(input.nativeHandle.glb, { format: 'glb', ...input.options });
      return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(bytes))]);
    } catch (error) {
      return createKernelError(issuesFrom(error));
    }
  },

  serializeNativeHandle: ({ nativeHandle }) => new Uint8Array(nativeHandle.glb),
  deserializeNativeHandle: ({ serializedNativeHandle }) => ({ glb: new Uint8Array(serializedNativeHandle) }),

  async cleanup(context) {
    try {
      await context.session.cleanup();
    } finally {
      await context.mirror.cleanup();
    }
  },
});
