import { useSyncExternalStore } from 'react';

import { ENV } from '#environment.config.js';
import { selectDesktopScheme } from '#lib/desktop-deep-link.js';
import type { DesktopScheme } from '#lib/desktop-deep-link.js';

// Browser platform and the bound deployment origin do not change during this page's lifetime.
const subscribe = (): (() => void) => () => undefined;
/** Read only in a browser event or external-store snapshot, never during server rendering. */
export const browserDesktopScheme = (): DesktopScheme =>
  selectDesktopScheme({
    frontendUrl: globalThis.location.protocol === 'app:' ? ENV.TAU_FRONTEND_URL : globalThis.location.origin,
    platform: globalThis.navigator.platform,
    userAgent: globalThis.navigator.userAgent,
  });
const getServerSnapshot = (): DesktopScheme => 'tau';

/** Keep server markup and first hydration identical, then select the installed browser platform/channel. */
export const useDesktopScheme = (): DesktopScheme =>
  useSyncExternalStore(subscribe, browserDesktopScheme, getServerSnapshot);
