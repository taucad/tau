import { analyseWatertight as analyseGeoSpecWatertight, isWatertight as isGeoSpecWatertight } from 'geospec/mesh';
import type { Document } from '@gltf-transform/core';
import type { WatertightResult } from '#geometry/types.js';

/**
 * Analyze watertightness using GeoSpec's mesh analyser.
 *
 * @param document - Parsed glTF document.
 * @returns Watertightness evidence.
 * @public
 */
export const analyseWatertight = (document: Document): WatertightResult => analyseGeoSpecWatertight(document);

/**
 * Return whether a mesh document is watertight.
 *
 * @param document - Parsed glTF document.
 * @returns True when the mesh passes the watertightness check.
 * @public
 */
export const isWatertight = (document: Document): boolean => isGeoSpecWatertight(document);
