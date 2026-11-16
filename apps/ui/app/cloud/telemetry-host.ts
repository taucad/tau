/**
 * Compile-time runtime telemetry host signal: `true` in every web build, whose own API policy probe is the only gate;
 * in the desktop renderer only when `TAU_TELEMETRY_HOST=cloud` (official releases); `false` in a `tau serve` bundle and
 * in tests. Independent of the billing gate (`cloud-enabled.ts`).
 */
export const tauTelemetryHostCloud = tauTelemetryHostCloudBuild;
