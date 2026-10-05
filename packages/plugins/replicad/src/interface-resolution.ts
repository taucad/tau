import type { AnyShape, SimplePoint } from 'replicad';
import type * as ReplicadModule from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import { isValidAuthoringKey, isValidInterfaceName } from '#annotations/index.js';
import type { AxisDeclaration, DatumDeclaration, FaceDeclaration } from '#annotations/index.js';

import type { ResolvedReplicadInterface } from '#export/interface-export.js';
import type { InputShape } from '#utils/render-output.js';
import { formatComponentId, formatNamedComponentId, uniqueComponentId, resolveShapeName } from '@taucad/geometry-core';
import type { ComposeHandlesInput } from '@taucad/runtime/kernel';

type ReplicadLibrary = typeof ReplicadModule;
type ReplicadFace = ReplicadModule.Face;
type ReplicadVector = ReplicadModule.Vector;
type FaceLikeDeclaration = FaceDeclaration | AxisDeclaration;
type ResolvedFaceLikeInterface = Extract<ResolvedReplicadInterface, { kind: FaceLikeDeclaration['kind'] }>;
type ResolvedDatumInterface = Extract<ResolvedReplicadInterface, { kind: 'datum' }>;
type InterfaceName = ResolvedReplicadInterface['name'];
type DatumVector = DatumDeclaration['xAxis'];

const unnamedEntryName = 'unnamed';
type EntryName = NonNullable<InputShape['name']> | typeof unnamedEntryName;

/** Live Replicad handle entry with author declarations and resolved STEP interface evidence. */
export type NativeHandleEntry = InputShape & {
  resolvedInterfaces?: ResolvedReplicadInterface[];
  publishedOccurrencePath?: readonly string[];
};

/** Mint the producer binding once from normalized native entries; render and serialization consume these stored IDs. @internal */
export const bindSourceComponentIds = (entries: readonly NativeHandleEntry[]): NativeHandleEntry[] => {
  const used = new Map<string, number>();
  return entries.map((entry, index) => ({
    ...entry,
    sourceComponentId: uniqueComponentId(
      formatNamedComponentId(resolveShapeName({ index, name: entry.name, source: 'authored' }), index) ??
        formatComponentId(index),
      used,
    ),
  }));
};

type BoundOccurrence = ComposeHandlesInput<{
  shapes: readonly NativeHandleEntry[];
  componentIdentityVersion?: 1;
}>['occurrences'][number];
/** Prove complete unique display/native set correspondence before placing any restored native entry. @internal */
export const resolvePublishedComponentBindings = (
  occurrence: BoundOccurrence,
): Array<{
  entry: NativeHandleEntry;
  placement: NonNullable<BoundOccurrence['components']>[number];
}> => {
  const { handle, components, displaySourceComponentIds } = occurrence;
  if (handle.componentIdentityVersion !== 1 || !components || !displaySourceComponentIds) {
    throw new TypeError('Pinned component pose requires a codec-v2 stored native identity binding.');
  }
  const nativeIds = handle.shapes.map(({ sourceComponentId }) => sourceComponentId);
  const nativeSet = new Set(nativeIds);
  const displaySet = new Set(displaySourceComponentIds);
  if (
    nativeSet.size !== nativeIds.length ||
    displaySet.size !== displaySourceComponentIds.length ||
    nativeIds.some((id) => typeof id !== 'string' || id.length === 0) ||
    nativeSet.size !== displaySet.size ||
    displaySourceComponentIds.some((id) => !nativeSet.has(id))
  ) {
    throw new TypeError('Pinned display/native source component sets must be uniquely identical.');
  }
  const sourceIds = components.map(({ sourceComponentId }) => sourceComponentId);
  const canonicalIds = components.map(({ componentId }) => componentId);
  if (
    sourceIds.length !== displaySet.size ||
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(canonicalIds).size !== canonicalIds.length ||
    canonicalIds.some((id) => id.length === 0) ||
    sourceIds.some((id) => !displaySet.has(id))
  ) {
    throw new TypeError('Pinned canonical component placement mapping is incomplete or ambiguous.');
  }
  const bySource = new Map(components.map((placement) => [placement.sourceComponentId, placement]));
  return handle.shapes.map((entry) => ({ entry, placement: bySource.get(entry.sourceComponentId!)! }));
};

