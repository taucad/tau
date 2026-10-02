/* eslint-disable @typescript-eslint/naming-convention -- pointA/pointB are existing exact-measurement transport fields. */
import type { MinimumDistanceResult } from 'geospec/assertion-client';
import type { ExactResponse } from './measurement-exact.worker.js';

const finitePoint = (point: unknown): point is readonly [number, number, number] =>
  Array.isArray(point) &&
  point.length === 3 &&
  point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));

/** Convert only a complete native millimetre/Z-up fact into UI metres. */
export const exactResponseFromNative = (id: number, result: MinimumDistanceResult): ExactResponse => {
  if (result.status !== 'complete') {
    return { id, status: 'unavailable', reason: result.message };
  }
  const { fact } = result;
  const observed: {
    source: unknown;
    unit: unknown;
    coordinateSystem: unknown;
    distance: unknown;
    points: unknown;
  } = fact;
  const { source, unit, coordinateSystem, distance, points } = observed;
  if (
    source !== 'ap242' ||
    unit !== 'mm' ||
    coordinateSystem !== 'z-up' ||
    typeof distance !== 'number' ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Array.isArray(points) ||
    !finitePoint(points[0]) ||
    !finitePoint(points[1])
  ) {
    return { id, status: 'unavailable', reason: 'The native AP242 fact is malformed.' };
  }
  return {
    id,
    status: 'cad-geometry',
    source: 'ap242',
    distanceMeters: distance / 1000,
    pointAMeters: [points[0][0] / 1000, points[0][1] / 1000, points[0][2] / 1000],
    pointBMeters: [points[1][0] / 1000, points[1][1] / 1000, points[1][2] / 1000],
  };
};
