import createClipper2WasmModule from 'clipper2-wasm/dist/es/clipper2z.js';
import {
  sanitizeCapMultiPolygon,
  sectionCapClipperDecimalPrecision,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-conversion.js';
import { sectionCapPolygonBooleanError } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  ClipType as Clipper2WasmClipType,
  MainModule as Clipper2WasmModule,
  PathD as Clipper2WasmPathD,
  PointD as Clipper2WasmPointD,
  PathsD as Clipper2WasmPathsD,
} from 'clipper2-wasm/dist/clipper2z';
import type {
  CapPolygonBooleanBackend,
  CapPolygonBooleanBackendInfo,
  SectionCapBooleanResult,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  CapMultiPolygon,
  CapPoint2,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const clipper2WasmVersion = '0.4.0';
const ringEpsilon = 1e-8;

type DisposableHandle = Readonly<{
  isDeleted?: () => boolean;
  delete(): void;
}>;

type PreparedWasmPaths = Readonly<{
  paths: Clipper2WasmPathsD;
  handles: DisposableHandle[];
}>;

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

const isNodeRuntime = (): boolean =>
  typeof process !== 'undefined' && typeof process.versions === 'object' && typeof process.versions.node === 'string';

const resolveLocateFilePath = (path: string, wasmUrl: string): string => {
  if (!path.endsWith('.wasm')) {
    return path;
  }

  if (isNodeRuntime() && wasmUrl.startsWith('/@fs/')) {
    return wasmUrl.slice('/@fs'.length);
  }

  return wasmUrl;
};

const disposeHandle = (handle: DisposableHandle | undefined): void => {
  if (!handle) {
    return;
  }

  try {
    if (!handle.isDeleted || !handle.isDeleted()) {
      handle.delete();
    }
  } catch {
    // Embind delete is best-effort during exception cleanup.
  }
};

const disposeHandles = (handles: readonly DisposableHandle[]): void => {
  for (const handle of handles.toReversed()) {
    disposeHandle(handle);
  }
};

const disposePoint = (point: Clipper2WasmPointD | undefined): void => {
  disposeHandle(point);
};

const appendRingToPath = (
  module: Clipper2WasmModule,
  options: Readonly<{
    path: Clipper2WasmPathD;
    ring: readonly CapPoint2[];
    handles: DisposableHandle[];
  }>,
): void => {
  for (const [x, y] of options.ring) {
    const point = new module.PointD(x, y, 0);
    options.handles.push(point);
    options.path.push_back(point);
  }
};

const preparePaths = (module: Clipper2WasmModule, multiPolygon: CapMultiPolygon): PreparedWasmPaths => {
  const paths = new module.PathsD();
  const handles: DisposableHandle[] = [paths];

  for (const polygon of sanitizeCapMultiPolygon(multiPolygon)) {
    for (const ring of polygon) {
      const path = new module.PathD();
      handles.push(path);
      appendRingToPath(module, { path, ring, handles });
      paths.push_back(path);
    }
  }

  return { paths, handles };
};

const preparedIsEmpty = (prepared: PreparedWasmPaths): boolean => prepared.paths.size() === 0;

const ringFromWasmPath = (path: Clipper2WasmPathD): CapPoint2[] => {
  const ring: CapPoint2[] = [];
  for (let index = 0; index < path.size(); index++) {
    const point = path.get(index);
    try {
      const { x, y } = point;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        ring.push([x, y]);
      }
    } finally {
      disposePoint(point);
    }
  }

  return ring;
};

type WindingRing = Readonly<{
  ring: CapPoint2[];
  isPositive: boolean;
  absoluteArea: number;
  bounds: Readonly<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>;
}>;

const signedRingArea = (ring: readonly CapPoint2[]): number => {
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index++) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }

  return twiceArea / 2;
};

const boundsForRing = (ring: readonly CapPoint2[]): WindingRing['bounds'] => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
};

const boundsContainPoint = (bounds: WindingRing['bounds'], point: CapPoint2): boolean =>
  point[0] > bounds.minX + ringEpsilon &&
  point[0] < bounds.maxX - ringEpsilon &&
  point[1] > bounds.minY + ringEpsilon &&
  point[1] < bounds.maxY - ringEpsilon;

const ringContainsPoint = (ring: readonly CapPoint2[], point: CapPoint2): boolean => {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const current = ring[index]!;
    const previous = ring[previousIndex]!;
    const crossesRay =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0];

    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
};

const assignHolesToOuters = (outers: readonly WindingRing[], holes: readonly WindingRing[]): CapMultiPolygon => {
  const polygons = outers.map((outer) => [outer.ring] satisfies CapMultiPolygon[number]);

  for (const hole of holes) {
    const representative = hole.ring[0];
    if (!representative) {
      continue;
    }

    let parentIndex: number | undefined;
    let parentArea = Infinity;
    for (const [outerIndex, outer] of outers.entries()) {
      if (outer.absoluteArea <= hole.absoluteArea || !boundsContainPoint(outer.bounds, representative)) {
        continue;
      }

      if (!ringContainsPoint(outer.ring, representative)) {
        continue;
      }

      if (outer.absoluteArea < parentArea) {
        parentIndex = outerIndex;
        parentArea = outer.absoluteArea;
      }
    }

    if (parentIndex !== undefined) {
      polygons[parentIndex]!.push(hole.ring);
    }
  }

  return polygons;
};

