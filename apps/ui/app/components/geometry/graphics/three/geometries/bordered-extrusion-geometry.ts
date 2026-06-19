import { Box2, BufferGeometry, Color, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three';
import { SVGLoader } from 'three/examples/jsm/Addons.js';

export type BorderedExtrusionRegionName = 'border' | 'core';

export type BorderedExtrusionRegionRange = {
  readonly vertexStart: number;
  readonly vertexCount: number;
};

export type BorderedExtrusionUserData = {
  readonly controlRegions: Record<BorderedExtrusionRegionName, BorderedExtrusionRegionRange>;
};

type BorderedExtrusionGeometryOptions = {
  readonly outerContour: readonly Vector2[];
  readonly depth: number;
  readonly borderWidth: number;
  readonly borderColor: string | number | Color;
  readonly coreColor: string | number | Color;
  readonly innerContour?: readonly Vector2[];
  readonly miterLimit?: number;
  readonly center?: boolean;
};

type BorderedSvgGeometryOptions = {
  readonly svg: string;
  readonly depth: number;
  readonly borderWidthRatio?: number;
  readonly borderWidth?: number;
  readonly borderColor: string | number | Color;
  readonly coreColor: string | number | Color;
  readonly curveSegments?: number;
};

type BorderedRoundedRectangleGeometryOptions = {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly smoothness: number;
  readonly depth: number;
  readonly borderWidth: number;
  readonly borderColor: string | number | Color;
  readonly coreColor: string | number | Color;
};

const scratchBox = new Box2();
const scratchCenter = new Vector2();
const scratchColor = new Color();
const scratchNormal = new Vector3();

function removeClosingPoint(points: readonly Vector2[]): Vector2[] {
  const contour = points.map((point) => point.clone());
  const first = contour[0];
  const last = contour.at(-1);

  if (first !== undefined && last !== undefined && first.distanceToSquared(last) < 1e-12) {
    contour.pop();
  }

  return contour;
}

function normalizeCounterClockwise(points: readonly Vector2[]): Vector2[] {
  const contour = removeClosingPoint(points);

  if (contour.length < 3) {
    throw new Error('BorderedExtrusionGeometry: contour must contain at least three points.');
  }

  if (ShapeUtils.isClockWise(contour)) {
    contour.reverse();
  }

  return contour;
}

function intersectLines({
  pointA,
  directionA,
  pointB,
  directionB,
}: {
  readonly pointA: Vector2;
  readonly directionA: Vector2;
  readonly pointB: Vector2;
  readonly directionB: Vector2;
}): Vector2 | undefined {
  const cross = directionA.x * directionB.y - directionA.y * directionB.x;

  if (Math.abs(cross) < 1e-9) {
    return undefined;
  }

  const delta = scratchCenter.subVectors(pointB, pointA);
  const t = (delta.x * directionB.y - delta.y * directionB.x) / cross;

  return pointA.clone().addScaledVector(directionA, t);
}

function leftNormal(edge: Vector2): Vector2 {
  return new Vector2(-edge.y, edge.x).normalize();
}

function createInsetContour(points: readonly Vector2[], distance: number, miterLimit: number): Vector2[] {
  const contour = normalizeCounterClockwise(points);
  const inset: Vector2[] = [];

  for (let index = 0; index < contour.length; index++) {
    const previous = contour[(index - 1 + contour.length) % contour.length]!;
    const current = contour[index]!;
    const next = contour[(index + 1) % contour.length]!;

    const previousEdge = new Vector2().subVectors(current, previous).normalize();
    const nextEdge = new Vector2().subVectors(next, current).normalize();
    const previousNormal = leftNormal(previousEdge);
    const nextNormal = leftNormal(nextEdge);
    const previousPoint = current.clone().addScaledVector(previousNormal, distance);
    const nextPoint = current.clone().addScaledVector(nextNormal, distance);
    const intersection = intersectLines({
      pointA: previousPoint,
      directionA: previousEdge,
      pointB: nextPoint,
      directionB: nextEdge,
    });
    const fallbackDirection = previousNormal.add(nextNormal);

    if (fallbackDirection.lengthSq() < 1e-12) {
      fallbackDirection.copy(previousNormal);
    }

    const fallback = current.clone().add(fallbackDirection.normalize().multiplyScalar(distance));
    const candidate = intersection ?? fallback;
    const maxMiterDistance = distance * miterLimit;

    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
      inset.push(fallback);
      continue;
    }

    if (candidate.distanceTo(current) > maxMiterDistance) {
      inset.push(fallback);
      continue;
    }

    inset.push(candidate);
  }

  if (ShapeUtils.isClockWise(inset)) {
    inset.reverse();
  }

  return inset;
}

