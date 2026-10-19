import type axeCore from 'axe-core';
import type { createScene } from '#www/scene.js';

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Vite requires interface merging for typed public build settings.
  interface ImportMetaEnv {
    readonly WWW_LAUNCH?: string;
    readonly WWW_ORIGIN?: string;
    readonly WWW_ANALYTICS_ENDPOINT?: string;
    /** The `@taucad/agent-plugin` version in the workspace at build time. */
    readonly WWW_PLUGIN_VERSION?: string;
  }
  var axe: typeof axeCore;
  var capture: (view: Parameters<ReturnType<typeof createScene>['draw']>[0], size: number) => Promise<string>;
}
export {};
