import { transformGltfExportBytes } from '@taucad/geometry-core';
import { createWorkspaceMirror } from '@taucad/native-process-core';
import { asBuffer, createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';

import { picogkArtifactToComponentGlbs, picogkArtifactToGlb } from '#picogk-mesh.js';
import { preparePicogkCompute } from '#picogk-compute.js';
import { picogkAnalysisSchema, picogkBuildSchema } from '#picogk.protocol.js';
import { picogkExportSchemas, picogkOptionsSchema, picogkRenderSchema } from '#picogk.schemas.js';
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
  version: '2.3.0+dotnet10.roslyn5.9.host2.protocol3.topology1.scene3',
  optionsSchema: picogkOptionsSchema,
  createOptionsSchema: picogkRenderSchema,
  render: {
    optionsSchema: picogkRenderSchema,
    progressiveScene: {
      type: 'supported',
      deliveries: ['reset', 'delta'],
      bookmarks: ['explicit', 'viewer-update', 'viewer-operation'],
      replay: ['live', 'retained'],
    },
  },
  exportFormats: { glb: { optionsSchema: picogkExportSchemas.glb } },

  async initialize(options, runtime) {
    const mirror = await createWorkspaceMirror({
      temporaryPrefix: 'tau-picogk-',
      displayName: 'PicoGK',
      excludedDirectories: ['bin', 'obj', '.vs'],
      excludedFileSuffixes: ['.dll', '.exe', '.pdb'],
      excludedPaths: ['thumbnail.webp'],
    });
    const session = new PicogkSession({ ...options, ...mirror, logger: runtime.logger });
    return {
      mirror,
      session,
      computeAssets: {
        workerSha256: options.workerSha256,
        resourceSha256: options.resourceFiles.map(({ sha256 }) => sha256),
      },
    };
  },

  async getDependencies({ entryPath }, runtime, context) {
    try {
      const paths = await context.mirror.sync(runtime.filesystem);
      return { resolved: paths.filter((path) => !tauSystemArtifacts.has(path)), unresolved: [] };
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

  async createGeometry({ entryPath, parameters, options }, runtime, context) {
    const mirroredPaths = await context.mirror.sync(runtime.filesystem);
    let publications = Promise.resolve();
    let publicationError: unknown;
    const streamScene = runtime.scene.requested;
    try {
      let compute: Awaited<ReturnType<typeof preparePicogkCompute>> | undefined;
      try {
        compute = await preparePicogkCompute({
          entryPath,
          parameters,
          paths: mirroredPaths.filter((path) => !tauSystemArtifacts.has(path)),
          runtime,
          session: context.session,
          ...context.computeAssets,
        });
      } catch (error) {
        runtime.signal.throwIfAborted();
        runtime.logger.warn('PicoGK component cache preparation failed.', { data: error });
      }
      const started = performance.now();
      const result = await context.session.request({
        method: 'build',
        params: {
          entryPath,
          parameters,
          capture: options.capture,
          streamScene,
          ...(compute ? { compute: compute.request } : {}),
        },
        schema: picogkBuildSchema,
        signal: runtime.signal,
        ...(streamScene
          ? {
              events: {
                onEvent: (event) => {
                  publications = publications
                    .then(async () => {
                      const components = event.artifact
                        ? picogkArtifactToComponentGlbs(
                            await context.session.readArtifact(event.artifact),
                            event.artifact,
                          )
                        : [];
                      const upserts = components.map(
                        ({ id, name, content }) =>
                          ({
                            id,
                            name,
                            geometry: { format: 'gltf', content },
                          }) as const,
                      );
                      const hasSceneMutation =
                        event.operation === 'reset' ||
                        upserts.length > 0 ||
                        event.removedComponentIds.length > 0 ||
                        event.presentation !== null;
                      if (hasSceneMutation) {
                        await runtime.scene.publishUpdate(
                          event.operation === 'reset'
                            ? {
                                operation: 'reset',
                                sceneGeneration: event.sceneGeneration,
                                upserts,
                                removedComponentIds: [],
                                presentation: event.presentation,
                              }
                            : {
                                operation: 'delta',
                                baseSceneGeneration: event.baseSceneGeneration,
                                sceneGeneration: event.sceneGeneration,
                                upserts,
                                removedComponentIds: event.removedComponentIds,
                                ...(event.presentation ? { presentation: event.presentation } : {}),
                              },
                        );
                      }
                      if (event.bookmark) {
                        await runtime.scene.bookmark({
                          label: event.bookmark.path,
                          source:
                            event.mode === 'explicit'
                              ? 'explicit'
                              : event.mode === 'update'
                                ? 'viewer-update'
                                : 'viewer-operation',
                        });
                      }
                    })
                    .catch((error: unknown) => {
                      publicationError ??= error;
                    });
                },
              },
            }
          : {}),
      });
      try {
        await publications;
        const readStarted = performance.now();
        const artifact = await context.session.readArtifact(result);
        const artifactRead = performance.now() - readStarted;
        if (streamScene) {
          try {
            await runtime.scene.flush();
          } catch (error) {
            publicationError ??= error;
          }
        }
        if (publicationError) {
          runtime.logger.warn(
            'PicoGK progressive scene publication failed; using the authoritative terminal geometry.',
            {
              data: publicationError,
            },
          );
        }
        const transformStarted = performance.now();
        const glb = picogkArtifactToGlb(artifact, result);
        runtime.signal.throwIfAborted();
        try {
          await compute?.publish(result.computePublications ?? []);
        } catch (error) {
          runtime.signal.throwIfAborted();
          runtime.logger.warn('PicoGK component cache publication failed.', { data: error });
        }
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
      await publications;
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