const axisSurfaceTypes: ReadonlySet<ReplicadModule.SurfaceType> = new Set<ReplicadModule.SurfaceType>([
  'CYLINDRE',
  'CONE',
]);

const r6 = (n: number): number => {
  const value = Math.round(n * 1e6) / 1e6;
  return value === 0 ? 0 : value;
};

const describeFaceCandidates = (faces: readonly ReplicadFace[]): string =>
  faces
    .slice(0, 8)
    .map(
      (face) =>
        `${face.geomType} @ [${face.center
          .toTuple()
          .map((coordinate) => r6(coordinate))
          .join(', ')}]`,
    )
    .join('; ') + (faces.length > 8 ? `; ... ${faces.length - 8} more` : '');

/**
 * Per-entry face-query context. Replicad's `FaceFinder.find(shape)` re-lists
 * `shape.faces` (a TopExp walk with O(n²) IsSame dedup) and recomputes face
 * facts for every query, which dominated cold STEP export on entries with
 * dozens of interface declarations. The context lists faces once per entry
 * and memoizes the deterministic per-face facts finder filters read
 * (`geomType`, `center`, no-argument `normalAt`), so each OCCT computation
 * runs at most once per face while every filter observes the same values in
 * the same order as an uncached run.
 */
type EntryFaceQueries = {
  listFaces: () => readonly ReplicadFace[];
  createFinder: () => ReplicadModule.FaceFinder;
};

const memoizeInstanceGetter = (face: ReplicadFace, key: 'geomType' | 'center'): void => {
  const facePrototype: unknown = Object.getPrototypeOf(face);
  const prototypeGetter = Object.getOwnPropertyDescriptor(facePrototype as Record<string, unknown>, key)?.get;
  if (!prototypeGetter) {
    return;
  }

  Object.defineProperty(face, key, {
    configurable: true,
    get(): unknown {
      const value: unknown = prototypeGetter.call(face);
      Object.defineProperty(face, key, { configurable: true, value });
      return value;
    },
  });
};

const memoizeDefaultNormal = (face: ReplicadFace): void => {
  const computeNormalAt = face.normalAt.bind(face);
  let defaultNormal: ReplicadVector | undefined;
  face.normalAt = (locationVector?: Parameters<ReplicadFace['normalAt']>[0]): ReplicadVector => {
    if (locationVector) {
      return computeNormalAt(locationVector);
    }

    defaultNormal ??= computeNormalAt();
    return defaultNormal;
  };
};

const createEntryFaceQueries = (entry: InputShape, replicadLibrary: ReplicadLibrary): EntryFaceQueries => {
  const { shape } = entry;
  if (shape instanceof replicadLibrary.MeshShape) {
    throw new TypeError('GeoSpec face interfaces require a native BRep shape.');
  }
  class LazyNormalFaceFinder extends replicadLibrary.FaceFinder {
    // Same filters, same order, same values as the base implementation; the
    // normal is just computed on first read instead of eagerly per face.
    public override shouldKeep(element: ReplicadFace): boolean {
      let defaultNormal: ReplicadVector | undefined;
      const filterInput = {
        element,
        get normal(): ReplicadVector {
          defaultNormal ??= element.normalAt();
          return defaultNormal;
        },
      };
      return this.filters.every((filter) => filter(filterInput));
    }
  }

  let faces: readonly ReplicadFace[] | undefined;
  return {
    createFinder: () => new LazyNormalFaceFinder(),
    listFaces: () => {
      if (!faces) {
        faces = shape.faces;
        for (const face of faces) {
          memoizeInstanceGetter(face, 'geomType');
          memoizeInstanceGetter(face, 'center');
          memoizeDefaultNormal(face);
        }
      }
      return faces;
    },
  };
};

