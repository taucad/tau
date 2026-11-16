/*
 * The desktop build's constants this library reads. `apps/desktop/electron.vite.config.ts` defines them for every
 * module it bundles, this library's included, and `apps/desktop/src/build-environment.d.ts` declares the full set.
 */

/** Whether the build ships Tau Cloud billing (`TAU_CLOUD_BUILD`). */
declare const tauCloudBuildEnabled: boolean;
/** The 12-hex short commit the desktop build was made from, for agent observability (LW8); empty when unknown. */
declare const tauDesktopHostBuild: string;
