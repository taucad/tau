import { createContext, useContext } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { ParsedPublication } from '#components/share/parsed-publication.js';
import type { PublicationLockAuthLinks } from '#components/share/publication-lock-screen.js';

/** What the publication viewer hands the app's workbench: the published project, its files and its surroundings. */
export type SharedPublicationWorkbenchProps = {
  readonly shouldTrackView?: boolean;
  readonly projectId: string;
  readonly kernel?: string;
  readonly publication: ParsedPublication;
  readonly hydratedFiles: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  readonly archive?: Uint8Array<ArrayBuffer>;
  readonly shareUrl?: string;
  readonly sourceLabel?: string;
  readonly managementActions?: ReactNode;
};

/**
 * The app services the publication viewer uses, typed structurally so this library imports none of the app.
 *
 * The workbench, the worker gate and the error page are the app's own components; `useAuthLinks` and `useSession` are
 * its hooks, narrowed to the parts used here.
 */
export type PublicationViewerServices = Readonly<{
  /** The app's shared-project workbench; the viewer suspends while it loads. */
  sharedProjectWorkbench: ComponentType<SharedPublicationWorkbenchProps>;
  /** Mounts its children once the page's file-manager worker is ready. */
  workerGate: ComponentType<{ readonly children: ReactNode }>;
  /** The app's generic error page, for a route error that is not a publication lock. */
  errorPage: ComponentType;
  /** Auth links that return to the page they are shown on. */
  useAuthLinks: () => PublicationLockAuthLinks;
  /** The Tau session: `data` is set when someone is signed in. */
  useSession: () => Readonly<{ data?: unknown; isPending: boolean }>;
}>;

const PublicationViewerServicesContext = createContext<PublicationViewerServices | undefined>(undefined);

/**
 * Supplies the app's services to the publication viewer. The app renders it around each viewer export it mounts.
 *
 * @param props - `value`: the services; keep it stable (a module constant) so readers do not re-render.
 */
export function PublicationViewerServicesProvider({
  value,
  children,
}: Readonly<{ value: PublicationViewerServices; children: ReactNode }>): ReactNode {
  return (
    <PublicationViewerServicesContext.Provider value={value}>{children}</PublicationViewerServicesContext.Provider>
  );
}

/**
 * The app's publication viewer services.
 *
 * @returns The services the nearest {@link PublicationViewerServicesProvider} supplies.
 * @throws When no provider is mounted.
 */
export function usePublicationViewerServices(): PublicationViewerServices {
  const services = useContext(PublicationViewerServicesContext);
  if (services === undefined) {
    throw new Error('usePublicationViewerServices must be used within a PublicationViewerServicesProvider');
  }

  return services;
}