function createRoundedRectangleContour({
  width,
  height,
  radius,
  smoothness,
}: {
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly smoothness: number;
}): Vector2[] {
  const pi2 = Math.PI * 2;
  const segments = Math.max(1, smoothness);
  const count = (segments + 1) * 4;
  const points: Vector2[] = [];

  for (let index = 0; index < count; index++) {
    const quadrant = Math.trunc((4 * index) / count) + 1;
    const signX = quadrant === 1 || quadrant === 4 ? 1 : -1;
    const signY = quadrant < 3 ? 1 : -1;
    const x = signX * (width / 2 - radius) + radius * Math.cos((pi2 * (index - quadrant + 1)) / (count - 4));
    const y = signY * (height / 2 - radius) + radius * Math.sin((pi2 * (index - quadrant + 1)) / (count - 4));
    points.push(new Vector2(x, y));
  }

  if (ShapeUtils.isClockWise(points)) {
    points.reverse();
  }

  return points;
}

function appendColor(colors: number[], color: Color): void {
  colors.push(color.r, color.g, color.b);
}

function appendVertex({
  point,
  z,
  normal,
  color,
  bounds,
  positions,
  normals,
  colors,
  uvs,
}: {
  readonly point: Vector2;
  readonly z: number;
  readonly normal: Vector3;
  readonly color: Color;
  readonly bounds: Box2;
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly uvs: number[];
}): void {
  positions.push(point.x, point.y, z);
  normals.push(normal.x, normal.y, normal.z);
  appendColor(colors, color);

  const width = bounds.max.x - bounds.min.x || 1;
  const height = bounds.max.y - bounds.min.y || 1;
  uvs.push((point.x - bounds.min.x) / width, (point.y - bounds.min.y) / height);
}

function appendTriangle({
  points,
  z,
  normal,
  color,
  bounds,
  positions,
  normals,
  colors,
  uvs,
}: {
  readonly points: readonly [Vector2, Vector2, Vector2];
  readonly z: number;
  readonly normal: Vector3;
  readonly color: Color;
  readonly bounds: Box2;
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly uvs: number[];
}): void {
  for (const point of points) {
    appendVertex({ point, z, normal, color, bounds, positions, normals, colors, uvs });
  }
}

function appendCapTriangles({
  contour,
  holes,
  z,
  color,
  bounds,
  flip,
  positions,
  normals,
  colors,
  uvs,
}: {
  readonly contour: readonly Vector2[];
  readonly holes: readonly Vector2[][];
  readonly z: number;
  readonly color: Color;
  readonly bounds: Box2;
  readonly flip: boolean;
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly uvs: number[];
}): void {
  const allPoints = [...contour, ...holes.flat()];
  const triangles = ShapeUtils.triangulateShape(contour, holes);
  const normal = flip ? new Vector3(0, 0, -1) : new Vector3(0, 0, 1);

  for (const triangle of triangles) {
    const triPoints: [Vector2, Vector2, Vector2] = flip
      ? [allPoints[triangle[2]!]!, allPoints[triangle[1]!]!, allPoints[triangle[0]!]!]
      : [allPoints[triangle[0]!]!, allPoints[triangle[1]!]!, allPoints[triangle[2]!]!];
    appendTriangle({ points: triPoints, z, normal, color, bounds, positions, normals, colors, uvs });
  }
}

function appendSideWalls({
  contour,
  halfDepth,
  color,
  bounds,
  positions,
  normals,
  colors,
  uvs,
}: {
  readonly contour: readonly Vector2[];
  readonly halfDepth: number;
  readonly color: Color;
  readonly bounds: Box2;
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly uvs: number[];
}): void {
  for (let index = 0; index < contour.length; index++) {
    const current = contour[index]!;
    const next = contour[(index + 1) % contour.length]!;
    const edge = scratchCenter.subVectors(next, current);

    if (edge.lengthSq() < 1e-12) {
      continue;
    }

    const outward = scratchNormal.set(edge.y, -edge.x, 0).normalize().clone();
    appendVertex({ point: current, z: halfDepth, normal: outward, color, bounds, positions, normals, colors, uvs });
    appendVertex({ point: current, z: -halfDepth, normal: outward, color, bounds, positions, normals, colors, uvs });
    appendVertex({ point: next, z: -halfDepth, normal: outward, color, bounds, positions, normals, colors, uvs });
    appendVertex({ point: current, z: halfDepth, normal: outward, color, bounds, positions, normals, colors, uvs });
    appendVertex({ point: next, z: -halfDepth, normal: outward, color, bounds, positions, normals, colors, uvs });
    appendVertex({ point: next, z: halfDepth, normal: outward, color, bounds, positions, normals, colors, uvs });
  }
}

function centerPositions(positions: number[], bounds: Box2): void {
  bounds.getCenter(scratchCenter);

  for (let index = 0; index < positions.length; index += 3) {
    positions[index]! -= scratchCenter.x;
    positions[index + 1]! -= scratchCenter.y;
  }
}

export function getBorderedExtrusionUserData(geometry: BufferGeometry): BorderedExtrusionUserData | undefined {
  return geometry.userData as BorderedExtrusionUserData | undefined;
}

