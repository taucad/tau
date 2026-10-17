/**
 * Manifold Kernel Module
 *
 * Integrates the Manifold WASM CAD kernel into Tau's kernel framework.
 * Uses services.bundler for JS/TS bundling and services.execute for module evaluation.
 * Registers manifold-3d modules as built-ins for user code imports.
 */

import { Document, Primitive, WebIO, getBounds } from '@gltf-transform/core';
import type { Manifold } from 'manifold-3d';
import type * as ManifoldCad from 'manifold-3d/manifoldCAD';
import type { BaseGLTFNode, GLTFAttribute, GLTFMaterial } from 'manifold-3d/lib/gltf-node.js';

import { createExportFile } from '@taucad/runtime/types';
import type { KernelIssue, TessellationReport } from '@taucad/runtime/types';
import {
  asBuffer,
  jsonSchemaFromJson,
  defineKernel,
  isRecordObject,
  extractDefaultParameters,
  registerKernelModule,
  toVmEntryPath,
  enrichIssueLocation,
  createKernelError,
  createKernelSuccess,
  createKernelParameterDeclaration,
  createFrameClassifier,
  parseStackTrace,
  resolveSourcePath,
  deriveLocationFromFrames,
} from '@taucad/runtime/kernel';
import type { KernelServices } from '@taucad/runtime/kernel';

import { manifoldOptionsSchema, manifoldExportSchemas, manifoldRenderSchema } from '#manifold.schemas.js';
import {
  createManifoldTessellationBudgetExceededIssue,
  createManifoldTessellationDowngradedIssue,
  createManifoldTessellationReport,
  manifoldTriangleBudgets,
  meshWithinManifoldBudget,
  resolveManifoldTessellation,
} from '#manifold-tessellation.js';
import type { ManifoldCircularDetail } from '#manifold-tessellation.js';

import { initManifoldWasm } from '#init-manifold.js';

import { transformGltfExportBytes, normalizeGltfGeometryNames, createEmptyGlb } from '@taucad/geometry-core';

// =============================================================================
// Types
// =============================================================================

/**
 * The installed `manifold-3d` manifest's `name` and `version`. The package exports no
 * `./package.json`, and a built kernel cannot read an unexported manifest, so this pins it;
 * `manifold-package-identity.test.ts` fails when it differs from the installed package.
 */
const manifoldPackage = { name: 'manifold-3d', version: '3.4.1' } as const;

/**
 * Canonical regex for detecting manifold-3d usage in source code.
 *
 * Branches: ESM import, CJS require, dynamic import().
 * @public
 */
export const manifoldDetectPattern =
  /import\s+.*from\s+["']manifold-3d(?:\/[^"']*)?["']|require\s*\(\s*["']manifold-3d(?:\/[^"']*)?["']\s*\)|import\s*\(\s*["']manifold-3d(?:\/[^"']*)?["']\s*\)/;

// =============================================================================
// Module registration helpers
// =============================================================================

const isCallable = (value: unknown): value is (...arguments_: readonly unknown[]) => unknown =>
  typeof value === 'function';

// `show()` and `only()` capture meshes that manifold-3d writes with the run's
// attribute labels, so supplying normals would mislabel them; see addMissingNormals.
let debugViewRequested = false;

const recordDebugView = (view: unknown): ((manifold: unknown) => unknown) => {
  if (!isCallable(view)) {
    throw new TypeError('Manifold debug views must be callable.');
  }
  return (manifold) => {
    debugViewRequested = true;
    return view(manifold);
  };
};

/** A Manifold or CrossSection object that owns WASM memory until `delete()` is called. */
type NativeHandle = { delete(): void; isDeleted(): boolean };

/** Every Manifold and CrossSection created in this realm since the last {@link cleanupManifoldRuntime}. */
const liveHandles = new Set<NativeHandle>();

