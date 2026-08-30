import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { getEnvironment } from '#environment.config.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';

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

const createManifest = (name: string, entryPath: string): Omit<ProjectManifest, '$schema' | 'id'> => ({
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
    patchChat,
    setChatUnreadState,
    isLoading,
  } = useProjectManager();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const seedActivityChats = searchParams.get('activity') === '1';
  const [error, setError] = React.useState<string>();
  const seedStarted = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || seedStarted.current) {
      return;
    }
    seedStarted.current = true;

    const seed = async (): Promise<void> => {
      try {
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
          await setChatUnreadState(newerChat.id, true);
          await wait(25);
          await patchChat(olderChat.id, 'name', 'Older activity');
          const scope = globalThis as typeof globalThis & {
            __TAU_CHAT_ACTIVITY_TEST__?: {
              read(): Promise<unknown>;
            };
          };
          scope.__TAU_CHAT_ACTIVITY_TEST__ = {
            async read() {
              const [chats, projectState] = await Promise.all([
                getChatsForResource(projectA.id),
                getProjectLibraryState(projectA.id),
              ]);
              if (!projectState) {
                throw new Error('Project Navigation A has no library state');
              }
              return {
                chats: chats
                  .filter((chat) => chatActivityNames.includes(chat.name as (typeof chatActivityNames)[number]))
                  .sort((left, right) => left.name.localeCompare(right.name)),
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
    getProjectLibraryState,
    isLoading,
    navigate,
    setChatUnreadState,
    patchChat,
    seedActivityChats,
  ]);

  return error ? <div role='alert'>{error}</div> : <Loader />;
};

export default ProjectNavigationDebugRoute;
