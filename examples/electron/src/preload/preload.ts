/**
 * Electron preload entry.
 *
 * Exposes the Tau runtime port bridge from the isolated preload world to
 * the renderer main world.
 */

import { exposeElectronRuntime } from '@taucad/runtime/electron/preload';

exposeElectronRuntime();