const isNativeHandle = (value: unknown): value is NativeHandle =>
  isRecordObject(value) && typeof value['delete'] === 'function' && typeof value['isDeleted'] === 'function';

type ManifoldConstructors = Pick<typeof ManifoldCad, 'Manifold' | 'CrossSection'>;

let trackedConstructors: Promise<ManifoldConstructors> | undefined;

/**
 * Record every Manifold and CrossSection that model code creates, so cleanup can delete them.
 *
 * manifold-3d's `garbageCollectManifold` frees only the results of static constructors such as `cube`: its
 * `setup()` replaces `Module.Manifold` and `Module.CrossSection` with factories whose `prototype` the instances
 * never inherit, so the wrapped member functions never run and every `translate`, boolean, `extrude`, `revolve`
 * and `new CrossSection` result stays allocated. This wraps the prototypes the instances do inherit, the module's
 * native free functions that build new shapes, and the two constructors. It runs once per realm, like the
 * manifold-3d registry it supplements.
 *
 * @param manifoldCad - The `manifold-3d/manifoldCAD` module.
 * @returns Constructors that record the objects they create.
 */
async function trackManifoldHandles(manifoldCad: typeof ManifoldCad): Promise<ManifoldConstructors> {
  const { getManifoldModuleSync } = await import('manifold-3d/lib/wasm.js');
  const asRecord = (value: unknown, label: string): Record<string, unknown> => {
    if (!isRecordObject(value)) {
      throw new TypeError(`manifold-3d ${label} is not an object.`);
    }
    return value;
  };
  // These probes are themselves static-constructor results, so manifold-3d's own registry frees them.
  const prototypes = [
    asRecord(Object.getPrototypeOf(manifoldCad.Manifold.tetrahedron()), 'Manifold prototype'),
    asRecord(Object.getPrototypeOf(manifoldCad.CrossSection.square()), 'CrossSection prototype'),
  ];
  const record = (value: unknown): void => {
    if (
      isNativeHandle(value) &&
      prototypes.some((prototype) => Object.prototype.isPrototypeOf.call(prototype, value))
    ) {
      liveHandles.add(value);
    }
  };
  const track = (result: unknown): unknown => {
    if (Array.isArray(result)) {
      for (const element of result) {
        record(element);
      }
    } else {
      record(result);
    }
    return result;
  };
  const wrapFunctions = (target: Record<string, unknown>, names: readonly string[]): void => {
    for (const name of names) {
      const original = target[name];
      if (name === 'constructor' || !isCallable(original)) {
        continue;
      }
      target[name] = function (this: unknown, ...arguments_: unknown[]) {
        return track(original.apply(this, arguments_));
      };
    }
  };
  for (const prototype of prototypes) {
    wrapFunctions(prototype, Object.getOwnPropertyNames(prototype));
  }
  // The native free functions (`_Cube`, `_Extrude`, `_Revolve`, `_manifoldUnionN`, …) that the JS methods call.
  const wasm = asRecord(getManifoldModuleSync(), 'module');
  wrapFunctions(
    wasm,
    Object.keys(wasm).filter((name) => name.startsWith('_')),
  );
  const tracked = <Constructor extends new (...arguments_: never[]) => unknown>(
    constructor: Constructor,
  ): Constructor =>
    new Proxy(constructor, {
      apply: (target, thisArgument, arguments_: unknown[]) => track(Reflect.apply(target, thisArgument, arguments_)),
      construct: (target, arguments_: unknown[], newTarget) =>
        asRecord(track(Reflect.construct(target, arguments_, newTarget)), 'constructor result'),
    });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
  return { Manifold: tracked(manifoldCad.Manifold), CrossSection: tracked(manifoldCad.CrossSection) };
}

/** Delete every Manifold and CrossSection recorded since the last cleanup that is still allocated. */
function deleteLiveHandles(): void {
  for (const handle of liveHandles) {
    if (!handle.isDeleted()) {
      handle.delete();
    }
  }
  liveHandles.clear();
}

