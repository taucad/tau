import { createContext, useContext } from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { PublishDraft, RevisionDivergence, RevisionStatusProjection } from '@taucad/revisions';
import type { ShareProviderDescriptor } from '@taucad/share/provider';
import type { GithubGistServices } from '#components/share/github-gist-services.js';

/**
 * The app services the project share panel uses, typed structurally so this library imports none of the app.
 *
 * It extends the Gist services (the panel provides them to the Gist management controls it mounts) with the provider
 * registry's descriptors, the API base, the remembered sharing method, the revision hooks and the plan's commercial
 * features. Every hook is the app's own, narrowed to the parts used here.
 */
export type ProjectShareServices = GithubGistServices &
  Readonly<{
    shareProviderRegistry: GithubGistServices['shareProviderRegistry'] &
      Readonly<{ descriptors: readonly ShareProviderDescriptor[] }>;
    /** The Tau API origin, read when the cloud link body mounts. */
    apiBaseUrl: () => string;
    /** The sharing method this person chose last time (R8), unvalidated, and its setter. */
    useShareMethodPreference: () => readonly [unknown, (method: string) => void];
    /** The project's revision projection, `undefined` before the worker answers. */
    useRevisionStatus: () => RevisionStatusProjection | undefined;
    /** The publish verbs of the project's revision root. */
    useRevisionCommands: () => Readonly<{
      publishProject: (tag?: string, revisionId?: string) => void;
      confirmPublish: (draft: PublishDraft) => void;
      resetPublish: () => void;
    }>;
    /** The project's revision client, read for how far the published revision is behind the head of `main`. */
    useRevisionClient: () =>
      | Readonly<{ divergence: (head: string, base: string) => Promise<RevisionDivergence> }>
      | undefined;
    /**
     * The plan, resolved or not (adaptive app deployment mode C1): an unresolved plan has no capability to read, so
     * the panel keeps the person's choice and lets the API decide.
     */
    useCommercialFeatures: () =>
      | Readonly<{ isResolved: true; canCreatePrivateShares: boolean; requestUpgrade: () => void }>
      | Readonly<{ isResolved: false }>;
    /** The plan upgrade affordance's label; renders nothing where nothing is sold. */
    commercialUpgradeLabel: ComponentType;
  }>;

const ProjectShareServicesContext = createContext<ProjectShareServices | undefined>(undefined);

/**
 * Supplies the app's services to the project share panel. The app renders it where it mounts the panel.
 *
 * @param props - `value`: the services; keep it stable (a module constant) so readers do not re-render.
 */
export function ProjectShareServicesProvider({
  value,
  children,
}: Readonly<{ value: ProjectShareServices; children: ReactNode }>): ReactNode {
  return <ProjectShareServicesContext.Provider value={value}>{children}</ProjectShareServicesContext.Provider>;
}

/**
 * The app's project share services.
 *
 * @returns The services the nearest {@link ProjectShareServicesProvider} supplies.
 * @throws When no provider is mounted.
 */
export function useProjectShareServices(): ProjectShareServices {
  const services = useContext(ProjectShareServicesContext);
  if (services === undefined) {
    throw new Error('useProjectShareServices must be used within a ProjectShareServicesProvider');
  }

  return services;
}
