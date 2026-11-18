import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ShareProvider, ShareProviderContext } from '@taucad/share/provider';

/** Where GitHub sends the person back after a Gist grant: the share page, or the editor with Share open. */
export type GithubGistAuthorizationSurface = 'editor' | 'share-page';

/** The signed-in account's Gist access, or `signed-out` when there is no Tau session. */
export type GithubGistConnectionStatus =
  | 'connected'
  | 'permission-required'
  | 'not-connected'
  | 'reconnect-required'
  | 'disabled'
  | 'signed-out';

/** The OAuth fields a Gist grant left on the return URL, with the rest of the search kept. */
export type GithubGistAuthorizationReturn = {
  readonly outcome: 'returned' | 'cancelled' | 'failed';
  /** What went wrong, when the grant failed. */
  readonly failure?: string;
  readonly remainingSearch: string;
};

/**
 * The app services the Gist management controls use, typed structurally so this library imports none of the app.
 *
 * The functions are the app's `lib/share-providers` Gist helpers; the two hooks are the app's `useAuthLinks` and
 * `useSettingsDialog`, narrowed to the parts used here.
 */
export type GithubGistServices = Readonly<{
  getGithubGistConnectionStatus: () => Promise<GithubGistConnectionStatus>;
  /** Starts the Gist grant; `system-browser` means the desktop handed it to the browser and this page waits. */
  connectGithubGist: (input: {
    readonly returnUrl: string;
    readonly surface: GithubGistAuthorizationSurface;
  }) => Promise<'redirect' | 'system-browser'>;
  /** Resolves `true` once access granted in the system browser reaches this session, `false` on timeout or abort. */
  awaitGithubGistConnection: (signal: AbortSignal) => Promise<boolean>;
  parseGithubGistAuthorizationReturn: (search: string) => GithubGistAuthorizationReturn | undefined;
  shareProviderRegistry: Readonly<{ load: (providerId: string) => Promise<ShareProvider> }>;
  /** Runs `operation` with a browser share-provider context and disposes the context afterwards. */
  withBrowserShareProviderContext: <Result>(
    operation: (context: ShareProviderContext) => Promise<Result>,
  ) => Promise<Result>;
  useAuthLinks: (options: { readonly redirectTo: string }) => Readonly<{ signIn: string }>;
  useSettingsDialog: () => Readonly<{ open: (section: 'security', target: 'github-permissions') => void }>;
}>;

const GithubGistServicesContext = createContext<GithubGistServices | undefined>(undefined);

/**
 * Supplies the app's Gist services to {@link useGithubGistServices}. The app renders it where it mounts the Gist
 * management controls.
 *
 * @param props - `value`: the services; keep it stable (a module constant) so readers do not re-render.
 */
export function GithubGistServicesProvider({
  value,
  children,
}: Readonly<{ value: GithubGistServices; children: ReactNode }>): ReactNode {
  return <GithubGistServicesContext.Provider value={value}>{children}</GithubGistServicesContext.Provider>;
}

/**
 * The app's Gist services.
 *
 * @returns The services the nearest {@link GithubGistServicesProvider} supplies.
 * @throws When no provider is mounted.
 */
export function useGithubGistServices(): GithubGistServices {
  const services = useContext(GithubGistServicesContext);
  if (services === undefined) {
    throw new Error('useGithubGistServices must be used within a GithubGistServicesProvider');
  }

  return services;
}