async function registerManifoldModules(services: KernelServices): Promise<Record<string, unknown>> {
  const [manifoldRoot, manifoldCad, gltfNodeModule] = await Promise.all([
    import('manifold-3d'),
    import('manifold-3d/manifoldCAD'),
    import('manifold-3d/lib/gltf-node.js'),
  ]);
  trackedConstructors ??= trackManifoldHandles(manifoldCad);
  const constructors = await trackedConstructors;

  // ManifoldCAD.js stubs GLTFNode (non-tracked) and getGLTFNodes (returns []).
  // These only work in manifold's own bundler which replaces the stubs.
  // Patch with tracked versions from gltf-node.js so side-effect patterns work.
  const patchedManifoldCad = {
    ...manifoldCad,
    ...constructors,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    GLTFNode: gltfNodeModule.GLTFNodeTracked,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    getGLTFNodes: gltfNodeModule.getGLTFNodes,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    resetGLTFNodes: gltfNodeModule.resetGLTFNodes,
    show: recordDebugView(manifoldCad.show),
    only: recordDebugView(manifoldCad.only),
  };

  registerKernelModule(services, {
    name: 'manifold-3d',
    exports: manifoldRoot,
    package: manifoldPackage,
    globalName: 'manifold3d',
  });

  registerKernelModule(services, {
    name: 'manifold-3d/manifoldCAD',
    exports: patchedManifoldCad,
    package: manifoldPackage,
    globalName: 'manifoldCAD',
  });

  return patchedManifoldCad;
}

// =============================================================================
// Module execution helpers
// =============================================================================

function resolveModule(module: unknown): Record<string, unknown> {
  if (!isRecordObject(module)) {
    return {};
  }
  const defaultExport = module['default'];
  // Only unwrap CJS-style wrappers where default.default or default.main is a function.
  // Don't unwrap geometry objects (Manifold, GLTFNode arrays, etc.) that happen to be records.
  if (
    defaultExport &&
    !isCallable(defaultExport) &&
    isRecordObject(defaultExport) &&
    (isCallable(defaultExport['default']) || isCallable(defaultExport['main']))
  ) {
    return defaultExport;
  }

  return module;
}

async function runMain(
  module: Record<string, unknown>,
  parameters: Record<string, unknown>,
  manifoldCadModule: Record<string, unknown>,
): Promise<unknown> {
  const defaultExport = module['default'] ?? module['main'];
  if (!defaultExport) {
    return undefined;
  }

  // Non-function default export (e.g. array of GLTFNode from getGLTFNodes(),
  // or a Manifold object built at module scope). Use it directly as geometry.
  if (!isCallable(defaultExport)) {
    return defaultExport;
  }

  if (defaultExport.length >= 2) {
    return defaultExport(manifoldCadModule, parameters);
  }

  return defaultExport(parameters);
}

// ponytail: one Manifold operation at a time per realm. manifold-3d keeps realm-global live-object and glTF-node
// lists that cleanup empties, so two clients' operations must not interleave; per-client worker threads lift this.
let realmTail: Promise<void> = Promise.resolve();

/** Run `operation` after every earlier Manifold operation in this realm has settled. */
async function exclusive<Value>(operation: () => Promise<Value>): Promise<Value> {
  const previous = realmTail;
  const done = Promise.withResolvers<void>();
  realmTail = done.promise;
  try {
    await previous;
    return await operation();
  } finally {
    done.resolve();
  }
}

async function cleanupManifoldRuntime(): Promise<void> {
  const [
    { cleanup: cleanupGarbageCollector },
    { cleanup: cleanupSceneBuilder },
    { cleanup: cleanupGltfNodes },
    { cleanup: cleanupLevelOfDetail },
  ] = await Promise.all([
    import('manifold-3d/lib/garbage-collector.js'),
    import('manifold-3d/lib/scene-builder.js'),
    import('manifold-3d/lib/gltf-node.js'),
    import('manifold-3d/lib/level-of-detail.js'),
  ]);

  cleanupGarbageCollector();
  // After manifold-3d's registry, which deletes without checking and shares some of these objects.
  deleteLiveHandles();
  cleanupSceneBuilder();
  cleanupGltfNodes();
  cleanupLevelOfDetail();
  debugViewRequested = false;
}

