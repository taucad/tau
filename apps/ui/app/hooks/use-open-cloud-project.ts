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
import { withNamedLock } from '@taucad/ui-core/lib/named-lock';
import { getRevisionSessionUser } from '@taucad/revisions-ui/lib/revision-actor';
import { reportUiError } from '#lib/error-reporting.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { useOptionalAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectRuntimeOpenAhead } from '#runtime/app-runtime.js';
import type { AppRuntime } from '#runtime/app-runtime.js';
import type { CreateProjectOptions } from '@taucad/files-ui/runtime/project-library-commands';

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
 * Navigate to the project, with its open started first (STO-25 SP6): the registry's early open connects the project's
 * revision client, and its Tau Cloud open when one is owed, while the route's code loads; the project's session takes
 * both. A navigation that fails releases it. Outside an app runtime it navigates alone.
 *
 * @param input - The runtime, the project, its slugs, whether the gesture asserted it active, and the navigation.
 */
const navigateWithOpenAhead = async (
  input: Readonly<{
    runtime: AppRuntime | undefined;
    projectId: string;
    slugs: Readonly<{ workspaceSlug: string; projectSlug: string }>;
    asserted: boolean;
    navigate: () => Promise<void>;
  }>,
): Promise<void> => {
  const { runtime, projectId, slugs, asserted, navigate } = input;
  /* Best effort: whatever the early open does, the click navigates, and the session opens the project itself. */
  let release: (() => void) | undefined;
  try {
    release =
      runtime === undefined
        ? undefined
        : selectRuntimeOpenAhead(runtime)({ projectId, slugs, ...(asserted ? { asserted: true } : {}) });
  } catch (error) {
    console.error('[revisions] the open could not start ahead of its route:', error);
    void reportUiError(error);
  }
  try {
    await navigate();
  } catch (error) {
    release?.();
    throw error;
  }
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
        const { slugs } = held;
        await navigateWithOpenAhead({
          runtime,
          projectId: entry.id,
          slugs,
          asserted: false,
          navigate: async () => navigate(projectUrl(slugs)),
        });
        return;
      }
      const created = await withNamedLock(`tau:open-cloud-project:${entry.id}`, async () => {
        const heldProjects = await getProjects({ includeDeleted: true });
        const current = heldProjects.find((project) => project.projectId === entry.id);
        if (current?.library.deletedAt !== undefined) {
          throw new Error('Restore this project from Trash before opening it.');
        }
        if (current?.slugs !== undefined) {
          return { slugs: current.slugs, asserted: false };
        }
        await assertCloudProjectActive(entry.id);
        if (getRevisionSessionUser()?.id !== account) {
          throw new Error('You’re signed in to a different account now. Open the project again.');
        }
        const previous = tauCloudIntent.get(entry.id);
        tauCloudIntent.set(entry.id, 'open');
        let hasCreated = false;
        try {
          const created = await createProject(cloudProjectStub(entry));
          hasCreated = true;
          await assertCloudProjectActive(entry.id);
          if (getRevisionSessionUser()?.id !== account) {
            throw new Error('You’re signed in to a different account now. Open the project again.');
          }
          /* Asserted active just now, after its stub was created: the early open need not ask again. */
          return { slugs: created.slugs, asserted: true };
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
      /* The intent carries the gesture across navigation; the registry's early
         open starts the project's client and its Tau remote on the shared
         worker its session uses, so the session takes the same connection
         (STO-25 SP6) instead of a second root. */
      await navigateWithOpenAhead({
        runtime,
        projectId: entry.id,
        slugs: created.slugs,
        asserted: created.asserted,
        navigate: async () => navigate(projectUrl(created.slugs)),
      });
    },
    [createProject, getProjects, navigate, projects, runtime],
  );
};
