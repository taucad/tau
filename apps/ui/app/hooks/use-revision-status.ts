/**
 * The page's revision clients, bound to this app's services, and the hooks that read them.
 *
 * The client itself — the worker port, the desktop host's channel, the GitHub
 * credential leases and the command surface — is `@taucad/revisions-ui`'s. What
 * only this app can reach is handed in here, once: the API origin from
 * `window.ENV`, the GitHub connections API, the desktop agent host, error
 * reporting and the page's telemetry consent. The hooks stay beside it because
 * they read this app's project and file-manager providers and its cloud
 * projects listing.
 */

import { useMemo } from 'react';
import { useSelector } from '@xstate/react';
import { isDesktopTarget } from '@taucad/files-ui/filesystem/desktop-bridge';
import type { RevisionStatusProjection } from '@taucad/revisions';
import {
  createRevisionClients,
  useRevisionClientStatus as useClientStatus,
} from '@taucad/revisions-ui/hooks/use-revision-status';
import type { RevisionCommands } from '@taucad/revisions-ui/hooks/use-revision-status';
import { createRevisionToastReporter } from '@taucad/revisions-ui/lib/revision-failure-reporting';
import type { RevisionClient } from '@taucad/revisions-ui/types/revision-client.types';
import { requireClientEnvironmentUrl } from '#environment.config.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectAccessRole } from '#hooks/use-cloud-projects.js';
import type { ProjectAccessRole } from '#hooks/use-cloud-projects.js';
import { GithubRequestError, githubConnections, githubErrorMessage } from '#lib/github-connections.js';
import { desktopWorkspaceRoot, openAgentHostChannel } from '#lib/agent-host-placement.js';
import { reportUiError } from '#lib/error-reporting.js';
import { pageTelemetry } from '#telemetry/runtime-telemetry.js';

/* Every service is read when it is used, so a module mock or a stubbed `window.ENV` is seen as it stands then. */
const revisionClients = createRevisionClients({
  hostServesRevisions: () => isDesktopTarget,
  apiBaseUrl: () => requireClientEnvironmentUrl('TAU_API_URL'),
  github: {
    token: async (connectionId, input) => githubConnections.token(connectionId, input),
    connections: async () => githubConnections.list(),
    failureStatus: (error) => (error instanceof GithubRequestError ? error.status : undefined),
    errorMessage: (error) => githubErrorMessage(error),
  },
  openDesktopChannel: async (projectId) =>
    openAgentHostChannel('desktop', { projectId, workspaceRoot: await desktopWorkspaceRoot(projectId) }),
  reportToast: createRevisionToastReporter(async (error, details) => reportUiError(error, details)),
  telemetry: () => pageTelemetry(),
});

/** Build the renderer half of a host-owned native revision root. @public */
export const { createHostRevisionClient } = revisionClients;

/**
 * Open (or reuse) this project's connection to the worker revision root.
 *
 * @public
 */
export const { getRevisionClient } = revisionClients;

/**
 * The commands one client accepts, outside any project's React subtree: the *Open* gesture's early connection
 * (STO-25 SP6) sends the same verbs `useRevisionCommands` does.
 *
 * @param client - The project's client.
 * @param projectId - Its project.
 * @returns The command surface.
 * @public
 */
export const revisionCommandsFor = (client: RevisionClient, projectId: string): RevisionCommands =>
  revisionClients.revisionCommands(client, projectId);

/** Test-only access to the module's client table; not exported from a barrel. @internal */
export const { revisionClientTestApi } = revisionClients;

/**
 * What this account may do with the open project on Tau Cloud (D27).
 *
 * `GET /v1/projects` is the only place a client learns it, and the listing is
 * the one the library already reads — a role shown in the Sync region is the
 * same row the library labels, from one cache key.
 *
 * `undefined` is the honest answer for a project Tau Cloud does not list for
 * this account: signed out, offline, never backed up, or somebody else's. Every
 * surface it gates folds away rather than guessing, and the API refuses each of
 * them again on its own.
 *
 * @returns The role held, or `undefined`.
 * @public
 */
export const useProjectRole = (): ProjectAccessRole | undefined => {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  /* N3: only a Tau remote has a cloud project that can hold a role, so a
     GitHub-backed or unconnected project never makes the listing request.
     `connected`, because `kind` is assigned the moment *Connect* is pressed and
     the project is only registered on the way there. */
  return useProjectAccessRole(projectId, status?.remote.kind === 'tau' && status.remote.phase === 'connected');
};

/**
 * This project's client, or `undefined` before the worker is connected.
 *
 * @returns The client, once the file-manager has a worker.
 * @public
 */
export const useRevisionClient = (): RevisionClient | undefined => {
  const { projectId } = useProject();
  const { fileManagerRef } = useFileManager();
  const worker = useSelector(fileManagerRef, (state) => state.context.worker);
  return useMemo(
    () => (worker === undefined ? undefined : getRevisionClient({ projectId, worker })),
    [projectId, worker],
  );
};

/**
 * One client's revision projection, or `undefined` before its root has answered.
 *
 * @param client - The client, or `undefined` before the worker is connected.
 * @returns The projection.
 * @public
 */
export const useRevisionClientStatus = (client: RevisionClient | undefined): RevisionStatusProjection | undefined =>
  useClientStatus(client);

/** The current project's revision projection. @public */
export const useRevisionStatus = (): RevisionStatusProjection | undefined =>
  useRevisionClientStatus(useRevisionClient());

/**
 * The commands this project's revision root accepts.
 *
 * One hook rather than one per verb: they are the same machine's events, and a
 * caller that holds one holds them all.
 *
 * @returns The command surface; every verb is a no-op before the root connects.
 * @public
 */
export const useRevisionCommands = (): RevisionCommands => {
  const client = useRevisionClient();
  const { projectId } = useProject();
  return useMemo(() => revisionClients.revisionCommands(client, projectId), [client, projectId]);
};
