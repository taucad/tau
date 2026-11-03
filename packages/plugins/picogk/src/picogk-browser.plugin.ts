import { definePlugin } from '@taucad/runtime/plugin';
import { picogkBrowserKernel } from '#picogk-browser.kernel.js';

/** PicoGK plugin for browser hosts with a prepared .NET asset bundle. @public */
export const picogk = definePlugin({
  meta: { name: '@taucad/picogk' },
  kernels: { default: picogkBrowserKernel },
  presets: { default: ['kernels.default'] },
});
