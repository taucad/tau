/**
 * Opening a Tau Cloud project on this device.
 *
 * Split from `use-cloud-projects.ts` because it needs the project manager and
 * the local library, and the Sync region imports that module's read-only
 * predicate as a value — a heavy import here would be a heavy import there.
 */

import { getProjectFileSystemConfig } from '@taucad/files-ui/filesystem/handle-store';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { projectLibraryUrl, projectUrl } from '@taucad/files-ui/utils/project-url.utils';
import { toast } from '@taucad/ui/components/sonner';
import { assertCloudProjectActive, CloudProjectUnavailableError } from '#hooks/use-cloud-projects.js';
import { tauCloudIntent } from '#lib/tau-cloud-intent.js';
import { withNamedLock } from '#lib/named-lock.js';
import { getRevisionSessionUser } from '#lib/revision-actor.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectRuntimeRootFiles } from '#runtime/app-runtime.js';
import type { AppRuntime } from '#runtime/app-runtime.js';
import type { CreateProjectOptions } from '#runtime/project-library-commands.js';

/**
 * What this device creates for a Tau Cloud project before its first pull: the
 * remote's id and name, no chat and no files — *Open*'s first half, and all
 * that materialize on sign-in (D20) creates.
 *
 * @param entry - The Tau Cloud project.
 * @returns The `createProject` options.
 * @public
 */
export const cloudProjectStub = (entry: CloudProject): CreateProjectOptions => ({
  /* The remote's id, because the id is the repository path there. */
  id: entry.id,
  /* The chats come with the pull (W17), so creating one here would be an empty
     chat nobody asked for that the pull cannot remove and the next push offers
     to the account (review R5). */
  chat: false,
  deferInitialView: true,
  project: {
    name: entry.name,
    description: '',
    tags: [],
    /* A placeholder for one round trip: `tau.json` is versioned, so the
       remote's own manifest — its name and the file it opens with — arrives
       with the open pull and replaces this one. */
    assets: { main: { entryPath: 'main.scad' } },
  },
  files: {},
});

/**
 * Start the project's revision client from the gesture, on the shared file-manager worker its session will use
 * (STO-25 SP6), so the open's salt, `info/refs`, catalogue and indexes load beside the project route's code instead of
 * after its session. The session's `revisions` child adopts the client. Best effort and never awaited: the session
 * opens the client itself whatever happens here. The desktop's revisions are its host's, so nothing starts there.
 *
 * @param runtime - The app runtime, absent outside one.
 * @param project - The project and its workspace slug.
 */
const startOpenEarly = (
  runtime: AppRuntime | undefined,
  project: Readonly<{ projectId: string; workspace: string }>,
): void => {
  const worker =
    runtime === undefined || isDesktopTarget()
      ? undefined
      : selectRuntimeRootFiles(runtime).getSnapshot().context.worker;
  if (worker === undefined) {
    return;
  }
  // async-iife: bootstrap -- the session module loads beside the navigation; the route never waits on it.
  void (async (): Promise<void> => {
    try {
      const { preconnectCloudOpen } = await import('#runtime/session-revisions.js');
      preconnectCloudOpen({ ...project, worker });
    } catch {
      /* The session's own load reports a failed chunk. */
    }
  })();
};

/**
 * Open a Tau Cloud project on this device.
 *
 * Three things in one gesture, none of them new: the project is created locally
 * **under the remote's id**, the `tau` remote is connected through the same
 * worker command the Sync region sends, and W13's open pull materializes the
 * live checkout — files, history, named versions and the `.tau/chats`
 * projection — with no chat turn.
 *
 * A project this device already holds is navigated to instead, which is what an
 * invitation accepted twice lands in; one in its Trash is still held — creating
 * it again would be refused — so the verb says where it is and offers the Trash.
 *
 * @returns The verb, which throws whatever `createProject` throws.
 * @public
 */
export const useOpenCloudProject = (): ((entry: CloudProject) => Promise<void>) => {
  const { projects } = useProjects({ scope: 'all' });
  const { createProject, getProjects } = useProjectManager();
  const navigate = useNavigate();
  const runtime = useOptionalAppRuntime();

  return useCallback(
    async (entry: CloudProject): Promise<void> => {
      const account = getRevisionSessionUser()?.id;
      const held = projects.find((project) => project.id === entry.id);
      if (held?.deletedAt !== undefined) {
        toast.info(`${entry.name} is in Trash on this device`, {
          description: 'Restore it from Trash to open it.',
          action: {
            label: 'Show Trash',
            onClick() {
              void navigate(`${projectLibraryUrl}?trash=1`);
            },
          },
        });
        return;
      }
      if (held?.slugs !== undefined) {
        startOpenEarly(runtime, { projectId: entry.id, workspace: held.slugs.workspaceSlug });
        await navigate(projectUrl(held.slugs));
        return;
      }
      const created = await withNamedLock(`tau:open-cloud-project:${entry.id}`, async () => {
        const heldProjects = await getProjects({ includeDeleted: true });
        const current = heldProjects.find((project) => project.projectId === entry.id);
        if (current?.library.deletedAt !== undefined) {
          throw new Error('Restore this project from Trash before opening it.');
        }
        if (current?.slugs !== undefined) {
          return { slugs: current.slugs };
        }
        await assertCloudProjectActive(entry.id);
        if (getRevisionSessionUser()?.id !== account) {
          throw new Error('Your account changed. Refresh the project before opening it.');
        }
        const previous = tauCloudIntent.get(entry.id);
        tauCloudIntent.set(entry.id, 'open');
        let hasCreated = false;
        try {
          const created = await createProject(cloudProjectStub(entry));
          hasCreated = true;
          await assertCloudProjectActive(entry.id);
          if (getRevisionSessionUser()?.id !== account) {
            throw new Error('Your account changed. Refresh the project before opening it.');
          }
          return created;
        } catch (error) {
          if (error instanceof CloudProjectUnavailableError) {
            if (getRevisionSessionUser()?.id === account && tauCloudIntent.get(entry.id) === 'open') {
              tauCloudIntent.set(entry.id, undefined);
            }
            throw error;
          }
          if (hasCreated) {
            // A network failure after creation still owes the first download.
            throw error;
          }
          // Creation can fail after persisting its root. Preserve the pending marker
          // so the next open never treats that partial stub as a usable checkout.
          const mayBeMaterialized = await getProjectFileSystemConfig(entry.id).then(
            (config) => config !== undefined,
            () => true,
          );
          if (getRevisionSessionUser()?.id === account && tauCloudIntent.get(entry.id) === 'open') {
            tauCloudIntent.set(entry.id, mayBeMaterialized ? 'open' : previous);
          }
          throw error;
        }
      });
      /* The intent carries the gesture across navigation: the project's own
         session records and opens the remote. Its revision client is the one
         per project on the shared worker, so starting it here (STO-25 SP6) is
         the same client the session adopts, not a second root. */
      startOpenEarly(runtime, { projectId: entry.id, workspace: created.slugs.workspaceSlug });
      await navigate(projectUrl(created.slugs));
    },
    [createProject, getProjects, navigate, projects, runtime],
  );
};
