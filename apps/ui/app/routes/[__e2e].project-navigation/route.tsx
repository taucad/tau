import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '@taucad/ui/components/loader';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import {
  parseProjectOpenFixtureOptions,
  projectOpenOtherFiles,
  projectOpenOtherManifest,
  projectOpenSeedReceiptKey,
  projectOpenTargetFiles,
  projectOpenTargetManifest,
  projectOpenTargetSourceSha256,
} from '#routes/[__e2e].project-navigation/project-open-fixture.js';

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const alphaEntryPath = 'alpha.ts';
const betaEntryPath = 'beta.ts';
const chatActivityNames = ['Older activity', 'Newer activity'] as const;
const wait = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};
const model = (width: number): string => `import { makeBaseBox } from 'replicad';

export default function main() {
  return makeBaseBox(${width}, 12, 6);
}
`;

const createManifest = (name: string, entryPath: string): Omit<ProjectManifest, '$schema'> => ({
  name,
  description: 'Deterministic project-navigation lifecycle fixture.',
  tags: ['e2e', 'navigation'],
  assets: { main: { entryPath } },
});

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown responses for route control flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const ProjectNavigationDebugRoute = (): React.JSX.Element => {
  const {
    createProject,
    createChat,
    getChatsForResource,
    getProjectLibraryState,
    getProjectListing,
    patchChat,
    isLoading,
  } = useProjectManager();
  const { recordFiles } = useFileManager();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const seedActivityChats = searchParams.get('activity') === '1';
  const seedProjectOpen = searchParams.get('projectOpen') === '1';
  const [error, setError] = React.useState<string>();
  const seedStarted = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    const seed = async (): Promise<void> => {
      try {
        if (seedProjectOpen) {
          const options = parseProjectOpenFixtureOptions(searchParams);
          sessionStorage.removeItem(projectOpenSeedReceiptKey);
          const before = await getProjectListing({ includeDeleted: true });
          if (before.projects.length > 0 || before.conflicts.length > 0 || before.recoveries.length > 0) {
            throw new Error('Project-open fixture requires an empty project catalog.');
          }
          const target = await createProject({
            activeKernel: 'replicad',
            location: homeProjectCreationLocation,
            editorState: {
              panelState: {
                desktopLayout: { chatOpen: true, workbenchOpen: true },
              },
            },
            project: projectOpenTargetManifest(),
            files: projectOpenTargetFiles(options),
          });
          /* oxlint-disable no-await-in-loop -- Each production create commits before the next catalog entry is seeded. */
          for (let index = 1; index < options.totalProjects; index += 1) {
            await createProject({
              activeKernel: 'replicad',
              location: homeProjectCreationLocation,
              chat: false,
              deferInitialView: true,
              project: projectOpenOtherManifest(index),
              files: projectOpenOtherFiles(),
            });
          }
          /* oxlint-enable no-await-in-loop */
          const listing = await getProjectListing({ includeDeleted: true });
          if (
            listing.projects.length !== options.totalProjects ||
            !listing.projects.some((project) => project.projectId === target.id) ||
            listing.conflicts.length > 0
          ) {
            throw new Error('Project-open fixture did not publish the requested valid catalog.');
          }
          const targetUrl = projectUrl(target.slugs);
          sessionStorage.setItem(
            projectOpenSeedReceiptKey,
            JSON.stringify({
              schemaVersion: 1,
              totalProjects: options.totalProjects,
              targetFileCount: options.targetFileCount,
              layout: options.layout,
              targetProjectId: target.id,
              targetUrl,
              targetSourceSha256: await projectOpenTargetSourceSha256(),
            }),
          );
          void navigate(targetUrl);
          return;
        }
        const projectA = await createProject({
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          editorState: {
            panelState: {
              desktopLayout: { chatOpen: true, workbenchOpen: true },
            },
          },
          project: createManifest('Project Navigation A', alphaEntryPath),
          files: { [alphaEntryPath]: { content: encode(model(18)) } },
        });
        if (seedActivityChats) {
          const [olderChat] = await getChatsForResource(projectA.id);
          if (!olderChat) {
            throw new Error('Project Navigation A did not create its initial chat');
          }
          await wait(25);
          const newerChat = await createChat(projectA.id, { name: 'Newer activity', messages: [] });
          // Unread lives in the project's composer unread record, which the chat-session store restores on bind (D9).
          const unreadRecord = createComposerRecordStore(recordFiles, composerRecordPaths.unread(projectA.id));
          await unreadRecord.patch({ unread: { [newerChat.id]: true } });
          await wait(25);
          await patchChat(olderChat.id, 'name', 'Older activity');
          const scope = globalThis as typeof globalThis & {
            __TAU_CHAT_ACTIVITY_TEST__?: {
              read(): Promise<unknown>;
            };
          };
          scope.__TAU_CHAT_ACTIVITY_TEST__ = {
            async read() {
              const [chats, projectState, unreadRead] = await Promise.all([
                getChatsForResource(projectA.id),
                getProjectLibraryState(projectA.id),
                unreadRecord.read(),
              ]);
              const unread = unreadRead.status === 'valid' ? (unreadRead.record.unread ?? {}) : {};
              if (!projectState) {
                throw new Error('Project Navigation A has no library state');
              }
              return {
                chats: chats
                  .filter((chat) => chatActivityNames.includes(chat.name as (typeof chatActivityNames)[number]))
                  .sort((left, right) => left.name.localeCompare(right.name))
                  .map((chat) => ({ ...chat, unread: unread[chat.id] === true })),
                projectLastActivityAt: projectState.lastActivityAt,
              };
            },
          };
        }
        await createProject({
          activeKernel: 'replicad',
          location: homeProjectCreationLocation,
          editorState: {
            panelState: {
              desktopLayout: { chatOpen: true, workbenchOpen: true },
            },
          },
          project: createManifest('Project Navigation B', betaEntryPath),
          files: { [betaEntryPath]: { content: encode(model(28)) } },
        });
        void navigate(projectUrl(projectA.slugs));
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };
    void seed();
  }, [
    createChat,
    createProject,
    getChatsForResource,
    recordFiles,
    getProjectLibraryState,
    getProjectListing,
    isLoading,
    navigate,
    patchChat,
    seedActivityChats,
    seedProjectOpen,
    searchParams,
  ]);

  return error ? <div role='alert'>{error}</div> : <Loader />;
};

export default ProjectNavigationDebugRoute;
