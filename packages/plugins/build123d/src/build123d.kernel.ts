import { asBuffer, createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';

import { build123dAnalysisSchema, build123dArtifactSchema, build123dBuildSchema } from '#build123d.protocol.js';
import { build123dExportSchemas, build123dOptionsSchema, build123dRenderSchema } from '#build123d.schemas.js';
import { Build123dWorkerError, PythonSession } from '#python-session.js';
import { createWorkspaceMirror } from '#workspace-mirror.js';

/** Opaque identity for shapes retained in one Python process generation. @public */
export type Build123dNativeHandle = {
  readonly sessionGeneration: number;
  readonly handleId: string;
};

class Build123dKernelError extends Error {
  public readonly issues: KernelIssue[];

  public constructor(issues: KernelIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = issues;
    this.name = 'Build123dKernelError';
  }
}

const issuesFrom = (error: unknown, fileName?: string): KernelIssue[] => {
  if (error instanceof Build123dWorkerError) {
    return error.issues.map(({ code: pythonCode, type: pythonType, ...issue }) => ({
      ...issue,
      code: 'RUNTIME',
      type: pythonType === 'syntax' || pythonType === 'validation' ? 'compilation' : pythonType,
      details: { pythonCode, pythonType },
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

/** `build123d` kernel capability. @public */
export const build123dKernel = defineKernel({
  id: 'build123d',
  extensions: ['py'],
  name: 'Build123dKernel',
  version: '0.11.1+python3.13.ocp7.9.3.1.1.protocol1.topology1',
  optionsSchema: build123dOptionsSchema,
  render: { optionsSchema: build123dRenderSchema },
  exportFormats: {
    glb: { optionsSchema: build123dExportSchemas.glb },
    step: { optionsSchema: build123dExportSchemas.step },
  },

  async initialize(options, runtime) {
    const mirror = await createWorkspaceMirror();
    const session = new PythonSession({ ...options, ...mirror, logger: runtime.logger });
    return { mirror, session, observedDependencies: [] as string[] };
  },

  async getDependencies({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem);
    try {
      const analysis = await context.session.request({
        method: 'analyze',
        params: { entryPath, observedDependencies: context.observedDependencies },
        schema: build123dAnalysisSchema,
        signal: runtime.signal,
      });
      return { resolved: analysis.resolved, unresolved: analysis.unresolved };
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error, entryPath));
    }
  },

  async getParameters({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem);
    try {
      const analysis = await context.session.request({
        method: 'analyze',
        params: { entryPath, observedDependencies: context.observedDependencies },
        schema: build123dAnalysisSchema,
        signal: runtime.signal,
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
      const result = await context.session.request({
        method: 'build',
        params: { entryPath, parameters },
        schema: build123dBuildSchema,
        signal: runtime.signal,
      });
      context.observedDependencies = result.observedDependencies;
      return {
        nativeHandle: {
          sessionGeneration: context.session.generation,
          handleId: result.handleId,
        },
      };
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error, entryPath));
    }
  },

  async meshGeometry({ nativeHandle, options }, runtime, context) {
    if (!context.session.isHandleGenerationValid(nativeHandle.sessionGeneration)) {
      throw new Build123dKernelError(issuesFrom(new Error('Build123d native handle is stale.')));
    }
    try {
      const artifact = await context.session.request({
        method: 'mesh',
        params: {
          handleId: nativeHandle.handleId,
          linearTolerance: options.tessellation.linearTolerance,
          angularTolerance: options.tessellation.angularTolerance,
        },
        schema: build123dArtifactSchema,
        signal: runtime.signal,
      });
      return { geometry: { format: 'gltf', content: await context.session.readArtifact(artifact) } };
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error));
    }
  },

  async exportGeometry(input, runtime, context) {
    if (!context.session.isHandleGenerationValid(input.nativeHandle.sessionGeneration)) {
      return createKernelError(issuesFrom(new Error('Build123d native handle is stale.')));
    }
    try {
      const artifact = await context.session.request({
        method: input.format === 'glb' ? 'mesh' : 'export',
        params:
          input.format === 'glb'
            ? {
                handleId: input.nativeHandle.handleId,
                linearTolerance: input.options.tessellation.linearTolerance,
                angularTolerance: input.options.tessellation.angularTolerance,
              }
            : { handleId: input.nativeHandle.handleId, format: 'step' },
        schema: build123dArtifactSchema,
        signal: runtime.signal,
      });
      const bytes = await context.session.readArtifact(artifact);
      return createKernelSuccess([
        createExportFile(input.format, input.format === 'glb' ? 'model.glb' : 'assembly.step', asBuffer(bytes)),
      ]);
    } catch (error) {
      return createKernelError(issuesFrom(error));
    }
  },

  isNativeHandleValid({ nativeHandle }, _runtime, context) {
    return context.session.isHandleGenerationValid(nativeHandle.sessionGeneration);
  },

  disposeNativeHandle({ nativeHandle }, _runtime, context) {
    context.session.release(nativeHandle.handleId, nativeHandle.sessionGeneration);
  },

  async cleanup(context) {
    try {
      await context.session.cleanup();
    } finally {
      await context.mirror.cleanup();
    }
  },
});
