import { withNativeDeployment } from '@taucad/native-process-core/adopter';
import { asBuffer, createKernelError, createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import type { ComputeAnnouncement, KernelIssue, KernelServices } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { actionDigest, canonicalizeComputeAction, contentDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { sha256StringSync } from '@taucad/utils/hash';
import { occtExplicitTessellationDefaults, occtTriangleBudgets } from '@taucad/occt-core';
import type { OcctTessellationTolerances } from '@taucad/occt-core';
import {
  bindPythonKernel,
  createPythonSession,
  createPythonWorkspaceMirror,
  pyprojectPath,
  PythonWorkerError,
} from '@taucad/python-kernel-core';
import type { PythonSession } from '@taucad/python-kernel-core';

import { readSmlibpyMeshBundle } from '#smlibpy-bundle.js';
import { smlibpyDetectPattern } from '#smlibpy.constants.js';
import { convertSmlibpyGeometriesToGltf } from '#smlibpy-gltf.js';
import {
  smlibpyAnalysisSchema,
  smlibpyArtifactSchema,
  smlibpyBuildSchema,
  smlibpyComputeDescriptorLimit,
  smlibpyMeasureSchema,
  smlibpyMeshSchema,
} from '#smlibpy.protocol.js';
import type { SmlibpyAnalysis, SmlibpyArtifact, SmlibpyMesh } from '#smlibpy.protocol.js';
import {
  assertExportWithinBudget,
  meshExportWithinBudget,
  meshPreviewWithinBudget,
  resolveSmlibpyTessellation,
  SmlibpyTessellationRefusal,
} from '#smlibpy-tessellation.js';
import { smlibpyExportSchemas, smlibpyOptionsSchema, smlibpyRenderSchema } from '#smlibpy.schemas.js';
import { createSmlibpyResidentBinding } from '#smlibpy-resident.js';
import { smlibpyWorker } from '#smlibpy-worker.js';
import { smlibpyNative } from '#native.js';
import { libraryVersionMismatches } from '#project-manifest.js';

const computeNamespace = 'smlibpy.operation.v1';
const computeProducerVersion = 'smlibpy@0.3.5|python@3.13|numpy@2.5.2|codec@smb1|worker-protocol@1|adapter@1';
const computeEnvironment = {
  platform: process.platform,
  architecture: process.arch,
  lengthUnit: 'millimeter',
} as const;

/** Retain an operation whose own kernel call took at least this many milliseconds. */
const computeAdmissionFloor = 5;

/**
 * Recompute the worker's action identity before it can name a stored record; a disagreement would key the shared
 * store inconsistently, so it is dropped rather than announced.
 */
const verifiedDigest = (action: ComputeAction, claimed: string): ActionDigest | undefined => {
  const digest = actionDigest({ value: `sha256:${sha256StringSync(canonicalizeComputeAction(action))}` });
  return digest === claimed ? digest : undefined;
};

/** Opaque identity for a model retained in one Python process generation. @public */
export type SmlibpyNativeHandle = {
  readonly sessionGeneration: number;
  readonly handleId: string;
};

class SmlibpyKernelError extends Error {
  public readonly issues: KernelIssue[];

  public constructor(issues: KernelIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = issues;
    this.name = 'SmlibpyKernelError';
  }
}

const issuesFrom = (error: unknown, fileName?: string): KernelIssue[] => {
  if (error instanceof SmlibpyTessellationRefusal) {
    return [error.issue];
  }
  if (error instanceof PythonWorkerError) {
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
type SmlibpyContext = {
  readonly session: PythonSession;
  observedDependencies: string[];
  analysis?: { readonly operationId: number; readonly key: string; readonly result: Promise<SmlibpyAnalysis> };
};

/**
 * One analyze request per entry and runtime operation, spanned: dependency and parameter discovery ask the worker the
 * same question inside one render, so the second asks nothing.
 *
 * @param entryPath - Model entry the worker analyzes.
 * @param runtime - Kernel runtime, for its operation, abort signal and tracer.
 * @param context - Kernel context holding the session and its observed dependencies.
 * @returns The worker's analysis.
 */
const analyzeEntry = async (
  entryPath: string,
  runtime: Pick<KernelServices, 'operationId' | 'signal' | 'tracer'>,
  context: SmlibpyContext,
): Promise<SmlibpyAnalysis> => {
  const { operationId } = runtime;
  const { observedDependencies } = context;
  const key = [entryPath, ...observedDependencies].join('\0');
  if (operationId !== undefined && context.analysis?.operationId === operationId && context.analysis.key === key) {
    return context.analysis.result;
  }
  const analyze = async (): Promise<SmlibpyAnalysis> => {
    const span = runtime.tracer.startSpan('smlibpy.analyze', { entryPath });
    try {
      return await context.session.request({
        method: 'analyze',
        params: { entryPath, observedDependencies },
        schema: smlibpyAnalysisSchema,
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
 * The worker's mesh and measure requests for one retained model, in millimetres and degrees.
 *
 * @param target - The retained model, whether the bundle carries the B-rep edge polylines, the kernel runtime for its
 *   abort signal and the Python session holding the handle.
 * @returns The mesh request and the diagonal measurement.
 */
const meshRequests = ({
  handleId,
  edges,
  runtime,
  session,
}: Readonly<{
  handleId: string;
  edges: boolean;
  runtime: Pick<KernelServices, 'signal'>;
  session: PythonSession;
}>): {
  mesh: (tolerances: OcctTessellationTolerances, maxTriangles?: number) => Promise<SmlibpyMesh>;
  measureDiagonal: () => Promise<number>;
} => ({
  mesh: async (tolerances, maxTriangles) =>
    session.request({
      method: 'mesh',
      params: {
        handleId,
        linearTolerance: tolerances.linearTolerance,
        angularTolerance: tolerances.angularTolerance,
        edges,
        ...(maxTriangles === undefined ? {} : { maxTriangles }),
      },
      schema: smlibpyMeshSchema,
      signal: runtime.signal,
    }),
  async measureDiagonal() {
    const measured = await session.request({
      method: 'measure',
      params: { handleId },
      schema: smlibpyMeasureSchema,
      signal: runtime.signal,
    });
    return measured.diagonal;
  },
});

type GltfRequest = {
  artifact: SmlibpyArtifact;
  session: PythonSession;
  format: 'glb' | 'gltf';
  includeEdges: boolean;
  includeTopology: boolean;
  coordinateSystem?: 'y-up' | 'z-up';
  unit?: { length: 'meter' | 'millimeter' };
};

/**
 * Read a mesh bundle and write it as glTF with the model's materials, resources and mechanism.
 *
 * @param request - The bundle and the glTF to write.
 * @returns The glTF bytes and any mechanism issues.
 */
const bundleToGltf = async (
  request: GltfRequest,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; issues: KernelIssue[] }> => {
  const { geometries, mechanism, ...resources } = readSmlibpyMeshBundle(
    await request.session.readArtifact(request.artifact),
  );
  let issues: KernelIssue[] = [];
  const bytes = convertSmlibpyGeometriesToGltf({
    ...resources,
    geometries,
    format: request.format,
    includeEdges: request.includeEdges,
    includeTauTopology: request.includeTopology,
    ...(request.coordinateSystem === undefined ? {} : { coordinateSystem: request.coordinateSystem }),
    ...(request.unit === undefined ? {} : { unit: request.unit }),
    ...(mechanism === undefined ? {} : { mechanism }),
    onMechanismIssues(reported) {
      issues = reported;
    },
  });
  return { bytes, issues };
};

/**
 * Triangles in an STL file: the binary header's count, or the ASCII `facet` records.
 *
 * @param bytes - The STL file.
 * @param binary - Whether it is binary STL.
 * @returns Its triangle count.
 */
const stlTriangles = (bytes: Uint8Array<ArrayBuffer>, binary: boolean): number =>
  binary
    ? bytes.byteLength < 84
      ? 0
      : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)
    : (new TextDecoder().decode(bytes).match(/\bfacet\s+normal\b/gu)?.length ?? 0);

const modelContent = ['includeEdges', 'includeTopology'] as const;

const smlibpyKernelDefinition = defineKernel({
  id: 'smlibpy',
  extensions: ['py'],
  // A `.py` entry that imports smlibpy selects this kernel; any other falls through to the next Python kernel.
  detectImport: smlibpyDetectPattern,
  name: 'SmlibpyKernel',
  version: '0.3.5+python3.13.protocol1.topology1.bundle1',
  optionsSchema: smlibpyOptionsSchema,
  views: {
    model: {
      title: 'Model',
      mimeType: 'model/gltf-binary',
      optionsSchema: smlibpyRenderSchema,
      content: modelContent,
    },
  },
  // The Python worker answers `cancelMethod: 'cancel'` itself and keeps its resident prefix.
  cancellation: 'cooperative',
  exports: {
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: smlibpyExportSchemas.glb,
      content: modelContent,
    },
    gltf: {
      title: 'glTF JSON',
      mimeType: 'model/gltf+json',
      extension: 'gltf',
      optionsSchema: smlibpyExportSchemas.gltf,
      content: modelContent,
    },
    step: {
      title: 'STEP',
      mimeType: 'application/step',
      extension: 'step',
      optionsSchema: smlibpyExportSchemas.step,
    },
    stl: { title: 'STL', mimeType: 'model/stl', extension: 'stl', optionsSchema: smlibpyExportSchemas.stl },
  },

  async initialize(options, runtime) {
    // Late binding: an explicit closure, else the sealed closure the host's resolver or the payload store gives. An
    // unprepared kernel throws KERNEL_NOT_PREPARED here, and the runtime retries on the next operation.
    const { options: bound } = await bindPythonKernel({ adopter: smlibpyNative, options });
    const mirror = await createPythonWorkspaceMirror(smlibpyWorker);
    const session = createPythonSession({ ...bound, ...mirror, worker: smlibpyWorker, logger: runtime.logger });
    const observedDependencies: string[] = [];
    const warmCandidates: ActionDigest[] = [];
    return {
      mirror,
      session,
      resident: createSmlibpyResidentBinding(session),
      observedDependencies,
      warmCandidates,
      computeProducer: {
        id: '@taucad/smlibpy',
        version: computeProducerVersion,
        implementationAssets: [
          bound.pythonSha256,
          bound.workerSha256,
          ...bound.supportFiles.map(({ sha256 }) => sha256),
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
      throw new SmlibpyKernelError(issuesFrom(error, entryPath));
    }
  },

  async describe({ entryPath }, runtime, context) {
    await context.mirror.sync(runtime.filesystem, runtime.fileContentCache, runtime.operationId);
    try {
      const analysis = await analyzeEntry(entryPath, runtime, context);
      return createKernelSuccess({ parameters: analysis.declaration });
    } catch (error) {
      return createKernelError(issuesFrom(error, entryPath));
    }
  },

  async evaluate({ entryPath, parameters }, runtime, context) {
    const paths = await context.mirror.sync(runtime.filesystem, runtime.fileContentCache, runtime.operationId);
    // The project's own pins must name the libraries this kernel runs, or it runs differently outside Tau.
    const issues = paths.includes(pyprojectPath)
      ? libraryVersionMismatches(await runtime.filesystem.readFile(pyprojectPath, 'utf8'))
      : [];
    const build = async (compute: Record<string, unknown> | undefined) => {
      const span = runtime.tracer.startSpan('smlibpy.build', { entryPath });
      try {
        const result = await context.session.request({
          method: 'build',
          params: { entryPath, parameters, ...(compute ? { compute } : {}) },
          schema: smlibpyBuildSchema,
          signal: runtime.signal,
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
        const plain = await build(undefined);
        return { handle: { sessionGeneration: context.session.generation, handleId: plain.handleId }, issues };
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
        // Warm discovery runs before every build, so a worker that outlives another producer's publication still
        // picks it up.
        await scope.warm({ digests: context.warmCandidates, maxEntries: smlibpyComputeDescriptorLimit });
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
          context.resident.observeResidentBytes(result.compute.stats.logicalBytes);
          scope.announce({ entries: announcements });
          context.warmCandidates = [...new Set([...context.warmCandidates, ...admitted])].slice(
            -smlibpyComputeDescriptorLimit,
          );
        }
        outcome = 'delivered';
        return { handle: { sessionGeneration: context.session.generation, handleId: result.handleId }, issues };
      } finally {
        scope.close({ outcome: runtime.signal.aborted ? 'cancelled' : outcome });
      }
    } catch (error) {
      throw new SmlibpyKernelError(issuesFrom(error, entryPath));
    }
  },

  async render({ handle, options, content }, runtime, context) {
    if (!context.session.isHandleGenerationValid(handle.sessionGeneration)) {
      throw new SmlibpyKernelError(issuesFrom(new Error('SMLibPy native handle is stale.')));
    }
    try {
      const includeEdges = content?.includeEdges === true;
      const includeTopology = content?.includeTopology === true;
      const { mesh, measureDiagonal } = meshRequests({
        handleId: handle.handleId,
        edges: includeEdges || includeTopology,
        runtime,
        session: context.session,
      });
      // The render hook cannot tell a viewer preview from a capture, so every render takes the preview budget.
      const meshed = await meshPreviewWithinBudget(
        {
          tessellation: options.tessellation,
          explicitDefaults: occtExplicitTessellationDefaults.preview,
          budget: occtTriangleBudgets.preview,
          measureDiagonal,
        },
        mesh,
      );
      runtime.signal.throwIfAborted();
      const gltf = await bundleToGltf({
        artifact: meshed.artifact,
        session: context.session,
        format: 'glb',
        includeEdges,
        includeTopology,
      });
      return {
        content: asBuffer(gltf.bytes),
        tessellation: meshed.tessellation,
        issues: [...meshed.issues, ...gltf.issues],
      };
    } catch (error) {
      throw new SmlibpyKernelError(issuesFrom(error));
    }
  },

  async export(input, runtime, context) {
    if (!context.session.isHandleGenerationValid(input.handle.sessionGeneration)) {
      throw new SmlibpyKernelError(issuesFrom(new Error('SMLibPy native handle is stale.')));
    }
    const { handleId } = input.handle;
    try {
      switch (input.exportId) {
        case 'glb':
        case 'gltf': {
          const { exportId, options, content } = input;
          const includeEdges = content?.includeEdges === true;
          const includeTopology = content?.includeTopology === true;
          const { mesh, measureDiagonal } = meshRequests({
            handleId,
            edges: includeEdges || includeTopology,
            runtime,
            session: context.session,
          });
          const meshed = await meshExportWithinBudget(
            {
              tessellation: options.tessellation,
              explicitDefaults: occtExplicitTessellationDefaults.export,
              budget: occtTriangleBudgets.export,
              measureDiagonal,
            },
            mesh,
          );
          const gltf = await bundleToGltf({
            artifact: meshed.artifact,
            session: context.session,
            format: exportId,
            includeEdges,
            includeTopology,
            coordinateSystem: options.coordinateSystem,
            unit: options.unit,
          });
          return {
            files: [createExportFile(exportId, exportId === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(gltf.bytes))],
            issues: [...meshed.issues, ...gltf.issues],
          };
        }
        case 'stl': {
          const { options } = input;
          const { measureDiagonal } = meshRequests({ handleId, edges: false, runtime, session: context.session });
          const requested = await resolveSmlibpyTessellation({
            tessellation: options.tessellation,
            explicitDefaults: occtExplicitTessellationDefaults.export,
            budget: occtTriangleBudgets.export,
            measureDiagonal,
          });
          const artifact = await context.session.request({
            method: 'export',
            params: {
              handleId,
              format: 'stl',
              linearTolerance: requested.linearTolerance,
              angularTolerance: requested.angularTolerance,
              binary: options.binary,
              coordinateSystem: options.coordinateSystem,
            },
            schema: smlibpyArtifactSchema,
            signal: runtime.signal,
          });
          const bytes = await context.session.readArtifact(artifact);
          assertExportWithinBudget(requested, stlTriangles(bytes, options.binary), occtTriangleBudgets.export);
          return { files: [createExportFile('stl', 'model.stl', asBuffer(bytes))] };
        }
        default: {
          const artifact = await context.session.request({
            method: 'export',
            params: { handleId, format: 'step', coordinateSystem: input.options.coordinateSystem },
            schema: smlibpyArtifactSchema,
            signal: runtime.signal,
          });
          const bytes = await context.session.readArtifact(artifact);
          return { files: [createExportFile('step', 'assembly.step', asBuffer(bytes))] };
        }
      }
    } catch (error) {
      throw new SmlibpyKernelError(issuesFrom(error));
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

/**
 * The `smlibpy` kernel capability. Every registration carries `smlibpyNative`, so a host that lists the plugin in a
 * runtime definition prepares and binds the kernel from the definition alone.
 * @public
 */
export const smlibpyKernel = withNativeDeployment(smlibpyKernelDefinition, smlibpyNative);
