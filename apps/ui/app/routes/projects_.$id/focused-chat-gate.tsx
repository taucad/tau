import { useCallback, useEffect, useState } from 'react';
import { useSelector } from '@xstate/react';
import { Skeleton } from '#components/ui/skeleton.js';
import { Button } from '#components/ui/button.js';
import { useProject } from '#hooks/use-project.js';
import { ActiveChatProvider } from '#hooks/active-chat-provider.js';

/**
 * Renders a low-fidelity placeholder shaped like the chat panel chrome
 * (header bar -> scrolling message stubs -> textarea footer) while the
 * editor machine is running `ensureFocusedChatActor` to re-establish the
 * focused-chat invariant at runtime (e.g. after the user deletes the
 * last chat).
 *
 * Scoped to the chat pane only — every other pane in
 * `<ChatInterfaceDesktop>` keeps its own loading behaviour, so the user
 * never sees the editor shell flash or remount.
 */
export function ChatPaneSkeleton({ variant }: { readonly variant: 'loading' | 'ensuring' }): React.JSX.Element {
  return (
    <div
      className='flex size-full flex-col bg-sidebar/50'
      data-slot='floating-panel'
      data-testid={`chat-pane-skeleton-${variant}`}
      aria-busy='true'
      aria-label={variant === 'loading' ? 'Loading editor state…' : 'Preparing chat session…'}
    >
      <div className='flex h-10 shrink-0 items-center gap-2 border-b px-3'>
        <Skeleton className='h-5 w-32' />
        <Skeleton className='ml-auto h-5 w-5 rounded-full' />
      </div>
      <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 py-4'>
        <Skeleton className='h-16 w-3/4 self-start rounded-md' />
        <Skeleton className='h-12 w-2/3 self-end rounded-md' />
        <Skeleton className='h-20 w-4/5 self-start rounded-md' />
      </div>
      <div className='mx-2 mb-2 shrink-0'>
        <Skeleton className='h-20 w-full rounded-sm' />
      </div>
    </div>
  );
}

/**
 * Renders when `ensureFocusedChatActor` rejects. Surfaces the typed
 * error from the editor machine and offers a retry CTA that dispatches
 * `retryEnsureFocusedChat`, re-invoking the actor without a full reload.
 *
 * Receives the editor `error` from the machine context so the user sees
 * the underlying failure (worker offline, IDB quota, etc.) rather than
 * a generic message.
 */
export function FocusedChatErrorPanel({ error }: { readonly error: Error }): React.JSX.Element {
  const { editorRef } = useProject();
  const onRetry = useCallback(() => {
    editorRef.send({ type: 'retryEnsureFocusedChat' });
  }, [editorRef]);

  return (
    <div
      className='flex size-full flex-col items-center justify-center gap-4 bg-sidebar/50 p-6 text-center'
      data-slot='floating-panel'
      role='alert'
      data-testid='focused-chat-error-panel'
    >
      <div className='space-y-1'>
        <p className='text-sm font-medium'>Couldn&apos;t open this project&apos;s chat</p>
        <p className='text-xs text-muted-foreground'>{error.message}</p>
      </div>
      <Button onClick={onRetry} variant='outline' size='sm'>
        Try again
      </Button>
    </div>
  );
}

/**
 * Provider mount for the editor surface. Sole owner of
 * `<ActiveChatProvider>` so every session-required consumer in the
 * editor — viewer toolbar (`CaptureViewControl`), chat pane
 * (`ChatHistory`), file tree, parameters, etc. — sees the same live
 * `Chat` instance.
 *
 * Gating policy:
 * - On cold start, the parent (`ChatInterfaceDesktop` / `Mobile`) already
 *   defers mounting via its own `isEditorReady` placeholder, so by the
 *   time this gate runs the editor machine is in `ready` and Layer 1
 *   guarantees `focusedChatId` is a `string`.
 * - During runtime ensure (`ready.operation.ensuringFocusedChat`),
 *   `focusedChatId` may be transiently `undefined`. We keep the
 *   previous `chatId` mounted via `lastValidChatId` so the provider
 *   (and the entire Allotment / Dockview subtree below it) does NOT
 *   unmount during the ensure window — the chat pane's
 *   {@link ChatHistoryGate} handles its own skeleton independently.
 * - The `fallback` slot covers the rare first-frame corner where the
 *   parent gate flips ready but `focusedChatId` has not yet propagated
 *   to this component (in practice the same render covers both because
 *   the machine sets `focusedChatId` before reaching `ready`).
 */
export function ChatInterfaceSessionGate({
  children,
  fallback,
}: {
  readonly children: React.ReactNode;
  readonly fallback: React.ReactNode;
}): React.JSX.Element {
  const { editorRef } = useProject();
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const [lastValidChatId, setLastValidChatId] = useState<string | undefined>(focusedChatId);

  useEffect(() => {
    if (focusedChatId !== undefined && focusedChatId !== lastValidChatId) {
      setLastValidChatId(focusedChatId);
    }
  }, [focusedChatId, lastValidChatId]);

  if (!lastValidChatId) {
    // oxlint-disable-next-line react/jsx-no-useless-fragment -- forwarding raw fallback
    return <>{fallback}</>;
  }

  return <ActiveChatProvider chatId={lastValidChatId}>{children}</ActiveChatProvider>;
}

/**
 * Visual gate for the chat pane. Decides between the skeleton (while
 * the editor machine is re-ensuring the focused chat), the typed error
 * panel (when ensure rejected), or the pane's real content.
 *
 * Does NOT mount `<ActiveChatProvider>` — that is owned by
 * {@link ChatInterfaceSessionGate} so the viewer toolbar and every
 * other pane share the same provider scope. Mounting it here would
 * leave outside-pane consumers (e.g. `CaptureViewControl`) without a
 * session and crash the editor route (see provider-hoist plan).
 */
export function ChatHistoryGate({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const { editorRef } = useProject();

  const focusedChatError = useSelector(editorRef, (state) => state.context.focusedChatError);
  const isEnsuring = useSelector(
    editorRef,
    (state) =>
      state.matches({ loading: 'ensuringFocusedChat' }) ||
      state.matches({ ready: { operation: 'ensuringFocusedChat' } }),
  );
  const isUnresolved = useSelector(editorRef, (state) =>
    state.matches({ ready: { operation: 'focusedChatUnresolved' } }),
  );

  if (isUnresolved && focusedChatError) {
    return <FocusedChatErrorPanel error={focusedChatError} />;
  }

  if (isEnsuring) {
    return <ChatPaneSkeleton variant='ensuring' />;
  }

  // oxlint-disable-next-line react/jsx-no-useless-fragment -- forwarding children verbatim
  return <>{children}</>;
}
