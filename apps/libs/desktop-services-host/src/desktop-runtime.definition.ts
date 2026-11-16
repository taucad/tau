/** Desktop runtime definitions served by one project-scoped kernel utility. */

import { createDesktopRuntime } from '#desktop-runtime.factory.js';

export const runtime = createDesktopRuntime();
export const debugRuntime = createDesktopRuntime({ withSourceMapping: true });
