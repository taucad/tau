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
import {
  getMonacoConfiguration,
  observeMonacoConfiguration,
  subscribeMonacoConfiguration,
} from '#lib/monaco.lib.client.js';

const serverConfiguration: MonacoConfiguration = { status: 'idle' };

/* `.client` modules are stubbed in the server build; these wrappers are only
 * called in the browser. */
const subscribe = (listener: () => void): (() => void) => subscribeMonacoConfiguration(listener);
const getSnapshot = (): MonacoConfiguration => getMonacoConfiguration();
const observe = (listener: () => void): (() => void) => observeMonacoConfiguration(listener);
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

/**
 * The configured Monaco instance once something else has configured it.
 *
 * Reading this never starts configuration: a code pane or editor intent does
 * (B-16). Use it for services that are only needed while an editor exists.
 *
 * @returns The instance once configured; `undefined` until then.
 */
export function useMonacoIfConfigured(): typeof Monaco | undefined {
  const configuration = useSyncExternalStore(observe, getSnapshot, getServerSnapshot);
  return configuration.status === 'ready' ? configuration.monaco : undefined;
}
