import geospecRaw from '#generated/geospec/geospec.bundled.json?raw';
import type { BundledTypesPackageMap } from '#bundled-types.types.js';

const parseAuthoringTypesMap = (raw: string): BundledTypesPackageMap => JSON.parse(raw) as BundledTypesPackageMap;

/** GeoSpec authoring declarations for Monaco and VM-authored project files. @public */
export const geospecTypes: BundledTypesPackageMap = parseAuthoringTypesMap(geospecRaw);

/** All authoring type maps, ready for `/node_modules` mounting. @public */
export const authoringTypeMaps: readonly BundledTypesPackageMap[] = [geospecTypes];
