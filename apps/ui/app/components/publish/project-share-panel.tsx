import { ProjectSharePanel as ProjectSharePanelView } from '@taucad/publish-ui/components/publish/project-share-panel';
import type { ProjectSharePanelProps } from '@taucad/publish-ui/components/publish/project-share-panel';
import { ProjectShareServicesProvider } from '@taucad/publish-ui/components/publish/project-share-services';
import type { ProjectShareServices } from '@taucad/publish-ui/components/publish/project-share-services';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { CommercialUpgradeLabel, useCommercialFeatures } from '#cloud/commercial-features.js';
import { githubGistServices } from '#components/share/github-gist-services.js';
import { ENV } from '#environment.config.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { shareProviderRegistry } from '#lib/share-providers.js';

/*
 * Every service is read when it is used, so a suite that mocks one of these modules with only the exports it needs
 * can still load this one.
 */
const projectShareServices: ProjectShareServices = {
  ...githubGistServices,
  shareProviderRegistry: {
    get descriptors() {
      return shareProviderRegistry.descriptors;
    },
    load: async (providerId) => shareProviderRegistry.load(providerId),
  },
  apiBaseUrl: () => ENV.TAU_API_URL,
  useShareMethodPreference: () => {
    const [method, setMethod] = useCookie<unknown>(cookieName.shareProvider, undefined);
    return [method, setMethod] as const;
  },
  useRevisionStatus: () => useRevisionStatus(),
  useRevisionCommands: () => useRevisionCommands(),
  useRevisionClient: () => useRevisionClient(),
  useCommercialFeatures: () => useCommercialFeatures(),
  commercialUpgradeLabel: () => <CommercialUpgradeLabel />,
};

/** `@taucad/publish-ui`'s project share panel with this app's sharing, revision, plan and cookie services. */
export function ProjectSharePanel(properties: ProjectSharePanelProps): React.JSX.Element {
  return (
    <ProjectShareServicesProvider value={projectShareServices}>
      <ProjectSharePanelView {...properties} />
    </ProjectShareServicesProvider>
  );
}
