/**
 * Read Monaco's one-time configuration from React.
 *
 * The only sanctioned way for UI code to reach the Monaco instance. Unlike
 * `useMonaco` from `@monaco-editor/react`, reading it never calls
 * `loader.init()`, so nothing can bind the page to the loader's CDN Monaco
 * before `configureMonaco` has registered the bundled one. Configuration starts
 * when the first component subscribes and is shared by every later one, which
 * then reads `ready` synchronously on its first render.
 */

import { useSyncExternalStore } from 'react';
import type * as Monaco from 'monaco-editor';
import type { MonacoConfiguration } from '#lib/monaco.lib.client.js';
import { getMonacoConfiguration, subscribeMonacoConfiguration } from '#lib/monaco.lib.client.js';

const serverConfiguration: MonacoConfiguration = { status: 'idle' };

/* `.client` modules are stubbed in the server build; these wrappers are only
 * called in the browser. */
const subscribe = (listener: () => void): (() => void) => subscribeMonacoConfiguration(listener);
const getSnapshot = (): MonacoConfiguration => getMonacoConfiguration();
const getServerSnapshot = (): MonacoConfiguration => serverConfiguration;

/**
 * Monaco's configuration state, starting configuration on first use.
 *
 * @returns The current state.
 */
export function useMonacoConfiguration(): MonacoConfiguration {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The configured Monaco instance.
 *
 * @returns The instance once configured; `undefined` while pending or failed.
 */
export function useConfiguredMonaco(): typeof Monaco | undefined {
  const configuration = useMonacoConfiguration();
  return configuration.status === 'ready' ? configuration.monaco : undefined;
}
