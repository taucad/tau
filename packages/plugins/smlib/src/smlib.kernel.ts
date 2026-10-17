/**
 * SMLib Kernel Module
 *
 * Full defineKernel implementation for the SMLib NURBS kernel through `@classcad/smlibwasm`.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation. Registers
 * `@classcad/smlibwasm` as a built-in module; the library loads its own WebAssembly kernel on import.
 *
 * @see docs/policy/es-module-policy.md
 */

import smlibPackage from '@classcad/smlibwasm/package.json' with { type: 'json' };
import { createExportFile } from '@taucad/runtime/types';
import type { GeometrySvg, KernelIssue, RuntimeSpanTracer } from '@taucad/runtime/types';
import {
  asBuffer,
  convertRawIssuesToKernelIssues,
  createFrameClassifier,
  createKernelError,
  createKernelLibraryTracer,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  defineLibraryTracePolicy,
  deriveLocationFromFrames,
  extractDefaultParameters,
  isRecordObject,
  jsonSchemaFromJson,
  named,
  nonemptyExportFiles,
  parseStackTrace,
  registerKernelModule,
  resolveSourcePath,
  toVmEntryPath,
} from '@taucad/runtime/kernel';
import type { KernelLibraryTraceHandle, KernelServices } from '@taucad/runtime/kernel';
import {
  createTessellationBudgetExceededIssue,
  occtExplicitTessellationDefaults,
  occtTriangleBudgets,
} from '@taucad/occt-core';
import type { OcctResolvedTessellation } from '@taucad/occt-core';
import {
  createEmptyGlb,
  createEmptyGltf,
  readMechanismExport,
  resolveShapeName,
  validateGlbResources,
} from '@taucad/geometry-core';
import type { GlbResources } from '@taucad/geometry-core';

import type { ShapeConfig } from '#model.js';
import { smlibDetectPattern, smlibModuleName } from '#smlib.constants.js';
import { smlibExportSchemas, smlibOptionsSchema, smlibRenderSchema } from '#smlib.schemas.js';
import {
  countMesh,
  isDrawingShape,
  normalizeRenderShapes,
  render,
  renderDrawing,
  renderWithinBudget,
  resolveSmlibTessellation,
  sampleDrawing,
} from '#utils/render-output.js';
import type { DrawingEntry, NamedInputShape, SmlibLibrary } from '#utils/render-output.js';
import { convertSmlibGeometriesToGltf } from '#utils/smlib-to-gltf.js';

const kernelId = 'smlib';

/**
 * Live SMLib native handle: the shapes `main` returned, the model's GLB resources and the entry
 * module's `mechanism` export, normalised to plain JSON. All are export-facing evidence, so all
 * survive a snapshot.
 */
type NativeHandle = GlbResources & {
  /** Bodies, faces and meshes for the model view and exports. */
  shapes: NamedInputShape[];
  /** Curves for the drawing view, sampled once at evaluation. */
  drawings: DrawingEntry[];
  mechanism?: unknown;
};

type ShapeMetadata = Omit<ShapeConfig, 'shape'> & { name: string };

/** Structured-cloneable shape snapshot: exact B-rep in SMLib's lossless `.smb` text, or mesh arrays. */
type SerializedShape =
  | { kind: 'brep'; smb: Uint8Array<ArrayBuffer>; metadata: ShapeMetadata }
  | { kind: 'mesh'; vertices: number[]; triangles: number[]; metadata: ShapeMetadata };

type SerializedHandle = GlbResources & { shapes: SerializedShape[]; drawings: DrawingEntry[]; mechanism?: unknown };

type SmlibContext = {
  library: SmlibLibrary;
  libraryTrace: KernelLibraryTraceHandle<SmlibLibrary>;
};

/**
 * Advertise the views and exports supported by one retained model.
 * @param handle - Evaluated SMLib shapes and drawings.
 * @returns Ordered view and export offers with stable authored drawing instances.
 * @internal
 */
