// oxlint-disable-next-line no-restricted-imports -- package metadata belongs to this published artifact.
import packageJson from '../../package.json' with { type: 'json' };

/** Version of `@taucad/geometry-core`. @public */
export const packageVersion: string = packageJson.version;

/** Name of the geometry core package. @public */
export const packageName: string = packageJson.name;
