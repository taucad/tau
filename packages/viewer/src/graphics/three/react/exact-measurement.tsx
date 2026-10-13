import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { GeometryComponentManifest } from '@taucad/types';

/**
 * The answer to an exact occurrence-distance query.
 *
 * @public
 */
export type ExactOccurrenceDistanceResult =
  | {
      status: 'cad-geometry';
      distanceMeters: number;
      pointAMeters: [number, number, number];
      pointBMeters: [number, number, number];
      source: 'ap242';
    }
  | { status: 'unavailable'; reason: string };

/**
 * Two displayed occurrences whose exact CAD distance the measure tool asks for.
 *
 * @public
 */
export type ExactOccurrenceDistanceRequest = {
  manifest: GeometryComponentManifest;
  /** The geometry hash on screen; an answer for any other geometry is unavailable. */
  presentedGeometryHash: string;
  occurrenceA: string;
  occurrenceB: string;
  signal?: AbortSignal;
};

/**
 * Measures two occurrences against the CAD source that produced the displayed geometry.
 *
 * @public
 */
export type ExactOccurrenceDistance = (
  request: ExactOccurrenceDistanceRequest,
) => Promise<ExactOccurrenceDistanceResult>;

const ExactMeasurementContext = createContext<ExactOccurrenceDistance | undefined>(undefined);

/**
 * Give the measure tool an exact-distance service. Without one, a body-to-body measurement keeps its
 * mesh answer and is marked unavailable for exact geometry.
 * @public
 */
export function ExactMeasurementProvider({
  measure,
  children,
}: {
  readonly measure: ExactOccurrenceDistance | undefined;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <ExactMeasurementContext.Provider value={measure}>{children}</ExactMeasurementContext.Provider>;
}

/**
 * The nearest exact-distance service, if the embedder supplied one.
 *
 * @public
 */
export function useExactMeasurement(): ExactOccurrenceDistance | undefined {
  return useContext(ExactMeasurementContext);
}