const validateDatumFrame = ({
  interfaceName,
  entryName,
  xAxis,
  zAxis,
}: {
  interfaceName: InterfaceName;
  entryName: EntryName;
  xAxis: DatumVector;
  zAxis: DatumVector;
}): void => {
  const norm = (value: DatumVector): number => Math.hypot(value[0], value[1], value[2]);
  const dot = xAxis[0] * zAxis[0] + xAxis[1] * zAxis[1] + xAxis[2] * zAxis[2];
  if (Math.abs(norm(xAxis) - 1) <= 1e-6 && Math.abs(norm(zAxis) - 1) <= 1e-6 && Math.abs(dot) <= 1e-6) {
    return;
  }

  throw new Error(
    `GeoSpec interface '${interfaceName}' on entry '${entryName}': datum axes must be orthonormal unit ` +
      `vectors within 1e-6 (|xAxis|=${norm(xAxis)}, |zAxis|=${norm(zAxis)}, xAxis.dot(zAxis)=${dot})`,
  );
};

const findFaceIndex = ({
  entryName,
  interfaceName,
  faces,
  face,
}: {
  entryName: EntryName;
  interfaceName: InterfaceName;
  faces: readonly ReplicadFace[];
  face: ReplicadFace;
}): number => {
  // `face` comes from `faces`, whose listing dedups by IsSame, so identity
  // lookup matches a fresh `shape.faces.findIndex(isSame)` scan.
  const index = faces.indexOf(face);
  if (index !== -1) {
    return index;
  }

  throw new Error(
    `GeoSpec interface '${interfaceName}' on entry '${entryName}': resolved face is not part of the entry shape`,
  );
};

const resolveSingleFaceInterface = ({
  entryName,
  interfaceName,
  declaration,
  queries,
}: {
  entryName: EntryName;
  interfaceName: InterfaceName;
  declaration: FaceLikeDeclaration;
  queries: EntryFaceQueries;
}): ResolvedFaceLikeInterface => {
  const finder = declaration.select(queries.createFinder());
  const faces = queries.listFaces();
  // Equivalent to `finder.find(shape)` (find lists shape.faces and filters
  // with shouldKeep); reusing the per-entry listing skips the re-walk per query.
  const candidates = faces.filter((face) => finder.shouldKeep(face));

  if (candidates.length !== 1) {
    const facts = candidates.length > 0 ? `; candidates: ${describeFaceCandidates(candidates)}` : '';
    throw new Error(
      `GeoSpec interface '${interfaceName}' on entry '${entryName}': face finder matched ` +
        `${candidates.length} faces, expected exactly 1${facts}`,
    );
  }

  const face = candidates[0]!;
  if (declaration.kind === 'axis' && !axisSurfaceTypes.has(face.geomType)) {
    throw new Error(
      `GeoSpec interface '${interfaceName}' on entry '${entryName}': axis() requires a cylindrical or ` +
        `conical face, but the resolved face is ${face.geomType} @ [` +
        `${face.center
          .toTuple()
          .map((coordinate) => r6(coordinate))
          .join(', ')}]`,
    );
  }

  return {
    kind: declaration.kind,
    name: interfaceName,
    faceIndex: findFaceIndex({ entryName, interfaceName, faces, face }),
  };
};

/**
 * Resolve author-facing GeoSpec interface declarations while Replicad faces are still live.
 *
 * @param entry - Render-output shape entry returned from user code.
 * @param replicadLibrary - Live Replicad module used to construct `FaceFinder`.
 * @returns Native handle entry carrying resolved STEP interface evidence.
 */