// =============================================================================
// Normals
// =============================================================================

/** Edges whose faces meet at more than this many degrees keep separate normals. */
const normalSmoothingAngle = 30;

const attributeChannels: Readonly<Record<GLTFAttribute, number>> = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  POSITION: 0,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  NORMAL: 3,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  TANGENT: 4,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  TEXCOORD_0: 2,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  TEXCOORD_1: 2,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  COLOR_0: 3,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  JOINTS_0: 4,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  WEIGHTS_0: 4,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  SKIP_1: 1,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  SKIP_2: 2,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  SKIP_3: 3,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantics
  SKIP_4: 4,
};

const skipAttributes = ['SKIP_1', 'SKIP_2', 'SKIP_3', 'SKIP_4'] as const;

/**
 * Give every manifold node normals and label them on every material that
 * governs one of its runs.
 *
 * manifold-3d writes only the property channels a run's material names, and
 * Manifold meshes carry no normals until asked, so a bare `Manifold` exports
 * as `POSITION` alone. `calculateNormals` appends them after any authored
 * properties and splits vertices along creases itself, which keeps
 * `EXT_mesh_manifold` intact. Labels are positional and merged per mesh, so
 * the node material and every `setMaterial` run material receive one list.
 * Nodes whose labels already name `NORMAL`, or disagree with each other, are
 * left as authored.
 */
async function addMissingNormals(nodes: readonly BaseGLTFNode[]): Promise<void> {
  const [gltfNodeModule, { getBackupMaterial, getMaterialByID: getMaterialById, setMaterialByID: setMaterialById }] =
    await Promise.all([import('manifold-3d/lib/gltf-node.js'), import('manifold-3d/lib/material.js')]);
  const scene = new Set<BaseGLTFNode>();
  for (const node of nodes) {
    for (let current: BaseGLTFNode | undefined = node; current; current = current.parent) {
      scene.add(current);
    }
  }

  // Shared sources stay shared, so manifold-3d's per-source node cache behaves as before.
  const withNormals = new Map<Manifold, Manifold>();
  const labelledMaterials = new Map<GLTFMaterial, Map<string, GLTFMaterial>>();
  for (const node of scene) {
    if (!(node instanceof gltfNodeModule.GLTFNode) || node.manifold === undefined) {
      continue;
    }
    const { manifold } = node;
    const material = getBackupMaterial(node);
    const runMaterials = [...new Set(manifold.getMesh().runOriginalID)].flatMap((id) => {
      const runMaterial = getMaterialById(id);
      return runMaterial ? [{ id, runMaterial }] : [];
    });
    const labelLists = [
      material.attributes ?? [],
      ...runMaterials.map(({ runMaterial }) => runMaterial.attributes ?? []),
    ];
    let authored: readonly GLTFAttribute[] = [];
    for (const list of labelLists) {
      if (list.length > authored.length) {
        authored = list;
      }
    }
    if (
      authored.includes('NORMAL') ||
      !labelLists.every((list) => list.every((attribute, index) => authored[index] === attribute))
    ) {
      continue;
    }

    const propertyCount = manifold.numProp();
    const labels: GLTFAttribute[] = [...authored];
    let labelledChannels = 0;
    for (const attribute of authored) {
      labelledChannels += attributeChannels[attribute];
    }
    for (let unlabelled = propertyCount - labelledChannels; unlabelled > 0; unlabelled -= 4) {
      labels.push(skipAttributes[Math.min(unlabelled, 4) - 1] ?? 'SKIP_4');
    }
    labels.push('NORMAL');

    let normalled = withNormals.get(manifold);
    if (!normalled) {
      normalled = manifold.calculateNormals(propertyCount, normalSmoothingAngle);
      withNormals.set(manifold, normalled);
    }
    node.manifold = normalled;

    const variants = labelledMaterials.get(material) ?? new Map<string, GLTFMaterial>();
    labelledMaterials.set(material, variants);
    const key = labels.join(',');
    const nodeMaterial = variants.get(key) ?? { ...material, attributes: labels };
    variants.set(key, nodeMaterial);
    node.material = nodeMaterial;
    for (const { id, runMaterial } of runMaterials) {
      setMaterialById(id, { ...runMaterial, attributes: labels });
    }
  }
}

