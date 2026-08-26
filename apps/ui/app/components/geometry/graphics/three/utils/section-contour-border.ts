import type { ClosedContour, OpenPolyline } from '#components/geometry/graphics/three/utils/plane-mesh-contour.js';

export type BuildSectionContourBorderPositionsOptions = Readonly<{
  closedContours: readonly ClosedContour[];
  openPolylines: readonly OpenPolyline[];
}>;

const floatsPerSegment = 6;

const countClosedContourSegments = (contours: readonly ClosedContour[]): number => {
  let segmentCount = 0;
  for (const contour of contours) {
    if (contour.length >= 2) {
      segmentCount += contour.length;
    }
  }

  return segmentCount;
};

const countOpenPolylineSegments = (polylines: readonly OpenPolyline[]): number => {
  let segmentCount = 0;
  for (const polyline of polylines) {
    segmentCount += Math.max(0, polyline.length - 1);
  }

  return segmentCount;
};

export const buildSectionContourBorderPositions = ({
  closedContours,
  openPolylines,
}: BuildSectionContourBorderPositionsOptions): Float32Array => {
  const segmentCount = countClosedContourSegments(closedContours) + countOpenPolylineSegments(openPolylines);
  if (segmentCount === 0) {
    return new Float32Array(0);
  }

  const positions = new Float32Array(segmentCount * floatsPerSegment);
  let writeIndex = 0;

  for (const contour of closedContours) {
    if (contour.length < 2) {
      continue;
    }

    for (let index = 0; index < contour.length; index++) {
      const current = contour[index]!;
      const next = contour[(index + 1) % contour.length]!;
      positions[writeIndex++] = current.x;
      positions[writeIndex++] = current.y;
      positions[writeIndex++] = current.z;
      positions[writeIndex++] = next.x;
      positions[writeIndex++] = next.y;
      positions[writeIndex++] = next.z;
    }
  }

  for (const polyline of openPolylines) {
    for (let index = 0; index < polyline.length - 1; index++) {
      const current = polyline[index]!;
      const next = polyline[index + 1]!;
      positions[writeIndex++] = current.x;
      positions[writeIndex++] = current.y;
      positions[writeIndex++] = current.z;
      positions[writeIndex++] = next.x;
      positions[writeIndex++] = next.y;
      positions[writeIndex++] = next.z;
    }
  }

  return positions;
};
