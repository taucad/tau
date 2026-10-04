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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Names copied into `window.ENV`, mirroring `apps/ui`'s client allowlist. */
export const clientEnvironmentNames = [
  'TAU_API_URL',
  'TAU_WEBSOCKET_URL',
  'TAU_FRONTEND_URL',
  /* The billing screens read this one; without it a cloud build renders an
   * empty Billing tab because the renderer never resolves an owner identity. */
  'TAU_BILLING_ENVIRONMENT',
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
 * Names a locked packaged build never takes from its environment.
 *
 * Each one redirects where the signed app sends the session bearer, which
 * origins it trusts with the preload bridge, what it serves as the SPA or what
 * it executes — so a value planted by the launcher (or, before the login-shell
 * prefix deny-list, by an rc file) must not reach a release build.
 */
export const packagedLockedEnvironmentNames = [
  'TAU_API_URL',
  'TAU_WEBSOCKET_URL',
  'TAU_FRONTEND_URL',
  'TAU_S3_ENDPOINT',
  'ELECTRON_RENDERER_URL',
  'TAU_DESKTOP_CLIENT_ROOT',
  'TAU_BAMBU_STUDIO_PATH',
] as const;

/** Test-only switches (`TAU_E2E_*`) a locked packaged build ignores as well. */
const packagedLockedEnvironmentPrefix = 'TAU_E2E_';

/**
 * Remove every packaged-locked name from an environment, in place.
 *
 * @param target - The environment to scrub; main passes `process.env` before anything reads it.
 */
export const stripPackagedOverrides = (target: NodeJS.ProcessEnv): void => {
  for (const name of Object.keys(target)) {
    if (
      (packagedLockedEnvironmentNames as readonly string[]).includes(name) ||
      name.startsWith(packagedLockedEnvironmentPrefix)
    ) {
      Reflect.deleteProperty(target, name);
    }
  }
};

/**
 * Whether a packaged app was assembled to honour environment overrides.
 *
 * The packaging script writes `tauDesktop.environmentOverrides: true` into the
 * staged `package.json` (inside the ASAR) for ad-hoc and unsigned packages only,
 * which is what the packaged e2e lane launches against local services. A
 * release package never carries it, so a release build ignores the overrides
 * whatever its environment says. A missing or unreadable manifest locks.
 *
 * @param appPath - `app.getAppPath()`, the directory holding the packaged `package.json`.
 * @returns True only when the packaged manifest opts in.
 */
export const packagedOverridesEnabled = (appPath: string): boolean => {
  try {
    const manifest = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8')) as {
      readonly tauDesktop?: { readonly environmentOverrides?: unknown };
    };
    return manifest.tauDesktop?.environmentOverrides === true;
  } catch {
    return false;
  }
};

/**
 * Resolve the desktop main-process environment.
 *
 * @param source - Main's inherited environment.
 * @param options - `locked` drops every packaged-locked name first (a packaged build without the override opt-in).
 * @returns A copy with production endpoints wherever an endpoint was absent or blank.
 */
export const desktopEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
  options: { readonly locked?: boolean | undefined } = {},
): NodeJS.ProcessEnv => {
  const environment = { ...source };
  if (options.locked) {
    stripPackagedOverrides(environment);
  }
  for (const name of requiredClientEnvironmentNames) {
    if (!environment[name]?.trim()) {
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
