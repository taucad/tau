/**
 * The OpenTelemetry SDK this process started, if any.
 *
 * `otel.ts` starts the SDK as an import side effect, so nothing that only needs to stop it may import that module:
 * a dynamic `import('#otel.js')` at shutdown would start an SDK in a process that never ran one, and in the API
 * bundle, where `main.ts` already imports it, it leaves a map-less re-export chunk Sentry cannot symbolicate.
 */
import type { NodeSDK } from '@opentelemetry/sdk-node';

/** What shutdown needs from the started SDK. */
export type StartedOtelSdk = Pick<NodeSDK, 'shutdown'>;

let started: StartedOtelSdk | undefined;

/**
 * Record the SDK `otel.ts` just started.
 *
 * @param sdk - The started SDK.
 */
export const registerStartedOtelSdk = (sdk: StartedOtelSdk): void => {
  started = sdk;
};

/**
 * The SDK this process started.
 *
 * @returns The started SDK, or `undefined` when `otel.ts` never ran here.
 */
export const startedOtelSdk = (): StartedOtelSdk | undefined => started;
