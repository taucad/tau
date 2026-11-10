import * as Cookies from 'es-cookie';
import { useContext } from 'react';
import { UNSAFE_DataRouterStateContext as DataRouterStateContext } from 'react-router';
import { detectRequestPlatform, serverPlatform } from '@taucad/ui/utils/platform';
import type { DetectedPlatform } from '@taucad/ui/utils/platform';
import { metaConfig } from '#constants/meta.constants.js';
import { sidebarDefaultOpen } from '@taucad/ui-core/constants/sidebar.constants';

/**
 * What the server needs to render the application shell at its final geometry: the
 * sidebar's open state and the platform that shortcut hints are written for. The sidebar
 * preference itself lives in local storage (`useCookie(cookieName.sidebarOp)`), which a
 * document request cannot read, so the provider mirrors it into this cookie.
 */
export type ShellRequestHints = {
  /** Whether the sidebar was open when the person last left it. */
  readonly isSidebarOpen: boolean;
  /** The platform the request came from, for shortcut labels. */
  readonly platform: DetectedPlatform;
};

/**
 * The cookie mirroring the sidebar's open state. Named apart from the legacy
 * `sidebar-op` cookie, which the preference store deletes once local storage holds it.
 */
export const sidebarOpenCookieName = `${metaConfig.cookiePrefix}shell-op-sidebar`;

const defaultShellHints: ShellRequestHints = {
  isSidebarOpen: sidebarDefaultOpen,
  platform: serverPlatform,
};

const parseSidebarOpen = (value: string | undefined): boolean => {
  if (value === '1') {
    return true;
  }
  if (value === '0') {
    return false;
  }
  return sidebarDefaultOpen;
};

/**
 * Read the shell hints a document request carries.
 *
 * @param request - The document request.
 * @returns The sidebar state and platform to render the shell with.
 */
export const readShellRequestHints = (request: Request): ShellRequestHints => ({
  isSidebarOpen: parseSidebarOpen(Cookies.parse(request.headers.get('Cookie') ?? '')[sidebarOpenCookieName]),
  platform: detectRequestPlatform(request.headers),
});

/**
 * Mirror the sidebar's open state into the cookie the next document request carries.
 *
 * @param isOpen - The sidebar's current open state.
 */
export const writeSidebarOpenCookie = (isOpen: boolean): void => {
  if (typeof document === 'undefined') {
    return;
  }
  try {
    const value = isOpen ? '1' : '0';
    if (globalThis.location.protocol === 'https:') {
      Cookies.set(sidebarOpenCookieName, value, { path: '/', sameSite: 'lax', expires: 365, secure: true });
    } else {
      Cookies.set(sidebarOpenCookieName, value, { path: '/', sameSite: 'lax', expires: 365 });
    }
  } catch {
    // The mirror is best-effort; without it the next server render uses the default.
  }
};

/**
 * The shell hints the root loader read for this document. The desktop build has no
 * loader and renders on the client only, so it gets the defaults, as does a render
 * outside a data router (`useRouteLoaderData` would throw there).
 *
 * @returns The sidebar state and platform the server rendered the shell with.
 */
export const useShellRequestHints = (): ShellRequestHints => {
  const rootData = useContext(DataRouterStateContext)?.loaderData['root'] as
    | { readonly shellHints?: ShellRequestHints }
    | undefined;
  return rootData?.shellHints ?? defaultShellHints;
};