export const resolveEntryInterfaces = (entry: InputShape, replicadLibrary: ReplicadLibrary): NativeHandleEntry => {
  const { interfaces, ...rest } = entry;
  if (!interfaces) {
    return rest;
  }

  const entryName: EntryName = entry.name ?? unnamedEntryName;
  const queries = createEntryFaceQueries(entry, replicadLibrary);
  const resolvedInterfaces: ResolvedReplicadInterface[] = [];
  const resolveFaceLike = (name: InterfaceName, declaration: FaceLikeDeclaration): void => {
    resolvedInterfaces.push(resolveSingleFaceInterface({ entryName, interfaceName: name, declaration, queries }));
  };

  for (const [key, declaration] of Object.entries(interfaces)) {
    if (!isValidAuthoringKey(key)) {
      const reason = isValidInterfaceName(key)
        ? 'authoring keys are index-free; indices come only from group() membership'
        : 'it does not match the GeoSpec interface-name grammar';
      throw new Error(`GeoSpec interface key '${key}' on entry '${entryName}' is invalid: ${reason}`);
    }

    switch (declaration.kind) {
      case 'face':
      case 'axis': {
        resolveFaceLike(key, declaration);
        break;
      }
      case 'group': {
        for (const [index, member] of declaration.members.entries()) {
          resolveFaceLike(`${key}[${index + 1}]`, member);
        }
        break;
      }
      case 'datum': {
        validateDatumFrame({
          interfaceName: key,
          entryName,
          xAxis: declaration.xAxis,
          zAxis: declaration.zAxis,
        });
        resolvedInterfaces.push({
          kind: 'datum',
          name: key,
          origin: declaration.origin,
          xAxis: declaration.xAxis,
          zAxis: declaration.zAxis,
        });
        break;
      }
    }
  }

  return resolvedInterfaces.length > 0 ? { ...rest, interfaces, resolvedInterfaces } : rest;
};

const rotatePointToYup = (value: SimplePoint): SimplePoint => [value[0], value[2], -value[1]];

const rotateDatumInterfaceToYup = (entry: ResolvedDatumInterface): ResolvedDatumInterface => ({
  ...entry,
  origin: rotatePointToYup(entry.origin),
  xAxis: rotatePointToYup(entry.xAxis),
  zAxis: rotatePointToYup(entry.zAxis),
});

const rotateResolvedInterfacesToYup = (
  interfaces: readonly ResolvedReplicadInterface[] | undefined,
): ResolvedReplicadInterface[] | undefined =>
  interfaces?.map((entry) => (entry.kind === 'datum' ? rotateDatumInterfaceToYup(entry) : entry));

/**
 * Rotate a STEP export entry and datum interface vectors from z-up source coordinates to y-up output coordinates.
 *
 * @param entry - Native handle entry to rotate for STEP export.
 * @returns Rotated native handle entry with matching resolved datum vectors.
 */
export const rotateNativeEntryToYup = (
  entry: NativeHandleEntry & { shape: AnyShape },
): NativeHandleEntry & { shape: AnyShape } => {
  // The input has already passed the BRep guard; Replicad's rotate declaration still widens the result to MeshShape.
  const rotated = { ...entry, shape: entry.shape.clone().rotate(-90, [0, 0, 0], [1, 0, 0]) as AnyShape };
  return { ...rotated, resolvedInterfaces: rotateResolvedInterfacesToYup(entry.resolvedInterfaces) };
};

const placementTolerance = 1e-7;
const nearly = (value: number, expected: number): boolean => Math.abs(value - expected) <= placementTolerance;

/**
 * Place one restored BRep entry from the assembly's world-metre matrix into Replicad's native millimetres.
 * The current exact STEP route admits rigid, orientation-preserving placements only.
 * @param input - Restored native entry, metre placement, occurrence path and selected implementation.
 * @returns A transformed native entry with occurrence-qualified name and datums.
 */
