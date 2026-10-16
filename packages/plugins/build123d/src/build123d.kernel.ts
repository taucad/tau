import { asBuffer, createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type { ComputeAnnouncement, KernelIssue, KernelServices } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { sha256StringSync } from '@taucad/utils/hash';
import { occtExplicitTessellationDefaults, occtTriangleBudgets } from '@taucad/occt-core';
import type { OcctTessellationTolerances } from '@taucad/occt-core';

import {
  build123dAnalysisSchema,
  build123dArtifactSchema,
  build123dBuildSchema,
  build123dComputeDescriptorLimit,
  build123dMeasureSchema,
  build123dMeshSchema,
} from '#build123d.protocol.js';
import type { Build123dAnalysis, Build123dMesh } from '#build123d.protocol.js';
import {
  Build123dTessellationRefusal,
  meshExportWithinBudget,
  meshPreviewWithinBudget,
} from '#build123d-tessellation.js';
import { build123dExportSchemas, build123dOptionsSchema, build123dRenderSchema } from '#build123d.schemas.js';
import { Build123dWorkerError, PythonSession } from '#python-session.js';
import { createWorkspaceMirror } from '#build123d-workspace-mirror.js';
import { libraryVersionMismatches, pyprojectPath } from '#project-manifest.js';

const computeNamespace = 'build123d.operation.v1';
const computeProducerVersion = 'build123d@0.11.1|python@3.13|ocp@7.9.3.1.1|occt@7.9.3|worker-protocol@1|adapter@1';
const computeEnvironment = {
  platform: process.platform,
  architecture: process.arch,
  lengthUnit: 'millimeter',
} as const;

/** EQ27: retain an operation whose own kernel call took at least this many milliseconds. */
const computeAdmissionFloor = 5;

/**
 * Recompute the worker's action identity before it can name a stored record.
 *
 * The worker canonicalizes the same action independently; a disagreement would
 * key the shared store inconsistently, so it is dropped rather than announced.
 */
const verifiedDigest = (action: ComputeAction, claimed: string): ActionDigest | undefined => {
  const digest = actionDigest({
    value: `sha256:${sha256StringSync(canonicalizeComputeAction(action))}`,
  });
  return digest === claimed ? digest : undefined;
};

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
  if (error instanceof Build123dTessellationRefusal) {
    return [error.issue];
  }
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

/** The part of the kernel context `analyzeEntry` reads; it adds the memo field. */
type Build123dContext = {
  readonly session: PythonSession;
  observedDependencies: string[];
  analysis?: { readonly operationId: number; readonly key: string; readonly result: Promise<Build123dAnalysis> };
};

/**
 * One analyze request per entry and runtime operation, spanned.
 *
 * Dependency and parameter discovery ask the worker the same question with the same arguments
 * inside one render, so the second asks nothing. D8 wants the wire time in the trace.
 *
 * @param entryPath - Model entry the worker analyzes.
 * @param runtime - Kernel runtime, for its operation, abort signal and tracer.
 * @param context - Kernel context holding the session and its observed dependencies.
 * @returns The worker's analysis.
 */
const analyzeEntry = async (
  entryPath: string,
  runtime: Pick<KernelServices, 'operationId' | 'signal' | 'tracer'>,
  context: Build123dContext,
): Promise<Build123dAnalysis> => {
  const { operationId } = runtime;
  const { observedDependencies } = context;
  const key = [entryPath, ...observedDependencies].join('\0');
  if (operationId !== undefined && context.analysis?.operationId === operationId && context.analysis.key === key) {
    return context.analysis.result;
  }
  const analyze = async (): Promise<Build123dAnalysis> => {
    const span = runtime.tracer.startSpan('build123d.analyze', { entryPath });
    try {
      return await context.session.request({
        method: 'analyze',
        params: { entryPath, observedDependencies },
        schema: build123dAnalysisSchema,
        signal: runtime.signal,
      });
    } finally {
      span.end();
    }
  };
  const result = analyze();
  if (operationId !== undefined) {
    context.analysis = { operationId, key, result };
  }
  return result;
};

/**
 * The worker's mesh and measure requests for one retained handle, in millimetres and degrees.
 *
 * @param handleId - The retained shapes to mesh.
 * @param runtime - Kernel runtime, for its abort signal.
 * @param session - The Python session holding the handle.
 * @returns The mesh request and the diagonal measurement.
 */
const meshRequests = (
  handleId: string,
  runtime: Pick<KernelServices, 'signal'>,
  session: PythonSession,
): {
  mesh: (tolerances: OcctTessellationTolerances, maxTriangles?: number) => Promise<Build123dMesh>;
  measureDiagonal: () => Promise<number>;
} => ({
  mesh: async (tolerances, maxTriangles) =>
    session.request({
      method: 'mesh',
      params: {
        handleId,
        linearTolerance: tolerances.linearTolerance,
        angularTolerance: tolerances.angularTolerance,
        ...(maxTriangles === undefined ? {} : { maxTriangles }),
      },
      schema: build123dMeshSchema,
      signal: runtime.signal,
    }),
  async measureDiagonal() {
    const measured = await session.request({
      method: 'measure',
      params: { handleId },
      schema: build123dMeasureSchema,
      signal: runtime.signal,
    });
    return measured.diagonal;
  },
});

/** `build123d` kernel capability. @public */
export const build123dKernel = defineKernel({
  id: 'build123d',
  extensions: ['py'],
  name: 'Build123dKernel',
  version: '0.11.1+python3.13.ocp7.9.3.1.1.protocol1.topology1.tessellation1',
  optionsSchema: build123dOptionsSchema,
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary', optionsSchema: build123dRenderSchema } },
  // D2: the Python worker answers `cancelMethod: 'cancel'` itself and keeps its resident prefix.
  cancellation: 'cooperative',
  exports: {
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: build123dExportSchemas.glb,
    },
    step: {
      title: 'STEP',
      mimeType: 'application/step',
      extension: 'step',
      optionsSchema: build123dExportSchemas.step,
    },
  },

  async initialize(options, runtime) {
    const mirror = await createWorkspaceMirror();
    const session = new PythonSession({
      ...options,
      ...mirror,
      logger: runtime.logger,
    });
    const observedDependencies: string[] = [];
    const warmCandidates: ActionDigest[] = [];
    return {
      mirror,
      session,
      resident: session.createResidentBinding(),
      observedDependencies,
      warmCandidates,
      computeProducer: {
        id: '@taucad/build123d',
        version: computeProducerVersion,
        implementationAssets: [
          options.pythonSha256,
          options.workerSha256,
          ...options.supportFiles.map(({ sha256 }) => sha256),
        ].map((sha256) => contentDigest({ value: `sha256:${sha256}` })),
      },
    };
  },

  async resolve({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem, runtime.fileContentCache, runtime.operationId);
    try {
      const analysis = await analyzeEntry(entryPath, runtime, context);
      return { resolved: analysis.resolved, unresolved: analysis.unresolved };
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error, entryPath));
    }
  },

  async describe({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem, runtime.fileContentCache, runtime.operationId);
    try {
      const analysis = await analyzeEntry(entryPath, runtime, context);
      if (!analysis.declaration) {
        throw new Error('Build123d analyzer omitted its parameter declaration.');
      }
      return createKernelSuccess({ parameters: analysis.declaration });
    } catch (error) {
      return createKernelError(issuesFrom(error, entryPath));
    }
  },

  async evaluate({ entryPath, parameters }, runtime, context) {
    const paths = await context.mirror.sync(runtime.filesystem, runtime.fileContentCache, runtime.operationId);
    // D35: the project's own pins must name the libraries this kernel runs, or it runs differently outside Tau.
    const issues = paths.includes(pyprojectPath)
      ? libraryVersionMismatches(await runtime.filesystem.readFile(pyprojectPath, 'utf8'))
      : [];
    const build = async (compute: Record<string, unknown> | undefined) => {
      const span = runtime.tracer.startSpan('build123d.build', { entryPath });
      try {
        const result = await context.session.request({
          method: 'build',
          params: {
            entryPath,
            parameters,
            ...(compute ? { compute } : {}),
          },
          schema: build123dBuildSchema,
          signal: runtime.signal,
          // G-F5: an abort stops the worker at its next funnel boundary and keeps the resident prefix.
          cancelMethod: 'cancel',
        });
        context.observedDependencies = result.observedDependencies;
        return result;
      } finally {
        span.end();
      }
    };

    try {
      if (runtime.compute.status !== 'on') {
        // Off arm: no scope, no announcement, no publication tail, no worker-side patching.
        const plain = await build(undefined);
        return {
          handle: {
            sessionGeneration: context.session.generation,
            handleId: plain.handleId,
          },
          issues,
        };
      }
      const scope = runtime.compute.openScope({
        namespace: computeNamespace,
        producer: context.computeProducer,
        environment: computeEnvironment,
        discovery: { entryPath },
        resident: context.resident,
        admissionFloor: computeAdmissionFloor,
      });
      let outcome: 'delivered' | 'failed' = 'failed';
      try {
        // Warm discovery runs before every build, so a worker that outlives another
        // producer's publication still picks it up (D16 refresh clause).
        await scope.warm({
          digests: context.warmCandidates,
          maxEntries: build123dComputeDescriptorLimit,
        });
        runtime.signal.throwIfAborted();
        const result = await build({
          namespace: computeNamespace,
          producer: context.computeProducer,
          environment: computeEnvironment,
        });
        if (result.compute) {
          const announcements: ComputeAnnouncement[] = [];
          const admitted: ActionDigest[] = [];
          for (const entry of result.compute.announcements) {
            const action: ComputeAction = entry.action;
            const digest = verifiedDigest(action, entry.actionDigest);
            if (!digest) {
              continue;
            }
            admitted.push(digest);
            announcements.push({
              kind: 'action',
              action,
              digest,
              computeDuration: entry.computeDuration,
              estimatedBytes: entry.estimatedBytes,
            });
          }
          context.resident.track(admitted);
          context.session.observeResidentBytes(result.compute.stats.logicalBytes);
          scope.announce({ entries: announcements });
          context.warmCandidates = [...new Set([...context.warmCandidates, ...admitted])].slice(
            -build123dComputeDescriptorLimit,
          );
        }
        outcome = 'delivered';
        return {
          handle: {
            sessionGeneration: context.session.generation,
            handleId: result.handleId,
          },
          issues,
        };
      } finally {
        // Seals metadata only; the runtime permits the export tail after real delivery.
        scope.close({
          outcome: runtime.signal.aborted ? 'cancelled' : outcome,
        });
      }
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error, entryPath));
    }
  },

  async render({ handle, options }, runtime, context) {
    if (!context.session.isHandleGenerationValid(handle.sessionGeneration)) {
      throw new Build123dKernelError(issuesFrom(new Error('Build123d native handle is stale.')));
    }
    try {
      const { mesh, measureDiagonal } = meshRequests(handle.handleId, runtime, context.session);
      // The render hook cannot tell a viewer preview from a capture, so every render takes the preview budget.
      const meshed = await meshPreviewWithinBudget(
        {
          tessellation: options.tessellation,
          fallback: 'medium',
          explicitDefaults: occtExplicitTessellationDefaults.preview,
          budget: occtTriangleBudgets.preview,
          staleCode: 'VIEW_OPTIONS_INVALID',
          measureDiagonal,
        },
        mesh,
      );
      return {
        content: await context.session.readArtifact(meshed.artifact),
        tessellation: meshed.tessellation,
        issues: meshed.issues,
      };
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error));
    }
  },

  async export(input, runtime, context) {
    if (!context.session.isHandleGenerationValid(input.handle.sessionGeneration)) {
      throw new Build123dKernelError(issuesFrom(new Error('Build123d native handle is stale.')));
    }
    try {
      if (input.exportId === 'glb') {
        const { mesh, measureDiagonal } = meshRequests(input.handle.handleId, runtime, context.session);
        const meshed = await meshExportWithinBudget(
          {
            tessellation: input.options.tessellation,
            fallback: 'high',
            explicitDefaults: occtExplicitTessellationDefaults.export,
            budget: occtTriangleBudgets.export,
            staleCode: 'EXPORT_OPTIONS_INVALID',
            measureDiagonal,
          },
          mesh,
        );
        const bytes = await context.session.readArtifact(meshed.artifact);
        return { files: [createExportFile('glb', 'model.glb', asBuffer(bytes))], issues: meshed.issues };
      }
      const artifact = await context.session.request({
        method: 'export',
        params: { handleId: input.handle.handleId, format: 'step' },
        schema: build123dArtifactSchema,
        signal: runtime.signal,
      });
      const bytes = await context.session.readArtifact(artifact);
      return { files: [createExportFile('step', 'assembly.step', asBuffer(bytes))] };
    } catch (error) {
      throw new Build123dKernelError(issuesFrom(error));
    }
  },

  isHandleValid({ handle }, _runtime, context) {
    return context.session.isHandleGenerationValid(handle.sessionGeneration);
  },

  releaseHandle({ handle }, _runtime, context) {
    context.session.release(handle.handleId, handle.sessionGeneration);
  },

  async onDispose(context) {
    try {
      await context.session.cleanup();
    } finally {
      await context.mirror.cleanup();
    }
  },
});