/**
 * Give planar `CrossSection` meshes their normal.
 *
 * manifold-3d triangulates a cross-section in the `z = 0` plane with a
 * double-sided material and writes `POSITION` only. Every manifold solid has
 * normals by now, so a normal-less triangle primitive lying entirely in that
 * plane is a cross-section, and `+Z` is exact for it.
 */
function addPlanarNormals(document: Document): void {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const positions = position?.getArray();
      if (
        primitive.getMode() !== Primitive.Mode['TRIANGLES'] ||
        primitive.getAttribute('NORMAL') !== null ||
        !position ||
        !positions ||
        !positions.every((value, index) => index % 3 !== 2 || value === 0)
      ) {
        continue;
      }
      const normals = new Float32Array(positions.length);
      for (let index = 2; index < normals.length; index += 3) {
        normals[index] = 1;
      }
      primitive.setAttribute(
        'NORMAL',
        document.createAccessor().setType('VEC3').setArray(normals).setBuffer(position.getBuffer()),
      );
    }
  }
}

/** A model's GLB with the triangles and vertices it draws and its bounding-box diagonal in millimetres. */
type ManifoldMesh = {
  glb: Uint8Array<ArrayBuffer>;
  triangles: number;
  vertices: number;
  diagonal: number;
};

/**
 * Count the triangles and vertices every scene node draws, and measure the scene's bounding-box diagonal.
 *
 * @param document - A written and re-read manifold-3d glTF document.
 * @returns Triangles, vertices and the diagonal in millimetres (`NaN` when the scene has no extent).
 */
function measureDocument(document: Document): Omit<ManifoldMesh, 'glb'> {
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  let triangles = 0;
  let vertices = 0;
  if (!scene) {
    return { triangles, vertices, diagonal: Number.NaN };
  }
  scene.traverse((node) => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (primitive.getMode() !== Primitive.Mode['TRIANGLES']) {
        continue;
      }
      const positions = primitive.getAttribute('POSITION')?.getCount() ?? 0;
      triangles += (primitive.getIndices()?.getCount() ?? positions) / 3;
      vertices += positions;
    }
  });
  // The manifold-3d scene models millimetres under a root `wrapper` node scaled to glTF metres; undo that scale.
  const [rootScale = 1] = scene.listChildren()[0]?.getScale() ?? [];
  const { min, max } = getBounds(scene);
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / Math.abs(rootScale || 1);
  return { triangles, vertices, diagonal: Number.isFinite(diagonal) ? diagonal : Number.NaN };
}

