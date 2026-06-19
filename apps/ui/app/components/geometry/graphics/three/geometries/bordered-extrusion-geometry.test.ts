import { describe, expect, it } from 'vitest';
import type { BufferAttribute, BufferGeometry } from 'three';
import { Color, Vector2 } from 'three';
import translationArrowSvg from '#components/geometry/graphics/three/icons/translation-arrow.svg?raw';
import rotationArrowSvg from '#components/geometry/graphics/three/icons/rotation-arrow.svg?raw';
import {
  createBorderedExtrusionGeometry,
  createBorderedRoundedRectangleGeometry,
  createBorderedSvgGeometry,
  getBorderedExtrusionUserData,
  setBorderedExtrusionRegionColor,
} from '#components/geometry/graphics/three/geometries/bordered-extrusion-geometry.js';

function triangleSignatures({
  geometry,
  vertexStart,
  vertexCount,
}: {
  readonly geometry: BufferGeometry;
  readonly vertexStart: number;
  readonly vertexCount: number;
}): Set<string> {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const signatures = new Set<string>();

  for (let index = vertexStart; index < vertexStart + vertexCount; index += 3) {
    const vertices = [0, 1, 2]
      .map((offset) => {
        const vertexIndex = index + offset;
        return [
          position.getX(vertexIndex).toFixed(6),
          position.getY(vertexIndex).toFixed(6),
          position.getZ(vertexIndex).toFixed(6),
        ].join(',');
      })
      .sort();
    signatures.add(vertices.join('|'));
  }

  return signatures;
}

function countSideWallTriangles({
  geometry,
  vertexStart,
  vertexCount,
}: {
  readonly geometry: BufferGeometry;
  readonly vertexStart: number;
  readonly vertexCount: number;
}): number {
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  let count = 0;

  for (let index = vertexStart; index < vertexStart + vertexCount; index += 3) {
    const zMagnitude =
      (Math.abs(normal.getZ(index)) + Math.abs(normal.getZ(index + 1)) + Math.abs(normal.getZ(index + 2))) / 3;

    if (zMagnitude < 0.5) {
      count++;
    }
  }

  return count;
}

function countBadWindingTriangles(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute;
  let count = 0;

  for (let index = 0; index < position.count; index += 3) {
    const ax = position.getX(index);
    const ay = position.getY(index);
    const az = position.getZ(index);
    const bx = position.getX(index + 1);
    const by = position.getY(index + 1);
    const bz = position.getZ(index + 1);
    const cx = position.getX(index + 2);
    const cy = position.getY(index + 2);
    const cz = position.getZ(index + 2);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const faceX = uy * vz - uz * vy;
    const faceY = uz * vx - ux * vz;
    const faceZ = ux * vy - uy * vx;
    const dot = faceX * normal.getX(index) + faceY * normal.getY(index) + faceZ * normal.getZ(index);

    if (dot < 0) {
      count++;
    }
  }

  return count;
}

function getRegionBounds({
  geometry,
  vertexStart,
  vertexCount,
}: {
  readonly geometry: BufferGeometry;
  readonly vertexStart: number;
  readonly vertexCount: number;
}): { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number } {
  const position = geometry.getAttribute('position') as BufferAttribute;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let index = vertexStart; index < vertexStart + vertexCount; index++) {
    minX = Math.min(minX, position.getX(index));
    maxX = Math.max(maxX, position.getX(index));
    minY = Math.min(minY, position.getY(index));
    maxY = Math.max(maxY, position.getY(index));
  }

  return { minX, maxX, minY, maxY };
}

function expectSingleVertexColoredGeometry(geometry: BufferGeometry): void {
  const userData = getBorderedExtrusionUserData(geometry);
  expect(geometry.index).toBeNull();
  expect(geometry.groups).toHaveLength(0);
  expect(geometry.getAttribute('position')).toBeDefined();
  expect(geometry.getAttribute('normal')).toBeDefined();
  expect(geometry.getAttribute('uv')).toBeDefined();
  expect(geometry.getAttribute('color')).toBeDefined();
  expect(userData?.controlRegions.border.vertexCount).toBeGreaterThan(0);
  expect(userData?.controlRegions.core.vertexCount).toBeGreaterThan(0);
}

