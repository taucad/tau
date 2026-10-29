declare const tauCloudBuildEnabled: boolean;
/** Runtime telemetry's Cloud-host build signal (`TAU_TELEMETRY_HOST=cloud`), independent of the billing gate. */
declare const tauTelemetryHostCloudBuild: boolean;
/** The desktop Sentry DSN baked in at build time, or an empty string when the build had none. */
declare const tauSentryDsn: string;
/** The PostHog project key baked in at build time, or an empty string when the build had none. */
declare const tauPostHogClientKey: string;
