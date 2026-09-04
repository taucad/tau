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
 * Model the services utility's agent host runs turns against.
 *
 * A row, not a catalogue: the desktop host is the daemon-capability
 * integration, not a model picker — the renderer's Path-A chat owns model
 * selection. `openai-gpt-5.6-luna` is the row the smoke lane's live tier uses,
 * so the two agree on what "the desktop agent" means.
 */
export const desktopAgentModel = {
  id: 'openai-gpt-5.6-luna',
  contextWindow: 400_000,
} as const;

/** System prompt for the services-utility agent host. */
export const desktopAgentSystemPrompt =
  'You are Tau, a CAD assistant running inside the Tau desktop application. Answer concisely.';