export const placePublishedEntry = ({
  entry,
  worldTransform,
  occurrencePath,
  componentId,
  library,
  oc,
}: {
  entry: NativeHandleEntry;
  worldTransform: readonly number[];
  occurrencePath: readonly string[];
  componentId?: string;
  library: ReplicadLibrary;
  oc: OpenCascadeInstance;
}): NativeHandleEntry & { shape: AnyShape } => {
  const path = occurrencePath.map((id) => encodeURIComponent(id)).join('/') || '<root>';
  if (!(entry.shape instanceof library.Shape)) {
    throw new TypeError(`Pinned STEP occurrence '${path}' requires native BRep geometry.`);
  }
  const m = worldTransform;
  if (
    m.length !== 16 ||
    m.some((value) => !Number.isFinite(value)) ||
    m[3] !== 0 ||
    m[7] !== 0 ||
    m[11] !== 0 ||
    m[15] !== 1
  ) {
    throw new TypeError(`Pinned STEP occurrence '${path}' has an invalid world transform.`);
  }
  const x: SimplePoint = [m[0]!, m[1]!, m[2]!];
  const y: SimplePoint = [m[4]!, m[5]!, m[6]!];
  const z: SimplePoint = [m[8]!, m[9]!, m[10]!];
  const dot = (left: SimplePoint, right: SimplePoint): number =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  const cross: SimplePoint = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  if (
    ![x, y, z].every((axis) => nearly(dot(axis, axis), 1)) ||
    !nearly(dot(x, y), 0) ||
    !nearly(dot(x, z), 0) ||
    !nearly(dot(y, z), 0) ||
    !nearly(dot(cross, z), 1)
  ) {
    throw new TypeError(`Pinned STEP occurrence '${path}' requires a rigid, non-reflected placement.`);
  }
  // Published placement is Y-up/metres; the admitted BRep and STEP default are Z-up/millimetres.
  // Conjugate the rotation by the existing Z-up→Y-up display basis before touching native geometry.
  const toDisplay = ([a, b, c]: SimplePoint): SimplePoint => [a, c, -b];
  const toNative = ([a, b, c]: SimplePoint): SimplePoint => [a, -c, b];
  const worldRotate = (value: SimplePoint): SimplePoint => [
    dot([m[0]!, m[4]!, m[8]!], value),
    dot([m[1]!, m[5]!, m[9]!], value),
    dot([m[2]!, m[6]!, m[10]!], value),
  ];
  const translation = toNative([m[12]! * 1000, m[13]! * 1000, m[14]! * 1000]);
  const zero = (value: number): number => (Object.is(value, -0) ? 0 : value);
  const project = (value: SimplePoint, point: boolean): SimplePoint => {
    const rotated = toNative(worldRotate(toDisplay(value)));
    const placed: SimplePoint = point
      ? [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]]
      : rotated;
    return [zero(placed[0]), zero(placed[1]), zero(placed[2])];
  };
  const basisX = project([1, 0, 0], false);
  const basisY = project([0, 1, 0], false);
  const basisZ = project([0, 0, 1], false);
  // oxlint-disable-next-line eslint/new-cap -- OCCT's generated C++ binding names this constructor gp_Trsf.
  const transform = new oc.gp_Trsf();
  try {
    // oxlint-disable-next-line eslint/new-cap -- OCCT's generated C++ binding names this method SetValues.
    transform.SetValues(
      basisX[0],
      basisY[0],
      basisZ[0],
      translation[0],
      basisX[1],
      basisY[1],
      basisZ[1],
      translation[1],
      basisX[2],
      basisY[2],
      basisZ[2],
      translation[2],
    );
    // oxlint-disable-next-line eslint/new-cap -- OCCT's generated C++ binding names this constructor BRepBuilderAPI_Transform.
    const builder = new oc.BRepBuilderAPI_Transform(entry.shape.wrapped, transform, false, false);
    try {
      return {
        ...entry,
        // oxlint-disable-next-line eslint/new-cap -- OCCT's generated C++ binding names this accessor Shape.
        shape: library.cast(builder.Shape()),
        name: componentId ?? `${path}/${encodeURIComponent(entry.name ?? 'Shape')}`,
        publishedOccurrencePath: [...occurrencePath],
        resolvedInterfaces: entry.resolvedInterfaces?.map((item) =>
          item.kind === 'datum'
            ? {
                ...item,
                origin: project(item.origin, true),
                xAxis: project(item.xAxis, false),
                zAxis: project(item.zAxis, false),
              }
            : { ...item },
        ),
      };
    } finally {
      builder.delete();
    }
  } finally {
    transform.delete();
  }
};
