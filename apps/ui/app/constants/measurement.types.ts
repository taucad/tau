/** The rendered source of one selected measurement witness. */
export type MeasurementAnchor = {
  point: [number, number, number];
  /** Witness in the selected occurrence's local render geometry; valid only for the recorded source revision. */
  localPoint?: [number, number, number];
  geometryKey: string;
  occurrenceId?: string;
  featureId?: string;
  featureKind?: 'point' | 'edge' | 'face' | 'circle' | 'body';
  label: string;
  quality: 'mesh' | 'fitted' | 'cad' | 'snapshot';
};

export type MeasurementOperation =
  | 'point-distance'
  | 'minimum-distance'
  | 'center-distance'
  | 'plane-spacing'
  | 'edge-length'
  | 'radius'
  | 'diameter'
  | 'angle'
  | 'extent-x'
  | 'extent-y'
  | 'extent-z';

/** A resolved measurement retains its witnesses and source evidence, even when the source later changes. */
export type MeasurementRecord = {
  id: string;
  frameId: string;
  /** Unit X/Y/Z axes of the named frame in physical tau:root coordinates. */
  frameBasis?: [[number, number, number], [number, number, number], [number, number, number]];
  startPoint: [number, number, number];
  endPoint: [number, number, number];
  distance: number;
  operation?: MeasurementOperation;
  quality?: MeasurementAnchor['quality'];
  anchors?: [MeasurementAnchor, MeasurementAnchor?];
  geometryKey?: string;
  poseRevision?: number;
  status?: 'current' | 'pending' | 'out-of-date' | 'snapshot' | 'unavailable';
  unavailableReason?: string;
  evidenceDetails?: string;
  name?: string;
  isPinned?: boolean;
};