async function createGlbFromManifoldOutput(output: unknown): Promise<ManifoldMesh> {
  const [gltfNodeImport, sceneBuilderImport, gltfIoImport] = await Promise.all([
    import('manifold-3d/lib/gltf-node.js'),
    import('manifold-3d/lib/scene-builder.js'),
    import('manifold-3d/lib/gltf-io.js'),
  ]);

  const toNodeList: unknown = gltfNodeImport.anyToGLTFNodeList;
  if (!isCallable(toNodeList)) {
    throw new TypeError('Manifold anyToGLTFNodeList export must be callable.');
  }
  const rawNodes: unknown = await toNodeList(output);
  if (
    !Array.isArray(rawNodes) ||
    !rawNodes.every((node): node is BaseGLTFNode => node instanceof gltfNodeImport.BaseGLTFNode)
  ) {
    throw new TypeError('Manifold anyToGLTFNodeList() must return glTF nodes.');
  }
  const nodes: BaseGLTFNode[] = rawNodes;
  if (nodes.length === 0) {
    throw new Error('No geometry was returned from the Manifold model.');
  }

  if (!debugViewRequested) {
    await addMissingNormals(nodes);
  }
  const { GLTFNodesToGLTFDoc: createGltfDocument } = sceneBuilderImport;
  const document = await createGltfDocument(nodes);
  addPlanarNormals(document);
  const setupIo: unknown = gltfIoImport.setupIO;
  if (!isCallable(setupIo)) {
    throw new TypeError('Manifold setupIO export must be callable.');
  }
  const configuredIo: unknown = setupIo(new WebIO());
  if (
    !isRecordObject(configuredIo) ||
    !isCallable(configuredIo['writeBinary']) ||
    !isCallable(configuredIo['readBinary'])
  ) {
    throw new TypeError('Manifold setupIO() must return a glTF IO instance.');
  }
  const bytes: unknown = await configuredIo['writeBinary'](document);
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Manifold glTF writer must return Uint8Array bytes.');
  }
  const glb = await normalizeGltfGeometryNames(new Uint8Array(bytes), {
    format: 'glb',
    rewriteLegacyGeneratedShapeNames: true,
    materialNamePolicy: 'clear-generated',
    materialNameSource: 'external-generated',
    sceneNamePolicy: 'clear-generated',
    sceneNameSource: 'external-generated',
  });
  // The manifold-3d writer fills mesh data while writing, so the counts and bounds come from the written GLB.
  const written: unknown = await configuredIo['readBinary'](glb);
  if (!(written instanceof Document)) {
    throw new TypeError('Manifold glTF reader must return a glTF document.');
  }
  return { glb, ...measureDocument(written) };
}

/**
 * Configuration for the Manifold kernel, allowing custom WASM builds for benchmarking or CI.
 * @public
 */
export type ManifoldOptions = {
  /** Override the default Manifold WASM URL for custom builds or benchmarking. */
  wasmUrl?: string;
};

/** What re-running a model at another circular detail needs: its bundle, its parameters and its size. */
type ManifoldProgram = {
  code: string;
  parameters: Record<string, unknown>;
  /** Bounding-box diagonal in millimetres at Manifold's default detail; presets scale with it. */
  diagonal: number;
};

/** The evaluated model at Manifold's default detail, and the program that re-meshes it at another one. */
type ManifoldHandle = {
  glb: Uint8Array<ArrayBuffer>;
  program?: ManifoldProgram;
};

/**
 * Run the model's bundle again with Manifold's circular detail set before `main`, and restore the defaults after.
 * Circular detail is read when a circle, cylinder, sphere or revolve is built, so a different detail needs a new run.
 *
 * @param input - The program, the detail to set, the kernel services and the kernel context.
 * @returns The model's GLB with its counts and diagonal.
 */
