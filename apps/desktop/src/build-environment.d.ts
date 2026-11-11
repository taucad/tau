declare const tauCloudBuildEnabled: boolean;
/** Runtime telemetry's Cloud-host build signal (`TAU_TELEMETRY_HOST=cloud`), independent of the billing gate. */
declare const tauTelemetryHostCloudBuild: boolean;
/** The desktop Sentry DSN baked in at build time, or an empty string when the build had none. */
declare const tauSentryDsn: string;
/** The Sentry release baked in at build time (`tau-desktop@<version>`), or an empty string when the build had none. */
declare const tauSentryRelease: string;
/** The PostHog project key baked in at build time, or an empty string when the build had none. */
declare const tauPostHogClientKey: string;
/** The 12-hex short commit the desktop build was made from, for agent observability (LW8); empty when unknown. */
declare const tauDesktopHostBuild: string;
