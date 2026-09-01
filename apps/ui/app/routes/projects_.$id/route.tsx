import { useParams } from 'react-router';
import { useSelector } from '@xstate/react';
import { toast } from 'sonner';
import type { Route } from './+types/route.js';
import { ChatInterface } from '#routes/projects_.$id/chat-interface.js';
import { ProjectProvider, useProject } from '#hooks/use-project.js';
import type { Handle } from '#types/matches.types.js';
import { ProjectChatRpcBindings } from '#routes/projects_.$id/project-chat-rpc-bindings.js';
import { ProjectNameEditor } from '#routes/projects_.$id/project-name-editor.js';
import { ViewContextProvider } from '#routes/projects_.$id/chat-interface-view-context.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { ProjectCommandPaletteItems } from '#routes/projects_.$id/project-command-items.js';
import { ProjectExportAction } from '#routes/projects_.$id/project-export-action.js';
import { FileManagerProvider, SharedWorkerGate } from '#hooks/use-file-manager.js';
import { ChatRpcSocketProvider } from '#hooks/use-chat-rpc-socket.js';
import { MonacoModelServiceProvider } from '#hooks/use-monaco-model-service.js';
import { useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { useBlockBrowserNavigation } from '#hooks/use-block-browser-navigation.js';
// Chat persistence + draft flush is handled centrally by `<GlobalChatFlushGuard>`
// (see `apps/ui/app/components/global-chat-flush-guard.tsx`). The project
// route only needs to flush its own project + editor machine state below.
import { WebglContextTrackerProvider } from '#hooks/use-webgl-context-tracker.js';
import { debugKernelOptions } from '#constants/kernel-options.presets.js';

// Define provider component at module level for stable reference across HMR
function RouteProvider({ children }: { readonly children?: React.ReactNode }): React.JSX.Element {
  const { id } = useParams();
  return (
    <SharedWorkerGate>
      <FileManagerProvider projectId={id} rootDirectory={`/projects/${id}`} initialBackend='indexeddb'>
        <ChatRpcSocketProvider>
          <WebglContextTrackerProvider>
            <ProjectProvider projectId={id!} kernelOptionsFactory={debugKernelOptions}>
              <MonacoModelServiceProvider>{children}</MonacoModelServiceProvider>
            </ProjectProvider>
          </WebglContextTrackerProvider>
        </ChatRpcSocketProvider>
      </FileManagerProvider>
    </SharedWorkerGate>
  );
}

export const handle: Handle = {
  breadcrumb(match) {
    const { id } = match.params as Route.LoaderArgs['params'];

    return [
      //
      <ProjectNameEditor key={`${id}-project-name-editor`} />,
      // Disabled until publishing is implemented
      // <ChatModeSelector key={`${id}-chat-mode-selector`} />
    ];
  },
  actions() {
    return <ProjectExportAction />;
  },
  commandPalette(match) {
    return <ProjectCommandPaletteItems match={match} />;
  },
  providers: () => RouteProvider,
  enableFloatingSidebar: true,
};

// Chat component - handles keyboard shortcuts. The Socket.IO RPC connection
// is wired up by `<ProjectChatRpcBindings>` once per chatId from the
// app-shell `ChatSessionStore` (RPC join/leave is per-session, not
// per-route — see `apps/ui/app/routes/projects_.$id/project-chat-rpc-bindings.tsx`).
function Chat(): React.JSX.Element {
  useKeybinding(
    {
      key: 's',
      modKey: true,
    },
    () => {
      toast.success('Your project is saved automatically');
    },
  );

  return <ChatInterface />;
}

/**
 * Project route chat composition.
 *
 * - `<ChatInterface>` mounts the full editor layout (viewer, file tree,
 *   parameters, editor, kernel, explorer, details, converter, and the
 *   chat panel) unconditionally. The chat panel itself wraps its
 *   `<ChatHistory>` child in `<ChatHistoryGate>` (see
 *   [`focused-chat-gate.tsx`](./focused-chat-gate.tsx)), which is the
 *   sole owner of `<ActiveChatProvider>` mounting + the
 *   focused-chat skeleton/error UI. This keeps every non-chat pane
 *   independent of the editor machine's chat lifecycle, restoring the
 *   pre-fix elegant load behaviour (placeholder -> opacity fade-in).
 * - `<ProjectChatRpcBindings>` reads chat ids from the app-shell
 *   `ChatSessionStore` directly (no `<ActiveChatProvider>` dependency),
 *   so RPC bindings persist across `focusedChatId` changes and across
 *   `ensureFocusedChatActor` retries — no socket churn on editor-machine
 *   transitions.
 *
 * Persistence + draft `flushNow` is dispatched centrally by
 * `<GlobalChatFlushGuard>` (mounted in `apps/ui/app/root.tsx`) — every
 * live session in the store is fanned out automatically. Project + editor
 * machine flushing remains route-scoped via `FlushOnCloseGuard` below.
 */
function ChatWithProvider(): React.JSX.Element {
  const { projectRef } = useProject();
  const name = useSelector(projectRef, (state) => state.context.project?.name);
  const description = useSelector(projectRef, (state) => state.context.project?.description);

  return (
    <ViewContextProvider>
      {name ? <title>{name}</title> : null}
      {description ? <meta name='description' content={description} /> : null}
      <FlushOnCloseGuard />
      <ProjectChatRpcBindings />
      <Chat />
    </ViewContextProvider>
  );
}

/**
 * Inner component that wires up the flush-on-close handler.
 * Needs to be a child of ProjectProvider to access project + editor refs.
 */
function FlushOnCloseGuard(): React.JSX.Element {
  const { projectRef, editorRef } = useProject();

  useFlushOnClose(() => {
    projectRef.send({ type: 'flushNow' });
  });
  useFlushOnClose(() => {
    editorRef.send({ type: 'flushNow' });
  });

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- Headless component
  return <></>;
}

export default function ChatRoute(): React.JSX.Element {
  useBlockBrowserNavigation();

  return <ChatWithProvider />;
}
