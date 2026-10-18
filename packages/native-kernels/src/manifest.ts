/**
 * Every native kernel package's `tau-plugin.json`, imported statically so a bundled host (the desktop's main process)
 * carries them without resolving packages at run time.
 *
 * @module
 */
import build123dManifest from '@taucad/build123d/tau-plugin.json' with { type: 'json' };
import picogkManifest from '@taucad/picogk/tau-plugin.json' with { type: 'json' };

import type { NativePackage } from '#adopters.js';

/**
 * Each roster package's unparsed `tau-plugin.json`; `parsePluginDeployment` from `@taucad/runtime/preparation/node`
 * validates one.
 * @public
 */
export const nativeKernelManifests: Readonly<Record<NativePackage, unknown>> = {
  '@taucad/build123d': build123dManifest,
  '@taucad/picogk': picogkManifest,
};
