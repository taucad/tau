/*
 * The desktop build's constants this library reads. `apps/desktop/electron.vite.config.ts` defines them for every
 * module it bundles, this library's included, and `apps/desktop/src/build-environment.d.ts` declares the full set.
 */

/** Runtime telemetry's Cloud-host build signal (`TAU_TELEMETRY_HOST=cloud`), independent of the billing gate. */
declare const tauTelemetryHostCloudBuild: boolean;
