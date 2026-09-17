import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ProjectManifest } from '@taucad/types';
import { Loader } from '#components/ui/loader.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import { getEnvironment } from '#environment.config.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { homeProjectCreationLocation } from '#types/project-creation-location.types.js';
import { projectChatUrl } from '#utils/project-url.utils.js';

/**
 * Seeds one project for the composer-record and attachment proofs
 * (`chat-attachments.spec.ts`, `chat-drafts.spec.ts`).
 *
 * The project renders a real model, so *Capture view to chat* has pixels, and
 * its chat runs on the Anthropic-wire row the gateway fixture speaks, which
 * reads images and PDFs. The seeded ids are kept in `localStorage`, because a
 * reload of the project route must still be able to name the records.
 *
 * - `?chats=2` adds a second chat, *Second chat*.
 * - `?seed=drafts` writes the first chat's record with `toolChoice: 'none'` (the
 *   selector is hidden in the product) and marks the second chat unread.
 */

const encode = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
const seededIdsStorageKey = 'tau:e2e:chat-attachments';
const entryPath = 'main.ts';
const model = `import { makeBaseBox, makeCylinder } from 'replicad';

export default function main() {
  return makeBaseBox(60, 40, 4.5).cut(makeCylinder(3.65, 10).translate([0, 0, -2]));
}
`;

const manifest: Omit<ProjectManifest, '$schema' | 'id'> = {
  name: 'Chat Attachments E2E',
  description: 'Deterministic fixture for composer records and chat attachments.',
  tags: ['e2e', 'chat-attachments'],
  assets: { main: { entryPath } },
};

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown responses for route control flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const ChatAttachmentsDebugRoute = (): React.JSX.Element => {
  const { createProject, createChat, getChatsForResource, patchChat, isLoading } = useProjectManager();
  const { client } = useFileManager();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatCount = searchParams.get('chats') === '2' ? 2 : 1;
  const seedDrafts = searchParams.get('seed') === 'drafts';
  const [error, setError] = React.useState<string>();
  const started = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || started.current) {
      return;
    }
    started.current = true;
    localStorage.removeItem(seededIdsStorageKey);

    const seed = async (): Promise<void> => {
      try {
        const project = await createProject({
          activeKernel: 'replicad',
          activeExecution: { kind: 'tau', model: 'anthropic-claude-haiku-4.5' },
          location: homeProjectCreationLocation,
          editorState: { panelState: { desktopLayout: { chatOpen: true, workbenchOpen: true } } },
          project: manifest,
          files: { [entryPath]: { content: encode(model) } },
        });
        const [first] = await getChatsForResource(project.id);
        if (!first) {
          throw new Error('The fixture project did not create its initial chat.');
        }
        await patchChat(first.id, 'name', 'Attachments chat');
        const chatIds = [first.id];
        if (chatCount === 2) {
          const second = await createChat(project.id, {
            name: 'Second chat',
            messages: [],
            activeExecution: { kind: 'tau', model: 'anthropic-claude-haiku-4.5' },
          });
          chatIds.push(second.id);
        }
        if (seedDrafts) {
          await createComposerRecordStore(client, composerRecordPaths.chat(project.id, first.id)).patch({
            toolChoice: 'none',
          });
          if (chatIds[1]) {
            await createComposerRecordStore(client, composerRecordPaths.unread(project.id)).patch({
              unread: { [chatIds[1]]: true },
            });
          }
        }
        localStorage.setItem(seededIdsStorageKey, JSON.stringify({ projectId: project.id, chatIds }));
        void navigate(projectChatUrl(project.slugs, first.id));
      } catch (seedError) {
        setError(seedError instanceof Error ? seedError.message : String(seedError));
      }
    };
    // async-iife: bootstrap -- React effects cannot await local project seeding.
    void seed();
  }, [chatCount, client, createChat, createProject, getChatsForResource, isLoading, navigate, patchChat, seedDrafts]);

  return error ? <main role='alert'>{error}</main> : <Loader />;
};

export default ChatAttachmentsDebugRoute;
