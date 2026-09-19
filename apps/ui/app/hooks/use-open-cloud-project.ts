/**
 * Opening a Tau Cloud project on this device.
 *
 * Split from `use-cloud-projects.ts` because it needs the project manager and
 * the local library, and the Sync region imports that module's read-only
 * predicate as a value — a heavy import here would be a heavy import there.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useProjects } from '#hooks/use-projects.js';
import { projectUrl } from '#utils/project-url.utils.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';

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
 * invitation accepted twice lands in.
 *
 * @returns The verb, which throws whatever `createProject` throws.
 * @public
 */
export const useOpenCloudProject = (): ((entry: CloudProject) => Promise<void>) => {
  const { projects } = useProjects();
  const { createProject } = useProjectManager();
  const navigate = useNavigate();

  return useCallback(
    async (entry: CloudProject): Promise<void> => {
      const held = projects.find((project) => project.id === entry.id);
      if (held?.slugs !== undefined) {
        await navigate(projectUrl(held.slugs));
        return;
      }
      const created = await createProject({
        id: entry.id,
        /* The chats come with the pull (W17), so creating one here would be an
           empty chat nobody asked for that the pull cannot remove and the next
           push offers to the account (review R5). */
        chat: false,
        project: {
          name: entry.name,
          description: '',
          tags: [],
          /* A placeholder for one round trip: `tau.json` is versioned, so the
             remote's own manifest — its name and the file it opens with —
             arrives with the open pull and replaces this one. */
          assets: { main: { entryPath: 'main.scad' } },
        },
        files: {},
      });
      /* The library owns the root file-manager worker, while the project route
         owns a project-scoped worker. Carry the gesture across navigation so
         the owning worker records and opens the remote; sending it here loses
         the command when the project client replaces the root client. */
      await navigate(`${projectUrl(created.slugs)}?cloudOpen=tau`, { state: { openFromTauCloud: true } });
    },
    [createProject, navigate, projects],
  );
};