export const offersFor = (
  handle: Pick<NativeHandle, 'shapes' | 'drawings'>,
): {
  views: ReadonlyArray<'model' | 'drawing'>;
  exports: ReadonlyArray<'glb' | 'gltf'> | undefined;
  instances?: { drawing: ReadonlyArray<{ id: string; title: string }> };
} => {
  const { drawings } = handle;
  const hasModel = handle.shapes.length > 0;
  const names = new Map<string, number>();
  for (const { name } of drawings) {
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  const instances = drawings.flatMap(({ name }) => (names.get(name) === 1 ? [{ id: name, title: name }] : []));
  return {
    views: hasModel || drawings.length === 0 ? (drawings.length > 0 ? ['model', 'drawing'] : ['model']) : ['drawing'],
    exports: hasModel ? undefined : drawings.length === 0 ? ['glb', 'gltf'] : [],
    ...(drawings.length > 0 ? { instances: { drawing: instances } } : {}),
  };
};

const tracedPhase = async <T>(
  tracer: RuntimeSpanTracer,
  label: string,
  operation: () => Promise<T> | T,
): Promise<T> => {
  const span = tracer.startSpan(label);
  try {
    return await operation();
  } finally {
    span.end();
  }
};

const smlibLibraryTracePolicy = defineLibraryTracePolicy({
  library: 'smlib',
  spanPrefix: 'smlib.library',
  summarySpanName: 'smlib.library.summary',
  traceCall(context) {
    return context.scope === 'user-main' ? { type: 'trace' } : { type: 'ignore' };
  },
  // Shapes built in user code are wrapped too, so their methods (`cut`, `fillet`) count; the
  // tracer unwraps arguments and `main`'s result before SMLib or the kernel sees them.
  shouldWrapValue(context) {
    return typeof context.value === 'function' || context.scope === 'user-main';
  },
});

/**
 * A plain-object facade over the module namespace. Namespace bindings are non-configurable, so a
 * tracing proxy cannot return wrapped values for them; the facade's own properties can be.
 * @param module - The imported `@classcad/smlibwasm` namespace.
 * @returns A frozen-shape copy with every export.
 */
const createLibraryFacade = (module: SmlibLibrary): SmlibLibrary => ({ ...module });

function registerSmlibModule(runtime: KernelServices, library: SmlibLibrary): void {
  registerKernelModule(runtime, {
    name: smlibModuleName,
    exports: library,
    package: smlibPackage,
    globalName: 'smlib',
  });
}

function extractDefaultName(module: unknown): string | undefined {
  if (!isRecordObject(module)) {
    return undefined;
  }
  return typeof module['defaultName'] === 'string' ? module['defaultName'] : undefined;
}

type ErrorContext = { sourceMap?: string; entryUrl?: string };

/**
 * Turn a thrown error into a source-mapped kernel issue. SMLib's `KernelError` carries the failed
 * operation, the kernel status code and a hint, which become issue details.
 * @param error - Thrown value.
 * @param context - Bundle source map and the evaluated entry URL.
 * @returns A runtime issue attributed to the SMLib kernel.
 */
const formatSmlibError = (error: unknown, context: ErrorContext): KernelIssue => {
  const stackFrames = parseStackTrace(error, {
    classifyFrame: createFrameClassifier(),
    sourceMap: context.sourceMap,
    resolveSourcePath,
    lastEntryName: context.entryUrl,
  });
  const message = error instanceof Error ? error.message : String(error);
  const kernelError = isRecordObject(error) && typeof error['operation'] === 'string' ? error : undefined;
  const location = deriveLocationFromFrames(stackFrames, context.sourceMap, resolveSourcePath);
  return {
    message,
    code: 'RUNTIME',
    type: 'runtime',
    severity: 'error',
    stackFrames,
    ...(location ? { location } : {}),
    details: {
      producer: { kernelId },
      ...(error instanceof Error ? { errorName: error.name } : {}),
      ...(kernelError
        ? {
            operation: kernelError['operation'],
            ...(typeof kernelError['status'] === 'string' ? { status: kernelError['status'] } : {}),
            ...(typeof kernelError['hint'] === 'string' ? { hint: kernelError['hint'] } : {}),
          }
        : {}),
    },
  };
};

const isCallable = (value: unknown): value is (...arguments_: unknown[]) => unknown => typeof value === 'function';

const runMain = async (
  module: unknown,
  library: SmlibLibrary,
  parameters: Record<string, unknown>,
): Promise<unknown> => {
  const main = isRecordObject(module) ? (module['default'] ?? module['main']) : undefined;
  if (!isCallable(main)) {
    return undefined;
  }
  return main.length >= 2 ? await main(library, parameters) : await main(parameters);
};

/**
 * Configuration for the SMLib kernel.
 * @public
 */
export type SmlibOptions = {
  /** SMLib library call tracing mode for user code. Defaults to `off`. */
  libraryTracing?: 'off' | 'summary' | 'per-call';
};

/** @public */
export const smlibKernel = defineKernel({
  id: kernelId,
  extensions: ['ts', 'js'],
  detectImport: smlibDetectPattern,
  builtinModuleNames: [smlibModuleName],
  builtinPackages: {
    [smlibModuleName]: { name: smlibPackage.name, version: smlibPackage.version },
  },
  name: 'SmlibKernel',
  version: '1.0.0',
  optionsSchema: smlibOptionsSchema,
  views: {
    model: {
      title: 'Model',
      mimeType: 'model/gltf-binary',
      optionsSchema: smlibRenderSchema,
      content: ['includeEdges', 'includeTopology'],
    },
    drawing: { title: 'Drawing', mimeType: 'image/svg+xml', instances: true },
  },
  // In-worker SMLib calls are synchronous; the kernel checks the signal between phases, so a
  // superseded drag render is abandoned, not killed.
  cancellation: 'cooperative',
  exports: {
    stl: { title: 'STL', mimeType: 'model/stl', extension: 'stl', optionsSchema: smlibExportSchemas.stl },
    step: { title: 'STEP', mimeType: 'application/step', extension: 'step', optionsSchema: smlibExportSchemas.step },
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: smlibExportSchemas.glb,
      content: ['includeEdges', 'includeTopology'],
    },
    gltf: {
      title: 'glTF JSON',
      mimeType: 'model/gltf+json',
      extension: 'gltf',
      optionsSchema: smlibExportSchemas.gltf,
      content: ['includeEdges', 'includeTopology'],
    },
  },

  async initialize(options, runtime): Promise<SmlibContext> {
    const { logger, tracer } = runtime;
    const span = tracer.startSpan('smlib.wasm-init');
    let module: SmlibLibrary;
    try {
      // Importing the library instantiates its WebAssembly kernel (top-level await).
      module = await import('@classcad/smlibwasm');
    } finally {
      span.end();
    }
    const library = createLibraryFacade(module);
    const libraryTrace = createKernelLibraryTracer({
      library,
      tracer,
      mode: options.libraryTracing,
      policy: smlibLibraryTracePolicy,
      defaultScope: 'kernel-setup',
    });
    registerSmlibModule(runtime, libraryTrace.tracedLibrary);
    logger.debug(`SMLib kernel initialized (smlibwasm ${module.version}, libraryTracing: ${options.libraryTracing})`);
    return { library, libraryTrace };
  },

  async resolve({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async describe({ entryPath }, runtime) {
    const relativeFilePath = toVmEntryPath(entryPath);
    const errorContext: ErrorContext = {};
    try {
      const bundleResult = await runtime.bundler.bundle(entryPath);
      if (!bundleResult.success) {
        return createKernelError(convertRawIssuesToKernelIssues(bundleResult.issues, relativeFilePath));
      }
      errorContext.sourceMap = bundleResult.sourceMap;

      const executeResult = await runtime.execute(bundleResult.code);
      if (!executeResult.success) {
        return createKernelError(convertRawIssuesToKernelIssues(executeResult.issues, relativeFilePath));
      }
      errorContext.entryUrl = executeResult.entryUrl;

      const defaultParameters = extractDefaultParameters(executeResult.value);
      const jsonSchema = await jsonSchemaFromJson(defaultParameters);
      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:smlib:parameters',
          name: 'SmlibParameters',
        }),
      });
    } catch (error) {
      return createKernelError([formatSmlibError(error, errorContext)]);
    }
  },

  async evaluate({ entryPath, parameters }, runtime, context: SmlibContext) {
    const { tracer } = runtime;
    const relativeFilePath = toVmEntryPath(entryPath);
    const errorContext: ErrorContext = {};

    try {
      const bundleResult = await runtime.bundler.bundle(entryPath);
      if (!bundleResult.success) {
        throw new SmlibBuildError(convertRawIssuesToKernelIssues(bundleResult.issues, relativeFilePath));
      }
      errorContext.sourceMap = bundleResult.sourceMap;

      const buildGeometry = named('Object.createGeometry', async () => {
        const executeResult = await runtime.execute(bundleResult.code);
        if (!executeResult.success) {
          throw new SmlibBuildError(convertRawIssuesToKernelIssues(executeResult.issues, relativeFilePath));
        }
        errorContext.entryUrl = executeResult.entryUrl;
        runtime.signal.throwIfAborted();

        const output = await tracedPhase(tracer, 'create.runMain', async () => {
          const mainSpan = tracer.startSpan('smlib.run-main', { phase: 'computingGeometry', stage: 'brep' });
          try {
            return await context.libraryTrace.runInScope({
              scope: 'user-main',
              operation: async () => runMain(executeResult.value, context.libraryTrace.tracedLibrary, parameters),
            });
          } finally {
            context.libraryTrace.emitSummary();
            mainSpan.end();
          }
        });
        runtime.signal.throwIfAborted();

        const shapes = context.libraryTrace.unwrap(output);
        if (shapes === undefined) {
          runtime.logger.warn('createGeometry returning empty: main-returned-undefined', {
            data: { filePath: relativeFilePath },
          });
          const handle: NativeHandle = { shapes: [], drawings: [] };
          return { handle, ...offersFor(handle) };
        }

        const model =
          isRecordObject(shapes) &&
          !Array.isArray(shapes) &&
          'shapes' in shapes &&
          !(shapes instanceof context.library.Shape)
            ? shapes
            : undefined;
        if (model && !Array.isArray(model['shapes'])) {
          throw new TypeError('Model.shapes must be an array of shape configurations.');
        }
        const modelShapes = model?.['shapes'];
        if (model) {
          validateGlbResources(model);
        }
        const { mechanism, issues } = await readMechanismExport({
          module: executeResult.value,
          parameters,
          kernelId,
          formatError: (error) => formatSmlibError(error, errorContext),
        });

        const entries = normalizeRenderShapes(
          context.library,
          model ? modelShapes : shapes,
          extractDefaultName(executeResult.value),
        );
        const handle: NativeHandle = {
          shapes: entries.filter(({ shape }) => !isDrawingShape(context.library, shape)),
          drawings: entries
            .filter(({ shape }) => isDrawingShape(context.library, shape))
            .map((entry) => sampleDrawing(context.library, entry)),
          mechanism,
          ...(model ? { images: model.images, textures: model.textures, samplers: model.samplers } : {}),
        };
        return { handle, issues, ...offersFor(handle) };
      });

      return await buildGeometry();
    } catch (error) {
      if (error instanceof SmlibBuildError || runtime.signal.aborted) {
        throw error;
      }
      throw new SmlibBuildError([formatSmlibError(error, errorContext)]);
    }
  },

  async render(input, runtime, context) {
    const { handle } = input;
    const { library } = context;
    if (input.view === 'drawing') {
      const selected =
        input.instance === undefined ? handle.drawings : handle.drawings.filter(({ name }) => name === input.instance);
      if (selected.length === 0) {
        throw new Error(`Drawing instance '${String(input.instance)}' is unavailable.`);
      }
      const drawing: GeometrySvg = renderDrawing(selected);
      return { content: drawing.content, units: drawing.units };
    }

    const { options, content } = input;
    const { tracer } = runtime;
    const modelShapes = handle.shapes;
    if (modelShapes.length === 0) {
      return { content: asBuffer(createEmptyGlb()) };
    }

    try {
      const includeEdges = content?.includeEdges === true;
      const includeTopology = content?.includeTopology === true;
      let mechanismIssues: KernelIssue[] = [];
      // The render hook cannot tell a viewer preview from a capture, so every render takes the
      // preview budget.
      const budgeted = await tracedPhase(tracer, 'mesh.renderDisplayTessellation', () => {
        const span = tracer.startSpan('smlib.render-output', { phase: 'computingGeometry', stage: 'render-output' });
        try {
          return context.libraryTrace.runInScope({
            scope: 'render-output',
            operation: () =>
              renderWithinBudget(modelShapes, {
                library,
                request: {
                  tessellation: options.tessellation,
                  explicitDefaults: occtExplicitTessellationDefaults.preview,
                },
                budget: occtTriangleBudgets.preview,
                collectBrepEdges: includeEdges || includeTopology,
                tracer,
              }),
          });
        } finally {
          span.end();
        }
      });
      runtime.signal.throwIfAborted();

      const gltf = await tracedPhase(tracer, 'mesh.packGltf', () => {
        const span = tracer.startSpan('smlib.mesh-to-gltf', {
          shapeCount: budgeted.geometries.length,
          phase: 'computingGeometry',
          stage: 'gltf-pack',
        });
        try {
          return convertSmlibGeometriesToGltf({
            images: handle.images,
            textures: handle.textures,
            samplers: handle.samplers,
            geometries: includeEdges
              ? budgeted.geometries
              : budgeted.geometries.map((geometry) => ({ ...geometry, edges: { ...geometry.edges, lines: [] } })),
            format: 'glb',
            includeTauTopology: includeTopology,
            logger: runtime.logger,
            mechanism: handle.mechanism,
            onMechanismIssues(issues) {
              mechanismIssues = issues;
            },
          });
        } finally {
          span.end();
        }
      });
      return {
        content: gltf,
        tessellation: budgeted.tessellation,
        issues: [...budgeted.issues, ...mechanismIssues],
      };
    } catch (error) {
      if (error instanceof SmlibBuildError || runtime.signal.aborted) {
        throw error;
      }
      throw new SmlibBuildError([formatSmlibError(error, {})]);
    }
  },

  async export(input, runtime, context) {
    const { library } = context;
    return context.libraryTrace.runInScope({
      scope: 'export',
      operation: async () => {
        const { exportId, handle } = input;
        const entries = handle.shapes;
        const runtimeError = (message: string): never => {
          throw new SmlibBuildError([{ message, code: 'RUNTIME', type: 'runtime', severity: 'error' }]);
        };

        switch (exportId) {
          case 'glb':
          case 'gltf': {
            const { options, content } = input;
            const fileName = exportId === 'glb' ? 'model.glb' : 'model.gltf';
            if (entries.length === 0) {
              return {
                files: [
                  createExportFile(
                    exportId,
                    fileName,
                    asBuffer(exportId === 'glb' ? createEmptyGlb() : createEmptyGltf()),
                  ),
                ] as const,
              };
            }
            const requested = resolveSmlibTessellation(library, entries, {
              tessellation: options.tessellation,
              explicitDefaults: occtExplicitTessellationDefaults.export,
            });
            const geometries = await tracedPhase(runtime.tracer, 'export.renderGlbTessellation', () =>
              render(entries, {
                library,
                tessellation: requested,
                collectBrepEdges: content?.includeEdges === true || content?.includeTopology === true,
                tracer: runtime.tracer,
              }),
            );
            assertWithinExportBudget(requested, countMesh(geometries).triangles);
            let mechanismIssues: KernelIssue[] = [];
            const gltf = await tracedPhase(runtime.tracer, 'export.packGltf', () =>
              convertSmlibGeometriesToGltf({
                images: handle.images,
                textures: handle.textures,
                samplers: handle.samplers,
                geometries:
                  content?.includeEdges === true
                    ? geometries
                    : geometries.map((geometry) => ({ ...geometry, edges: { ...geometry.edges, lines: [] } })),
                format: exportId,
                includeTauTopology: content?.includeTopology === true,
                logger: runtime.logger,
                coordinateSystem: options.coordinateSystem,
                unit: options.unit,
                mechanism: handle.mechanism,
                onMechanismIssues(issues) {
                  mechanismIssues = issues;
                },
              }),
            );
            return {
              files: [createExportFile(exportId, fileName, asBuffer(gltf))] as const,
              issues: mechanismIssues,
            };
          }

          case 'step': {
            const bodies = entries.flatMap(({ shape, name, color }) =>
              shape instanceof library.Mesh ? [] : [{ shape, name, color }],
            );
            if (bodies.length === 0) {
              return runtimeError(
                entries.length === 0
                  ? 'No geometry available for export'
                  : 'STEP export needs exact B-rep bodies; this model returned only meshes.',
              );
            }
            const { coordinateSystem } = input.options;
            let text: string;
            try {
              text = await tracedPhase(runtime.tracer, 'export.exportSTEP', () =>
                library.toStep(
                  bodies.flatMap(({ shape, name, color }) => {
                    const placed = toExportBody(library, shape, coordinateSystem);
                    if (!(placed instanceof library.Part || placed instanceof library.Shell)) {
                      return [];
                    }
                    const labelled = placed.named(name);
                    return [color ? labelled.colored(color) : labelled];
                  }),
                  { name: bodies.length === 1 ? bodies[0]!.name : 'assembly' },
                ),
              );
            } catch (error) {
              return runtimeError(error instanceof Error ? error.message : String(error));
            }
            return { files: [createExportFile('step', 'assembly', new TextEncoder().encode(text))] as const };
          }

          case 'stl': {
            const { options } = input;
            if (entries.length === 0) {
              return runtimeError('No geometry available for export');
            }
            const requested = resolveSmlibTessellation(library, entries, {
              tessellation: options.tessellation,
              explicitDefaults: occtExplicitTessellationDefaults.export,
            });
            const files = entries.map(({ shape, name }, index) => {
              const placed =
                shape instanceof library.Mesh
                  ? rotateMesh(library, shape, options.coordinateSystem)
                  : toExportBody(library, shape, options.coordinateSystem);
              const bytes = library.toStl(placed, {
                tolerance: requested.linearTolerance,
                angle: requested.angularTolerance,
                ascii: !options.binary,
              });
              return createExportFile(
                'stl',
                resolveShapeName({ index, name, source: 'generated' }),
                new Uint8Array(bytes),
              );
            });
            assertWithinExportBudget(
              requested,
              files.reduce((total, file) => total + countStlTriangles(file.bytes, options.binary), 0),
            );
            return { files: nonemptyExportFiles(files) };
          }

          default: {
            const _exhaustive: never = exportId;
            throw new SmlibBuildError([
              {
                message: `Unsupported export format: ${String(_exhaustive)}`,
                code: 'KERNEL_CAPABILITY_MISSING',
                type: 'runtime',
                severity: 'error',
              },
            ]);
          }
        }
      },
    });
  },

  serializeHandle({ handle }, runtime, context): SerializedHandle {
    const span = runtime.tracer.startSpan('create.serializeNativeHandle');
    try {
      return serializeSmlibHandle(context.library, handle);
    } finally {
      span.end();
    }
  },

  deserializeHandle({ serialized }, _runtime, context): NativeHandle {
    const { library } = context;
    return {
      ...(serialized.images === undefined ? {} : { images: serialized.images }),
      ...(serialized.textures === undefined ? {} : { textures: serialized.textures }),
      ...(serialized.samplers === undefined ? {} : { samplers: serialized.samplers }),
      ...(serialized.mechanism === undefined ? {} : { mechanism: serialized.mechanism }),
      drawings: serialized.drawings,
      shapes: serialized.shapes.map(
        (entry): NamedInputShape => ({
          ...entry.metadata,
          shape: entry.kind === 'brep' ? library.fromSmb(entry.smb) : new library.Mesh(entry.vertices, entry.triangles),
        }),
      ),
    };
  },
});