async function meshProgram(input: {
  program: ManifoldProgram;
  detail: ManifoldCircularDetail;
  services: KernelServices;
  context: Readonly<{ manifoldCadModule: Record<string, unknown> }>;
}): Promise<ManifoldMesh> {
  const { program, detail, services, context } = input;
  return exclusive(async () => {
    const levelOfDetail = await import('manifold-3d/lib/level-of-detail.js');
    await cleanupManifoldRuntime();
    try {
      levelOfDetail.setMinCircularEdgeLength(detail.linearTolerance);
      levelOfDetail.setMinCircularAngle(detail.angularTolerance);
      if (detail.segments !== undefined) {
        levelOfDetail.setCircularSegments(detail.segments);
      }
      const executeResult = await services.execute(program.code);
      if (!executeResult.success) {
        throw new ManifoldBuildError(executeResult.issues);
      }
      const model = await runMain(resolveModule(executeResult.value), program.parameters, context.manifoldCadModule);
      if (model === undefined || (Array.isArray(model) && model.length === 0)) {
        return { glb: asBuffer(createEmptyGlb()), triangles: 0, vertices: 0, diagonal: Number.NaN };
      }
      return await createGlbFromManifoldOutput(model);
    } catch (error) {
      if (error instanceof ManifoldBuildError) {
        throw error;
      }
      throw new ManifoldBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    } finally {
      await cleanupManifoldRuntime();
    }
  });
}

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const manifoldKernel = defineKernel({
  id: 'manifold',
  extensions: ['ts', 'js'],
  detectImport: manifoldDetectPattern,
  builtinModuleNames: ['manifold-3d', 'manifold-3d/manifoldCAD'],
  builtinPackages: { 'manifold-3d': manifoldPackage },
  name: 'ManifoldKernel',
  version: '1.2.0',
  optionsSchema: manifoldOptionsSchema,
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary', optionsSchema: manifoldRenderSchema } },
  exports: {
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: manifoldExportSchemas.glb,
    },
  },

  async initialize(options, services) {
    initManifoldWasm(options.wasmUrl);
    const manifoldCadModule = await registerManifoldModules(services);
    services.logger.debug('Initialized Manifold kernel with manifold-3d modules');
    return { manifoldCadModule };
  },

  async resolve({ entryPath }, services) {
    return services.bundler.resolveDependencies(entryPath);
  },

  async describe({ entryPath }, services) {
    return exclusive(async () => {
      const relativeFilePath = toVmEntryPath(entryPath);

      try {
        const bundleResult = await services.bundler.bundle(entryPath);
        if (!bundleResult.success) {
          return createKernelError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
        }

        const executeResult = await services.execute(bundleResult.code);
        if (!executeResult.success) {
          return createKernelError(enrichIssueLocation(executeResult.issues, relativeFilePath));
        }

        const module = resolveModule(executeResult.value);
        const defaultParameters = extractDefaultParameters(module);
        const jsonSchema = await jsonSchemaFromJson(defaultParameters);

        return createKernelSuccess({
          parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
            id: 'urn:taucad:manifold:parameters',
            name: 'ManifoldParameters',
          }),
        });
      } catch (error) {
        return createKernelError([
          {
            message: error instanceof Error ? error.message : 'Failed to extract parameters',
            code: 'RUNTIME',
            location: {
              fileName: relativeFilePath,
              startLineNumber: 1,
              startColumn: 1,
            },
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    });
  },

  async evaluate({ entryPath, parameters }, services, context) {
    return exclusive(async () => {
      const relativeFilePath = toVmEntryPath(entryPath);

      await cleanupManifoldRuntime();

      const bundleResult = await services.bundler.bundle(entryPath);
      if (!bundleResult.success) {
        throw new ManifoldBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
      }

      const executeResult = await services.execute(bundleResult.code);
      if (!executeResult.success) {
        throw new ManifoldBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
      }

      const module = resolveModule(executeResult.value);

      let model: unknown;
      try {
        model = await runMain(module, parameters, context.manifoldCadModule);
      } catch (error) {
        const stackFrames = parseStackTrace(error, {
          classifyFrame: createFrameClassifier(),
          sourceMap: bundleResult.sourceMap,
          resolveSourcePath,
          lastEntryName: executeResult.entryUrl,
        });
        const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, resolveSourcePath);
        throw new ManifoldBuildError([
          {
            message: error instanceof Error ? error.message : String(error),
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            stackFrames,
            location,
          },
        ]);
      }

      if (model === undefined || (Array.isArray(model) && model.length === 0)) {
        await cleanupManifoldRuntime();
        services.logger.warn('createGeometry returning empty: main-returned-undefined', {
          data: { filePath: relativeFilePath },
        });
        return { handle: { glb: asBuffer(createEmptyGlb()) } };
      }

      try {
        const { glb, diagonal } = await createGlbFromManifoldOutput(model);
        const handle: ManifoldHandle = { glb, program: { code: bundleResult.code, parameters, diagonal } };
        return { handle };
      } catch (error) {
        const stackFrames = parseStackTrace(error, {
          classifyFrame: createFrameClassifier(),
          sourceMap: bundleResult.sourceMap,
          resolveSourcePath,
          lastEntryName: executeResult.entryUrl,
        });
        const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, resolveSourcePath);
        throw new ManifoldBuildError([
          {
            message: error instanceof Error ? error.message : String(error),
            code: 'RUNTIME',
            type: 'runtime',
            severity: 'error',
            stackFrames,
            location,
          },
        ]);
      } finally {
        await cleanupManifoldRuntime();
      }
    });
  },

  async render({ handle, options }, services, context) {
    const { tessellation } = options;
    const { program } = handle;
    if (program === undefined) {
      return { content: handle.glb };
    }
    const started = performance.now();
    const requested = resolveManifoldTessellation(tessellation, program.diagonal);
    const budget = manifoldTriangleBudgets.preview;
    const { result, effective, downgraded } = await meshWithinManifoldBudget({
      detail: requested,
      budget,
      mesh: async (detail) => meshProgram({ program, detail, services, context }),
    });
    const report: TessellationReport = createManifoldTessellationReport({
      requested,
      effective,
      downgraded,
      triangles: result.triangles,
      vertices: result.vertices,
      elapsed: performance.now() - started,
    });
    const issues =
      downgraded === 0
        ? []
        : [
            createManifoldTessellationDowngradedIssue({
              requested,
              effective,
              downgraded,
              triangles: result.triangles,
              budget,
            }),
          ];
    return { content: result.glb, tessellation: report, issues };
  },

  async export(input, services, context) {
    const { exportId, handle, options } = input;

    if (handle.glb.length === 0) {
      return { files: [createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))] };
    }

    switch (exportId) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- exhaustive switch
      case 'glb': {
        let source = handle.glb;
        if (handle.program) {
          const requested = resolveManifoldTessellation(options.tessellation, handle.program.diagonal);
          const mesh = await meshProgram({ program: handle.program, detail: requested, services, context });
          const budget = manifoldTriangleBudgets.export;
          if (mesh.triangles > budget) {
            throw new ManifoldBuildError([
              createManifoldTessellationBudgetExceededIssue({ requested, triangles: mesh.triangles, budget }),
            ]);
          }
          source = mesh.glb;
        }
        const transformedGlb = await transformGltfExportBytes(source, {
          format: 'glb',
          coordinateSystem: options.coordinateSystem,
          unit: options.unit,
        });
        const glb = await normalizeGltfGeometryNames(transformedGlb, {
          format: 'glb',
          rewriteLegacyGeneratedShapeNames: true,
          materialNamePolicy: 'clear-generated',
          materialNameSource: 'external-generated',
          sceneNamePolicy: 'clear-generated',
          sceneNameSource: 'external-generated',
        });
        return { files: [createExportFile('glb', 'model.glb', asBuffer(glb))] };
      }

      default: {
        const _exhaustive: never = exportId;
        throw new Error(`Export format '${String(_exhaustive)}' is not supported by Manifold. Supported formats: glb.`);
      }
    }
  },

  async onDispose() {
    await exclusive(cleanupManifoldRuntime);
  },

  serializeHandle({ handle }) {
    return { glb: new Uint8Array(handle.glb), ...(handle.program ? { program: { ...handle.program } } : {}) };
  },

  deserializeHandle({ serialized }): ManifoldHandle {
    return {
      glb: new Uint8Array(serialized.glb),
      ...(serialized.program ? { program: { ...serialized.program } } : {}),
    };
  },
});

class ManifoldBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
