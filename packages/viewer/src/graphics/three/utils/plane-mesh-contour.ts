import type * as THREE from 'three';

/** Ordered loop of 3D points in mesh-local space (first point is not repeated at the end). */
export type ClosedContour = readonly THREE.Vector3[];
export type OpenPolyline = readonly THREE.Vector3[];