describe('createBorderedExtrusionGeometry', () => {
  it('should emit one vertex-colored geometry with stable border and core ranges', () => {
    const geometry = createBorderedExtrusionGeometry({
      outerContour: [new Vector2(-1, -1), new Vector2(1, -1), new Vector2(1, 1), new Vector2(-1, 1)],
      depth: 0.2,
      borderWidth: 0.2,
      borderColor: '#ef4444',
      coreColor: '#ffffff',
    });
    const userData = getBorderedExtrusionUserData(geometry);

    expectSingleVertexColoredGeometry(geometry);
    expect(userData?.controlRegions.border.vertexStart).toBe(0);
    expect(userData?.controlRegions.core.vertexStart).toBe(userData?.controlRegions.border.vertexCount);
  });

  it('should not emit duplicate cross-region triangles that can z-fight', () => {
    const geometry = createBorderedRoundedRectangleGeometry({
      width: 1,
      height: 1,
      radius: 0.1,
      smoothness: 8,
      depth: 0.02,
      borderWidth: 0.06,
      borderColor: '#22c55e',
      coreColor: '#ffffff',
    });
    const userData = getBorderedExtrusionUserData(geometry)!;
    const borderTriangles = triangleSignatures({ geometry, ...userData.controlRegions.border });
    const coreTriangles = triangleSignatures({ geometry, ...userData.controlRegions.core });
    const overlap = [...borderTriangles].filter((signature) => coreTriangles.has(signature));

    expect(overlap).toEqual([]);
  });

  it('should emit cap-only core regions and preserve the halved selector border ratio', () => {
    const geometry = createBorderedRoundedRectangleGeometry({
      width: 1,
      height: 1,
      radius: 0.1,
      smoothness: 16,
      depth: 0.02,
      borderWidth: 0.06,
      borderColor: '#22c55e',
      coreColor: '#ffffff',
    });
    const userData = getBorderedExtrusionUserData(geometry)!;
    const coreBounds = getRegionBounds({ geometry, ...userData.controlRegions.core });
    const borderWidthX = 0.5 - coreBounds.maxX;
    const borderWidthY = 0.5 - coreBounds.maxY;
    const position = geometry.getAttribute('position') as BufferAttribute;
    let squareCornerVertices = 0;

    for (
      let index = userData.controlRegions.core.vertexStart;
      index < userData.controlRegions.core.vertexStart + userData.controlRegions.core.vertexCount;
      index++
    ) {
      if (
        Math.abs(position.getX(index) - coreBounds.maxX) < 1e-6 &&
        Math.abs(position.getY(index) - coreBounds.maxY) < 1e-6
      ) {
        squareCornerVertices++;
      }
    }

    expect(countSideWallTriangles({ geometry, ...userData.controlRegions.core })).toBe(0);
    expect(borderWidthX).toBeCloseTo(0.06, 5);
    expect(borderWidthY).toBeCloseTo(0.06, 5);
    expect(squareCornerVertices).toBe(0);
  });

  it('should update only the requested color region', () => {
    const geometry = createBorderedRoundedRectangleGeometry({
      width: 1,
      height: 1,
      radius: 0.1,
      smoothness: 4,
      depth: 0.02,
      borderWidth: 0.06,
      borderColor: '#22c55e',
      coreColor: '#ffffff',
    });
    const userData = getBorderedExtrusionUserData(geometry)!;
    const color = geometry.getAttribute('color') as BufferAttribute;
    const coreBefore = new Color(
      color.getX(userData.controlRegions.core.vertexStart),
      color.getY(userData.controlRegions.core.vertexStart),
      color.getZ(userData.controlRegions.core.vertexStart),
    );

    setBorderedExtrusionRegionColor({ geometry, region: 'border', color: '#3b82f6' });

    const borderAfter = new Color(color.getX(0), color.getY(0), color.getZ(0));
    const coreAfter = new Color(
      color.getX(userData.controlRegions.core.vertexStart),
      color.getY(userData.controlRegions.core.vertexStart),
      color.getZ(userData.controlRegions.core.vertexStart),
    );
    expect(borderAfter.getHexString()).toBe('3b82f6');
    expect(coreAfter.getHexString()).toBe(coreBefore.getHexString());
  });
});

describe('createBorderedSvgGeometry', () => {
  it('should create bordered geometry for both section transform arrow SVGs', () => {
    const translationGeometry = createBorderedSvgGeometry({
      svg: translationArrowSvg,
      depth: 100,
      borderColor: '#ef4444',
      coreColor: '#ffffff',
    });
    const rotationGeometry = createBorderedSvgGeometry({
      svg: rotationArrowSvg,
      depth: 100,
      borderColor: '#3b82f6',
      coreColor: '#ffffff',
    });

    expectSingleVertexColoredGeometry(translationGeometry);
    expectSingleVertexColoredGeometry(rotationGeometry);
    expect(translationGeometry.boundingBox).not.toBeNull();
    expect(rotationGeometry.boundingBox).not.toBeNull();
  });

  it('should default to the halved arrow border ratio', () => {
    const defaultGeometry = createBorderedSvgGeometry({
      svg: translationArrowSvg,
      depth: 100,
      borderColor: '#ef4444',
      coreColor: '#ffffff',
    });
    const explicitGeometry = createBorderedSvgGeometry({
      svg: translationArrowSvg,
      depth: 100,
      borderWidthRatio: 0.055,
      borderColor: '#ef4444',
      coreColor: '#ffffff',
    });
    const defaultPosition = defaultGeometry.getAttribute('position') as BufferAttribute;
    const explicitPosition = explicitGeometry.getAttribute('position') as BufferAttribute;

    expect(defaultPosition.count).toBe(explicitPosition.count);
    for (let index = 0; index < defaultPosition.count; index++) {
      expect(defaultPosition.getX(index)).toBeCloseTo(explicitPosition.getX(index), 6);
      expect(defaultPosition.getY(index)).toBeCloseTo(explicitPosition.getY(index), 6);
      expect(defaultPosition.getZ(index)).toBeCloseTo(explicitPosition.getZ(index), 6);
    }
  });

  it('should not emit interior core side walls for either section transform arrow SVG', () => {
    const translationGeometry = createBorderedSvgGeometry({
      svg: translationArrowSvg,
      depth: 100,
      borderColor: '#ef4444',
      coreColor: '#ffffff',
    });
    const rotationGeometry = createBorderedSvgGeometry({
      svg: rotationArrowSvg,
      depth: 100,
      borderColor: '#3b82f6',
      coreColor: '#ffffff',
    });
    const translationUserData = getBorderedExtrusionUserData(translationGeometry)!;
    const rotationUserData = getBorderedExtrusionUserData(rotationGeometry)!;

    expect(countSideWallTriangles({ geometry: translationGeometry, ...translationUserData.controlRegions.core })).toBe(
      0,
    );
    expect(countSideWallTriangles({ geometry: rotationGeometry, ...rotationUserData.controlRegions.core })).toBe(0);
    expect(countBadWindingTriangles(translationGeometry)).toBeLessThanOrEqual(4);
    expect(countBadWindingTriangles(rotationGeometry)).toBeLessThanOrEqual(32);
  });
});
