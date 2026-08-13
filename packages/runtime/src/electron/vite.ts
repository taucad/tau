/**
 * Electron-vite integration for `@taucad/runtime` consumers.
 *
 * @public
 */

import { runtimePackages } from '#vite/runtime-invariants.js';
import { tauRuntime } from '#vite/runtime-vite-plugins.js';

type ElectronRuntimeExternalizeDepsOptions = {
  exclude?: string[];
  include?: string[];
};

type ElectronRuntimeNodeConfig = {
  build?: {
    externalizeDeps?: boolean | ElectronRuntimeExternalizeDepsOptions;
  };
  plugins?: readonly unknown[];
};

type ElectronRuntimeRendererConfig = {
  plugins?: readonly unknown[];
};

/**
 * Stable electron-vite configuration fields composed by {@link electronRuntimeConfig}.
 *
 * @public
 */
export type ElectronRuntimeUserConfig = {
  main?: ElectronRuntimeNodeConfig;
  preload?: ElectronRuntimeNodeConfig;
  renderer?: ElectronRuntimeRendererConfig;
};

const withRuntimeExternalization = (config: ElectronRuntimeNodeConfig): ElectronRuntimeNodeConfig => {
  const build = config.build ?? {};
  if (build.externalizeDeps === false) {
    return config;
  }

  const externalizeDeps: ElectronRuntimeExternalizeDepsOptions =
    typeof build.externalizeDeps === 'object' ? build.externalizeDeps : {};

  return {
    ...config,
    build: {
      ...build,
      externalizeDeps: {
        ...externalizeDeps,
        exclude: [...new Set([...(externalizeDeps.exclude ?? []), ...runtimePackages])],
      },
    },
  };
};

const withMainRuntime = (config: ElectronRuntimeNodeConfig): ElectronRuntimeNodeConfig => {
  const externalized = withRuntimeExternalization(config);
  return {
    ...externalized,
    plugins: [tauRuntime({ crossOriginIsolation: false }), ...(externalized.plugins ?? [])],
  };
};

const withRendererRuntime = (config: ElectronRuntimeRendererConfig): ElectronRuntimeRendererConfig => ({
  ...config,
  plugins: [tauRuntime(), ...(config.plugins ?? [])],
});

/**
 * Apply every Tau-owned electron-vite invariant while preserving application configuration.
 *
 * @param config - Application-owned electron-vite process configuration.
 * @returns A composed copy of the application configuration.
 * @public
 * @example <caption>Compose an electron-vite config</caption>
 * ```typescript
 * import { electronRuntimeConfig } from '@taucad/runtime/electron/vite';
 * import { defineConfig } from 'electron-vite';
 *
 * export default defineConfig(electronRuntimeConfig({ main: {}, preload: {}, renderer: {} }));
 * ```
 */
export const electronRuntimeConfig = <Config>(config: Config & ElectronRuntimeUserConfig): Config => {
  const composed = { ...config };
  Object.assign(composed, {
    ...(config.main ? { main: withMainRuntime(config.main) } : {}),
    ...(config.preload ? { preload: withRuntimeExternalization(config.preload) } : {}),
    ...(config.renderer ? { renderer: withRendererRuntime(config.renderer) } : {}),
  });
  return composed;
};
