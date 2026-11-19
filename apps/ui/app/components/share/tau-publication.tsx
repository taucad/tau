import { lazy } from 'react';
import type { ComponentProps } from 'react';
import { useSession } from '@better-auth-ui/react';
import {
  createPublicationLoader,
  PublicationErrorBoundary as PublicationErrorBoundaryView,
  PublicationInteractiveSurface as PublicationInteractiveSurfaceView,
  PublicationViewRoute as PublicationViewRouteView,
} from '@taucad/publish-ui/components/share/tau-publication';
import { PublicationViewerServicesProvider } from '@taucad/publish-ui/components/share/publication-viewer-services';
import type { PublicationViewerServices } from '@taucad/publish-ui/components/share/publication-viewer-services';
import { ErrorPage } from '#components/error-page.js';
import { getEnvironment } from '#environment.config.js';
import { useAuthLinks } from '#hooks/use-auth-links.js';
import { SharedWorkerGate } from '#hooks/use-file-manager.js';
import { authClient } from '#lib/auth-client.js';

const SharedProjectWorkbench = lazy(async () => {
  const module = await import('#components/share/shared-project-workbench.js');
  return { default: module.SharedProjectWorkbench };
});

/* Every service is read when it is used, so a suite that mocks one of these modules can still load this one. */
const publicationViewerServices: PublicationViewerServices = {
  sharedProjectWorkbench: SharedProjectWorkbench,
  workerGate: ({ children }) => <SharedWorkerGate>{children}</SharedWorkerGate>,
  errorPage: () => <ErrorPage />,
  useAuthLinks: () => useAuthLinks(),
  useSession: () => useSession(authClient),
};

/** `@taucad/publish-ui`'s cloud link loader, reading the API origin from this app's environment. */
export const loadPublication = createPublicationLoader(async () => {
  const environment = await getEnvironment();
  return environment.TAU_API_URL;
});

/**
 * The publication's interactive surface with this app's workbench and auth links.
 *
 * @param properties - The surface's properties.
 * @returns The surface.
 */
export const PublicationInteractiveSurface = (
  properties: ComponentProps<typeof PublicationInteractiveSurfaceView>,
): React.JSX.Element => (
  <PublicationViewerServicesProvider value={publicationViewerServices}>
    <PublicationInteractiveSurfaceView {...properties} />
  </PublicationViewerServicesProvider>
);

export default function PublicationViewRoute(): React.JSX.Element {
  return (
    <PublicationViewerServicesProvider value={publicationViewerServices}>
      <PublicationViewRouteView />
    </PublicationViewerServicesProvider>
  );
}

export function ErrorBoundary(): React.JSX.Element {
  return (
    <PublicationViewerServicesProvider value={publicationViewerServices}>
      <PublicationErrorBoundaryView />
    </PublicationViewerServicesProvider>
  );
}
