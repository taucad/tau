import type { SimplePoint } from 'replicad';
import type * as ReplicadModule from 'replicad';
import type { AxisDeclaration, DatumDeclaration, FaceDeclaration } from '#kernels/replicad/annotations/index.js';
import { isValidAuthoringKey, isValidInterfaceName } from '#kernels/replicad/annotations/index.js';
import type { ResolvedReplicadInterface } from '#kernels/replicad/export/interface-export.js';
import type { InputShape } from '#kernels/replicad/utils/render-output.js';

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
        faces = entry.shape.faces;
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
export const rotateNativeEntryToYup = (entry: NativeHandleEntry): NativeHandleEntry => {
  const rotated = { ...entry, shape: entry.shape.clone().rotate(-90, [0, 0, 0], [1, 0, 0]) };
  return { ...rotated, resolvedInterfaces: rotateResolvedInterfacesToYup(entry.resolvedInterfaces) };
};
