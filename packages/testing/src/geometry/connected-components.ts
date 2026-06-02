import {
  analyseConnectedComponents as analyseGeoSpecConnectedComponents,
  buildMeshNodeNameMap as buildGeoSpecMeshNodeNameMap,
  collectPrimitiveRecords as collectGeoSpecPrimitiveRecords,
  countConnectedComponents as countGeoSpecConnectedComponents,
} from 'geospec/mesh';
import type { Document, Mesh } from '@gltf-transform/core';
import type { ConnectedComponentsResult, PrimitiveRecord } from '#geometry/types.js';

/**
 * Build a mesh-to-node name map using GeoSpec's mesh analyser.
 *
 * @param document - Parsed glTF document.
 * @returns Mesh names resolved from nodes.
 * @public
 */
export const buildMeshNodeNameMap = (document: Document): Map<Mesh, string> => buildGeoSpecMeshNodeNameMap(document);

/**
 * Collect primitive records using GeoSpec's geometry-only analyser.
 *
 * @param document - Parsed glTF document.
 * @returns Spatial primitive records.
 * @public
 */
export const collectPrimitiveRecords = (document: Document): PrimitiveRecord[] =>
  collectGeoSpecPrimitiveRecords(document);

/**
 * Analyze welded connected components using GeoSpec.
 *
 * @param document - Parsed glTF document.
 * @param toleranceMm - Spatial welding tolerance in millimeters.
 * @returns Connected component evidence.
 * @public
 */
export const analyseConnectedComponents = (document: Document, toleranceMm: number): ConnectedComponentsResult =>
  analyseGeoSpecConnectedComponents(document, toleranceMm);

/**
 * Count welded connected components using GeoSpec.
 *
 * @param document - Parsed glTF document.
 * @param toleranceMm - Spatial welding tolerance in millimeters.
 * @returns Connected component count.
 * @public
 */
export const countConnectedComponents = (document: Document, toleranceMm: number): number =>
  countGeoSpecConnectedComponents(document, toleranceMm);