export function setBorderedExtrusionRegionColor({
  geometry,
  region,
  color,
}: {
  readonly geometry: BufferGeometry;
  readonly region: BorderedExtrusionRegionName;
  readonly color: string | number | Color;
}): void {
  const range = getBorderedExtrusionUserData(geometry)?.controlRegions[region];
  const colorAttribute = geometry.getAttribute('color') as Float32BufferAttribute | undefined;

  if (!range || !colorAttribute) {
    return;
  }

  scratchColor.set(color);

  for (let index = range.vertexStart; index < range.vertexStart + range.vertexCount; index++) {
    colorAttribute.setXYZ(index, scratchColor.r, scratchColor.g, scratchColor.b);
  }

  colorAttribute.needsUpdate = true;
}

export function createBorderedExtrusionGeometry({
  outerContour,
  innerContour,
  depth,
  borderWidth,
  borderColor,
  coreColor,
  miterLimit = 4,
  center = true,
}: BorderedExtrusionGeometryOptions): BufferGeometry {
  const outer = normalizeCounterClockwise(outerContour);
  const inner = innerContour
    ? normalizeCounterClockwise(innerContour)
    : createInsetContour(outer, borderWidth, miterLimit);
  const bounds = scratchBox.setFromPoints(outer);
  const halfDepth = depth / 2;
  const resolvedBorderColor = new Color(borderColor);
  const resolvedCoreColor = new Color(coreColor);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];

  const borderVertexStart = positions.length / 3;
  appendCapTriangles({
    contour: outer,
    holes: [inner],
    z: halfDepth,
    color: resolvedBorderColor,
    bounds,
    flip: false,
    positions,
    normals,
    colors,
    uvs,
  });
  appendCapTriangles({
    contour: outer,
    holes: [inner],
    z: -halfDepth,
    color: resolvedBorderColor,
    bounds,
    flip: true,
    positions,
    normals,
    colors,
    uvs,
  });
  appendSideWalls({ contour: outer, halfDepth, color: resolvedBorderColor, bounds, positions, normals, colors, uvs });
  const borderVertexCount = positions.length / 3 - borderVertexStart;

  const coreVertexStart = positions.length / 3;
  appendCapTriangles({
    contour: inner,
    holes: [],
    z: halfDepth,
    color: resolvedCoreColor,
    bounds,
    flip: false,
    positions,
    normals,
    colors,
    uvs,
  });
  appendCapTriangles({
    contour: inner,
    holes: [],
    z: -halfDepth,
    color: resolvedCoreColor,
    bounds,
    flip: true,
    positions,
    normals,
    colors,
    uvs,
  });
  const coreVertexCount = positions.length / 3 - coreVertexStart;

  if (center) {
    centerPositions(positions, bounds);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.userData = {
    ...geometry.userData,
    controlRegions: {
      border: { vertexStart: borderVertexStart, vertexCount: borderVertexCount },
      core: { vertexStart: coreVertexStart, vertexCount: coreVertexCount },
    },
  } satisfies BorderedExtrusionUserData;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

export function createBorderedSvgGeometry({
  svg,
  depth,
  borderWidth,
  borderWidthRatio = 0.055,
  borderColor,
  coreColor,
  curveSegments = 16,
}: BorderedSvgGeometryOptions): BufferGeometry {
  const loader = new SVGLoader();
  const svgData = loader.parse(svg);
  const path = svgData.paths[0];
  const subPath = path?.subPaths[0];

  if (!subPath) {
    throw new Error('BorderedSvgGeometry: SVG must contain at least one path.');
  }

  const contour = removeClosingPoint(subPath.getPoints(curveSegments)).map((point) => new Vector2(point.x, -point.y));
  const bounds = scratchBox.setFromPoints(contour);
  const resolvedBorderWidth =
    borderWidth ?? Math.min(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) * borderWidthRatio;

  return createBorderedExtrusionGeometry({
    outerContour: contour,
    depth,
    borderWidth: resolvedBorderWidth,
    borderColor,
    coreColor,
  });
}

export function createBorderedRoundedRectangleGeometry({
  width,
  height,
  radius,
  smoothness,
  depth,
  borderWidth,
  borderColor,
  coreColor,
}: BorderedRoundedRectangleGeometryOptions): BufferGeometry {
  const clampedBorderWidth = Math.min(borderWidth, Math.min(width, height) * 0.45);
  const innerWidth = Math.max(width - clampedBorderWidth * 2, 1e-6);
  const innerHeight = Math.max(height - clampedBorderWidth * 2, 1e-6);
  const innerRadius = Math.max(radius - clampedBorderWidth, 0);

  return createBorderedExtrusionGeometry({
    outerContour: createRoundedRectangleContour({ width, height, radius, smoothness }),
    innerContour: createRoundedRectangleContour({
      width: innerWidth,
      height: innerHeight,
      radius: Math.min(innerRadius, innerWidth / 2, innerHeight / 2),
      smoothness,
    }),
    depth,
    borderWidth: clampedBorderWidth,
    borderColor,
    coreColor,
  });
}