type ExportCoordinateSystem = 'y-up' | 'z-up' | undefined;

/**
 * A body to export: faces become sheets, and y-up turns the Z-up model about X by −90°.
 * @param library - Loaded SMLib module.
 * @param shape - A body or face.
 * @param coordinateSystem - The export's up axis.
 * @returns The body to write.
 */
const toExportBody = (
  library: SmlibLibrary,
  shape: Exclude<NamedInputShape['shape'], InstanceType<SmlibLibrary['Mesh']>>,
  coordinateSystem: ExportCoordinateSystem,
) => {
  const body = shape instanceof library.Face ? shape.toShell() : shape;
  return coordinateSystem === 'y-up' ? body.rotate(library.Axis.X, -90) : body;
};

const rotateMesh = (
  library: SmlibLibrary,
  mesh: InstanceType<SmlibLibrary['Mesh']>,
  coordinateSystem: ExportCoordinateSystem,
) => {
  if (coordinateSystem !== 'y-up') {
    return mesh;
  }
  const vertices = Float64Array.from(mesh.vertices);
  for (let index = 0; index < vertices.length; index += 3) {
    const y = vertices[index + 1]!;
    vertices[index + 1] = vertices[index + 2]!;
    vertices[index + 2] = y === 0 ? 0 : -y;
  }
  return new library.Mesh(vertices, mesh.triangles);
};

