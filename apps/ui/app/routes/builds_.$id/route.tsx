import { useParams } from 'react-router';
import { useSelector } from '@xstate/react';
import { toast } from 'sonner';
import type { Route } from './+types/route.js';
import { ChatInterface } from '#routes/builds_.$id/chat-interface.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import type { Handle } from '#types/matches.types.js';
import { useChatConstants } from '#utils/chat.utils.js';
import { ChatProvider } from '#hooks/use-chat.js';
import { BuildNameEditor } from '#routes/builds_.$id/build-name-editor.js';
import { ViewContextProvider } from '#routes/builds_.$id/chat-interface-view-context.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { BuildCommandPaletteItems } from '#routes/builds_.$id/build-command-items.js';
import { ChatModeSelector } from '#routes/builds_.$id/chat-mode-selector.js';
import { FileManagerProvider } from '#hooks/use-file-manager.js';
import { useChatTools } from '#hooks/use-chat-tools.js';

// Define provider component at module level for stable reference across HMR
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { id } = useParams();
  return (
    <FileManagerProvider rootDirectory={`/builds/${id}`}>
      <BuildProvider buildId={id!}>{children}</BuildProvider>
    </FileManagerProvider>
  );
}

export const handle: Handle = {
  breadcrumb(match) {
    const { id } = match.params as Route.LoaderArgs['params'];

    return [<BuildNameEditor key={`${id}-build-name-editor`} />, <ChatModeSelector key={`${id}-chat-mode-selector`} />];
  },
  commandPalette(match) {
    return <BuildCommandPaletteItems match={match} />;
  },
  providers: () => RouteProvider,
  enableFloatingSidebar: true,
};

// Chat component - simplified since ChatProvider handles loading/persistence
function Chat(): React.JSX.Element {
  useKeydown(
    {
      key: 's',
      metaKey: true,
    },
    () => {
      toast.success('Your build is saved automatically');
    },
  );

  return <ChatInterface />;
}

// Wrapper component that has access to build context and can configure ChatProvider
function ChatWithProvider(): React.JSX.Element {
  const { buildId, buildRef } = useBuild();
  const name = useSelector(buildRef, (state) => state.context.build?.name);
  const description = useSelector(buildRef, (state) => state.context.build?.description);
  const activeChatId = useSelector(buildRef, (state) => state.context.build?.lastChatId);

  // Get chat tools handler
  const { onToolCall } = useChatTools();

  return (
    <ViewContextProvider>
      <ChatProvider value={{ ...useChatConstants, onToolCall }} chatId={activeChatId} resourceId={buildId}>
        {name ? <title>{name}</title> : null}
        {description ? <meta name="description" content={description} /> : null}
        <Chat />
      </ChatProvider>
    </ViewContextProvider>
  );
}

export default function ChatRoute(): React.JSX.Element {
  return <ChatWithProvider />;
}
