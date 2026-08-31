import { booleanOpDWithPolyTree, ClipType, FillRule, PolyTreeD } from 'clipper2-ts';
import type { PathD, PathsD, PolyPathD } from 'clipper2-ts';
import {
  sanitizeCapMultiPolygon,
  sectionCapClipperDecimalPrecision,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-conversion.js';
import { sectionCapPolygonBooleanError } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  CapPolygonBooleanBackend,
  CapPolygonBooleanBackendInfo,
  SectionCapBooleanResult,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  CapMultiPolygon,
  CapPoint2,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-types.js';

const clipper2TsVersion = '2.0.1-17';

const pathPoint = ([x, y]: CapPoint2): PathD[number] => ({ x, y });

const toClipperPaths = (multiPolygon: CapMultiPolygon): PathsD =>
  sanitizeCapMultiPolygon(multiPolygon).flatMap((polygon) =>
    polygon.map((ring) => ring.map((point) => pathPoint(point))),
  );

// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Clipper's `PolyPathD.poly` returns null for empty paths
const ringFromClipperPath = (path: PathD | null | undefined): CapPoint2[] =>
  (path ?? [])
    .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
    .map(({ x, y }) => [x, y] satisfies CapPoint2);

const collectOuterDescendants = (node: PolyPathD, target: CapMultiPolygon): void => {
  for (let childIndex = 0; childIndex < node.count; childIndex++) {
    const child = node.child(childIndex);
    if (!child.isHole) {
      collectPolyTreePolygon(child, target);
      continue;
    }

    collectOuterDescendants(child, target);
  }
};

const collectPolyTreePolygon = (node: PolyPathD, target: CapMultiPolygon): void => {
  const outer = ringFromClipperPath(node.poly);
  if (outer.length >= 3) {
    const polygon: CapMultiPolygon[number] = [outer];
    for (let childIndex = 0; childIndex < node.count; childIndex++) {
      const child = node.child(childIndex);
      if (child.isHole) {
        const hole = ringFromClipperPath(child.poly);
        if (hole.length >= 3) {
          polygon.push(hole);
        }
      }
    }
    target.push(polygon);
  }

  for (let childIndex = 0; childIndex < node.count; childIndex++) {
    const child = node.child(childIndex);
    if (child.isHole) {
      collectOuterDescendants(child, target);
    }
  }
};

const fromClipperPolyTree = (tree: PolyTreeD): CapMultiPolygon => {
  const multiPolygon: CapMultiPolygon = [];
  collectOuterDescendants(tree, multiPolygon);
  return multiPolygon;
};

const runPolyTreeBoolean = (clipType: ClipType, subject: PathsD, clip?: PathsD): CapMultiPolygon => {
  const tree = new PolyTreeD();
  booleanOpDWithPolyTree(clipType, subject, clip ?? null, tree, FillRule.NonZero, sectionCapClipperDecimalPrecision);
  return fromClipperPolyTree(tree);
};

const emptyResult = (): SectionCapBooleanResult => ({ multiPolygon: [], diagnostics: [] });

const cloneResult = (multiPolygon: CapMultiPolygon): SectionCapBooleanResult => ({
  multiPolygon: sanitizeCapMultiPolygon(multiPolygon),
  diagnostics: [],
});

export const createClipper2TsBackend = (
  infoOverrides: Partial<CapPolygonBooleanBackendInfo> = {},
): CapPolygonBooleanBackend => {
  const info: CapPolygonBooleanBackendInfo = {
    name: 'clipper2-ts',
    version: clipper2TsVersion,
    target: 'js',
    ...infoOverrides,
  };

  return {
    info,
    intersection(first: CapMultiPolygon, second: CapMultiPolygon): SectionCapBooleanResult {
      try {
        const firstPaths = toClipperPaths(first);
        const secondPaths = toClipperPaths(second);
        if (firstPaths.length === 0 || secondPaths.length === 0) {
          return emptyResult();
        }

        return {
          multiPolygon: runPolyTreeBoolean(ClipType.Intersection, firstPaths, secondPaths),
          diagnostics: [],
        };
      } catch (error) {
        return sectionCapPolygonBooleanError('intersection', error);
      }
    },
    union(polygons: readonly CapMultiPolygon[]): SectionCapBooleanResult {
      try {
        const inputs = polygons.map((polygon) => toClipperPaths(polygon)).filter((paths) => paths.length > 0);
        if (inputs.length === 0) {
          return emptyResult();
        }

        return {
          multiPolygon: runPolyTreeBoolean(ClipType.Union, inputs.flat()),
          diagnostics: [],
        };
      } catch (error) {
        return sectionCapPolygonBooleanError('union', error);
      }
    },
    difference(source: CapMultiPolygon, subtractors: readonly CapMultiPolygon[]): SectionCapBooleanResult {
      try {
        const sourcePaths = toClipperPaths(source);
        if (sourcePaths.length === 0) {
          return emptyResult();
        }

        const clipPaths = subtractors.flatMap((multiPolygon) => toClipperPaths(multiPolygon));
        if (clipPaths.length === 0) {
          return cloneResult(source);
        }

        return {
          multiPolygon: runPolyTreeBoolean(ClipType.Difference, sourcePaths, clipPaths),
          diagnostics: [],
        };
      } catch (error) {
        return sectionCapPolygonBooleanError('difference', error);
      }
    },
    dispose(): void {
      // Clipper2-ts is pure JS and holds no external resources.
    },
  };
};
