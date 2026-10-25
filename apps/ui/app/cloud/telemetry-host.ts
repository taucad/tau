/**
 * Compile-time runtime telemetry host signal: `true` in a Tau Cloud build (`TAU_TELEMETRY_HOST=cloud`), `false` in a
 * self-host, `tau serve` or local build. Independent of the billing gate (`cloud-enabled.ts`).
 */
export const tauTelemetryHostCloud = tauTelemetryHostCloudBuild;