const serializeSmlibHandle = (library: SmlibLibrary, handle: NativeHandle): SerializedHandle => ({
  ...(handle.images === undefined ? {} : { images: handle.images }),
  ...(handle.textures === undefined ? {} : { textures: handle.textures }),
  ...(handle.samplers === undefined ? {} : { samplers: handle.samplers }),
  ...(handle.mechanism === undefined ? {} : { mechanism: handle.mechanism }),
  drawings: handle.drawings,
  shapes: handle.shapes.map(({ shape, ...metadata }): SerializedShape => {
    if (shape instanceof library.Mesh) {
      return { kind: 'mesh', vertices: [...shape.vertices], triangles: [...shape.triangles], metadata };
    }
    const body = shape instanceof library.Face ? shape.toShell() : shape;
    return { kind: 'brep', smb: new Uint8Array(library.toSmb(body)), metadata };
  }),
});

const binaryStlHeaderBytes = 80;

/**
 * Triangles in an STL file: the binary header count, or the ASCII facet count.
 * @param bytes - STL file bytes.
 * @param binary - Whether the file is binary STL.
 * @returns The triangle count.
 */
function countStlTriangles(bytes: Uint8Array<ArrayBuffer>, binary: boolean): number {
  if (!binary) {
    return new TextDecoder().decode(bytes).match(/^\s*facet\b/gm)?.length ?? 0;
  }
  return bytes.byteLength < binaryStlHeaderBytes + 4
    ? 0
    : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(binaryStlHeaderBytes, true);
}

/**
 * Exports refuse instead of coarsening: an over-budget mesh fails with a suggested tessellation.
 * @param requested - The resolved request the export meshed with.
 * @param triangles - Triangles the export produced.
 */
function assertWithinExportBudget(requested: OcctResolvedTessellation, triangles: number): void {
  const budget = occtTriangleBudgets.export;
  if (triangles > budget) {
    throw new SmlibBuildError([
      createTessellationBudgetExceededIssue({ producer: kernelId, requested, triangles, budget }),
    ]);
  }
}

class SmlibBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
