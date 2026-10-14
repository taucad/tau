/**
 * Opening a Tau Cloud project on this device.
 *
 * Split from `use-cloud-projects.ts` because it needs the project manager and
 * the local library, and the Sync region imports that module's read-only
 * predicate as a value — a heavy import here would be a heavy import there.
 */

import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { projectLibraryUrl, projectUrl } from '#utils/project-url.utils.js';
import { toast } from '#components/ui/sonner.js';
import { tauCloudIntent, withNamedLock } from '#hooks/use-cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import type { CreateProjectOptions } from '#hooks/use-project-manager.js';

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
  const { projects } = useProjects({ includeDeleted: true });
  const { createProject, getProjects } = useProjectManager();
  const navigate = useNavigate();

  return useCallback(
    async (entry: CloudProject): Promise<void> => {
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
        await navigate(projectUrl(held.slugs));
        return;
      }
      const created = await withNamedLock(`tau:open-cloud-project:${entry.id}`, async () => {
        const heldProjects = await getProjects({ includeDeleted: true });
        const current = heldProjects.find((project) => project.manifest.id === entry.id);
        if (current?.library.deletedAt !== undefined) {
          throw new Error('Restore this project from Trash before opening it.');
        }
        if (current?.slugs !== undefined) {
          return { slugs: current.slugs };
        }
        const previous = tauCloudIntent.get(entry.id);
        tauCloudIntent.set(entry.id, 'open');
        try {
          return await createProject(cloudProjectStub(entry));
        } catch (error) {
          // Creation can fail after persisting its root. Preserve the pending marker
          // so the next open never treats that partial stub as a usable checkout.
          const mayBeMaterialized = await getProjectFileSystemConfig(entry.id).then(
            (config) => config !== undefined,
            () => true,
          );
          tauCloudIntent.set(entry.id, mayBeMaterialized ? 'open' : previous);
          throw error;
        }
      });
      /* The library owns the root file-manager worker, while the project route
         owns a project-scoped worker. Carry the gesture across navigation so
         the owning worker records and opens the remote; sending it here loses
         the command when the project client replaces the root client. */
      await navigate(projectUrl(created.slugs));
    },
    [createProject, getProjects, navigate, projects],
  );
};