const fromWasmPaths = (
  paths: Clipper2WasmPathsD,
  isPositivePath: (path: Clipper2WasmPathD) => boolean,
): CapMultiPolygon => {
  const rings: WindingRing[] = [];

  for (let index = 0; index < paths.size(); index++) {
    const path = paths.get(index);
    try {
      const ring = ringFromWasmPath(path);
      if (ring.length < 3) {
        continue;
      }

      const area = Math.abs(signedRingArea(ring));
      if (area <= ringEpsilon * ringEpsilon) {
        continue;
      }

      rings.push({
        ring,
        isPositive: isPositivePath(path),
        absoluteArea: area,
        bounds: boundsForRing(ring),
      });
    } finally {
      disposeHandle(path);
    }
  }

  const outers = rings.filter((ring) => ring.isPositive);
  if (outers.length === 0) {
    return rings.map((ring) => [ring.ring]);
  }

  return assignHolesToOuters(
    outers,
    rings.filter((ring) => !ring.isPositive),
  );
};

const emptyResult = (): SectionCapBooleanResult => ({ multiPolygon: [], diagnostics: [] });

const cloneResult = (multiPolygon: CapMultiPolygon): SectionCapBooleanResult => ({
  multiPolygon: sanitizeCapMultiPolygon(multiPolygon),
  diagnostics: [],
});

const mergeInputMultiPolygons = (polygons: readonly CapMultiPolygon[]): CapMultiPolygon => {
  const merged: CapMultiPolygon = [];
  for (const multiPolygon of polygons) {
    merged.push(...multiPolygon);
  }

  return merged;
};

type CreateClipper2WasmBackendOptions = Readonly<{
  createModule?: typeof createClipper2WasmModule;
  wasmUrl?: string;
}>;

export const createClipper2WasmBackend = async (
  options: CreateClipper2WasmBackendOptions = {},
): Promise<CapPolygonBooleanBackend> => {
  const initStartedAt = now();
  const moduleFactory = options.createModule ?? createClipper2WasmModule;
  const module = await moduleFactory(
    options.wasmUrl
      ? {
          locateFile(path: string): string {
            return resolveLocateFilePath(path, options.wasmUrl!);
          },
        }
      : undefined,
  );
  const initializationTime = now() - initStartedAt;
  const info: CapPolygonBooleanBackendInfo = {
    name: 'clipper2-wasm',
    version: clipper2WasmVersion,
    target: 'wasm',
    initializationTime,
  };

  const isPositivePath = module.IsPositiveD.bind(module);
  const booleanOpD = module.BooleanOpD.bind(module);
  const runPathsBoolean = (
    clipType: Clipper2WasmClipType,
    subjects: Clipper2WasmPathsD,
    clips?: Clipper2WasmPathsD,
  ): CapMultiPolygon => {
    const emptyClips = clips ? undefined : new module.PathsD();
    let solution: Clipper2WasmPathsD | undefined;
    try {
      solution = booleanOpD(
        clipType,
        module.FillRule.NonZero,
        subjects,
        clips ?? emptyClips!,
        sectionCapClipperDecimalPrecision,
      );
      return fromWasmPaths(solution, isPositivePath);
    } finally {
      disposeHandle(solution);
      disposeHandle(emptyClips);
    }
  };

  return {
    info,
    intersection(first: CapMultiPolygon, second: CapMultiPolygon): SectionCapBooleanResult {
      const firstPrepared = preparePaths(module, first);
      const secondPrepared = preparePaths(module, second);
      try {
        if (preparedIsEmpty(firstPrepared) || preparedIsEmpty(secondPrepared)) {
          return emptyResult();
        }

        const multiPolygon = runPathsBoolean(module.ClipType.Intersection, firstPrepared.paths, secondPrepared.paths);
        return { multiPolygon, diagnostics: [] };
      } catch (error) {
        return sectionCapPolygonBooleanError('intersection', error);
      } finally {
        disposeHandles(firstPrepared.handles);
        disposeHandles(secondPrepared.handles);
      }
    },
    union(polygons: readonly CapMultiPolygon[]): SectionCapBooleanResult {
      const preparedInputs = preparePaths(module, mergeInputMultiPolygons(polygons));
      try {
        if (preparedIsEmpty(preparedInputs)) {
          return emptyResult();
        }

        return {
          multiPolygon: runPathsBoolean(module.ClipType.Union, preparedInputs.paths),
          diagnostics: [],
        };
      } catch (error) {
        return sectionCapPolygonBooleanError('union', error);
      } finally {
        disposeHandles(preparedInputs.handles);
      }
    },
    difference(source: CapMultiPolygon, subtractors: readonly CapMultiPolygon[]): SectionCapBooleanResult {
      const sourcePrepared = preparePaths(module, source);
      const clipPrepared = preparePaths(module, subtractors.flat());
      try {
        if (preparedIsEmpty(sourcePrepared)) {
          return emptyResult();
        }

        if (preparedIsEmpty(clipPrepared)) {
          return cloneResult(source);
        }

        const multiPolygon = runPathsBoolean(module.ClipType.Difference, sourcePrepared.paths, clipPrepared.paths);
        return { multiPolygon, diagnostics: [] };
      } catch (error) {
        return sectionCapPolygonBooleanError('difference', error);
      } finally {
        disposeHandles(sourcePrepared.handles);
        disposeHandles(clipPrepared.handles);
      }
    },
    dispose(): void {
      // The Emscripten module is intentionally kept alive for the worker lifetime.
    },
  };
};
