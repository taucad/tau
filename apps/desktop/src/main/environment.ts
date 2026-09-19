/* eslint-disable @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE. */
/**
 * The `window.ENV` payload main hands the preload (work item E4).
 *
 * The desktop renderer bundle bakes in **nothing** — `ui:build:desktop` emits
 * `window.ENV = { ...{}, ...(window.ENV ?? {}) }`, so whatever preload installs
 * first is what the app sees. These are exactly the keys `apps/ui`'s
 * `clientEnvironmentKeys` allowlist publishes; anything outside it would be
 * both unread and a leak.
 */

/** Names copied into `window.ENV`, mirroring `apps/ui`'s client allowlist. */
export const clientEnvironmentNames = [
  'TAU_API_URL',
  'TAU_WEBSOCKET_URL',
  'TAU_FRONTEND_URL',
  'TAU_DEBUG',
  'NODE_ENV',
] as const;

/** Names without which the renderer throws on its first API call. */
export const requiredClientEnvironmentNames = ['TAU_API_URL', 'TAU_WEBSOCKET_URL', 'TAU_FRONTEND_URL'] as const;

const productionClientEnvironment = {
  TAU_API_URL: 'https://api.tau.new',
  TAU_WEBSOCKET_URL: 'wss://api.tau.new',
  TAU_FRONTEND_URL: 'https://tau.new',
} as const;

/**
 * Resolve the desktop main-process environment.
 *
 * @param source - Main's inherited environment.
 * @returns A copy with production endpoints wherever an endpoint was absent or blank.
 */
export const desktopEnvironment = (source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const environment = { ...source };
  for (const name of requiredClientEnvironmentNames) {
    if (!source[name]?.trim()) {
      environment[name] = productionClientEnvironment[name];
    }
  }
  return environment;
};

/**
 * Select the renderer-visible environment.
 *
 * @param source - Main's own environment.
 * @returns A flat record of the defined allowlisted names.
 */
export const clientEnvironment = (source: NodeJS.ProcessEnv = process.env): Record<string, string> => {
  const resolved = desktopEnvironment(source);
  const environment: Record<string, string> = {};
  for (const name of clientEnvironmentNames) {
    const value = resolved[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return environment;
};

/**
 * Base URL the services utility's agent host hangs its gateway calls off.
 *
 * The **API origin**, never a path: `createGatewayModelTransport` appends
 * `v1/llm/openai/v1` and `v1/llm/anthropic` itself, so any prefix added here is
 * sent twice and the API answers 404 before a guard ever runs. Every other
 * caller (`tau serve`, the host daemon, the e2e fixtures) passes an origin too.
 *
 * There is no override any more. `TAU_DESKTOP_AGENT_GATEWAY_URL` used to point
 * the utility at the desktop e2e mock; D19 moved that stub behind the real API
 * (`TAU_LLM_PROVIDER_UPSTREAM_URL`), so the suite exercises this default rather
 * than replacing it.
 *
 * @param source - Main's own environment.
 * @returns The gateway origin, without a trailing slash.
 */
export const desktopAgentGatewayBaseUrl = (source: NodeJS.ProcessEnv = process.env): string =>
  desktopEnvironment(source)['TAU_API_URL']!.replace(/\/$/u, '');

/** System prompt for the services-utility agent host. */
export const desktopAgentSystemPrompt =
  'You are Tau, a CAD assistant running inside the Tau desktop application. Answer concisely.';
