import geospecRaw from '#generated/geospec/geospec.bundled.json?raw';

/** One package-shaped declaration bundle for Monaco's `/node_modules` mount. @public */
export type AuthoringTypesPackage = Readonly<{
  content?: string;
  files?: Readonly<Record<string, string>>;
  packageJson?: Readonly<Record<string, unknown>>;
}>;

/** Map of package name to package-shaped declaration bundle. @public */
export type AuthoringTypesMap = Readonly<Record<string, AuthoringTypesPackage>>;

function parseAuthoringTypesMap(raw: string): AuthoringTypesMap {
  return JSON.parse(raw) as AuthoringTypesMap;
}

/** GeoSpec authoring declarations for Monaco and VM-authored project files. @public */
export const geospecTypes: AuthoringTypesMap = parseAuthoringTypesMap(geospecRaw);

/** All authoring type maps, ready for `/node_modules` mounting. @public */
export const authoringTypeMaps: readonly AuthoringTypesMap[] = [geospecTypes];
