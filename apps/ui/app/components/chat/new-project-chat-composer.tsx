import { holdFirstTurnBackup } from '#lib/first-turn-backup-gate.js';
import { departFirstMessage } from '#lib/departing-first-message.js';
import { frameHintKey, writePhoneFrameHint } from '#lib/frame-hint.js';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { loadCode } from '@taucad/ui-core/lib/code-loading';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import type { ChatTextareaHandle, ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import { WorkspaceSelector } from '#components/filesystem/workspace-selector.js';
import { toast } from '@taucad/ui/components/sonner';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useKernel } from '#hooks/use-kernel.js';
import { useModels } from '#hooks/use-models.js';
import { useProjectCreationLocation } from '#hooks/use-project-creation-location.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '@taucad/files-ui/utils/project-url.utils';
import { reportProjectCreationFailure } from '#lib/project-creation-failure-reporting.js';
import { useProjectNameAhead } from '#components/chat/use-project-name-ahead.js';

type NewProjectChatComposerProperties = {
  readonly enableAutoFocus?: boolean;
  readonly enableEarlyInput?: boolean;
  /** An early edit the route already adopted, when the route owns the native input. */
  readonly adoptedEarlyInput?: EarlyChatInput;
  readonly className?: string;
};

/** Loads the agent-host client with the first send's chunks, off Home's own graph, and boots its worker. */
const prewarmAgentHost = async (): Promise<void> => {
  try {
    const { prewarmBrowserAgentHost } = await loadCode(async () => import('#services/agent-host-client.js'));
    await prewarmBrowserAgentHost();
  } catch {
    /* `loadCode` handed a failed load to the page's recovery; the turn's own load reports it. */
  }
};

/** Shared direct-create composer rendered inside an existing chat provider. */
export function NewProjectChatComposer({
  enableAutoFocus = true,
  enableEarlyInput = false,
  adoptedEarlyInput,
  className,
}: NewProjectChatComposerProperties): React.JSX.Element {
  const navigate = useNavigate();
  /* The kernel is the bar's pill (D8). Under Auto the project starts entry-less and the agent picks the kernel from
   * the prompt (blueprint D3). */
  const { preference: creationKernel } = useKernel();
  const projectManager = useProjectManager();
  const location = useProjectCreationLocation();
  const presentLocationError = useProjectCreationLocationError();
  const textareaRef = useRef<ChatTextareaHandle>(null);
  const { withCatalogDefaultModel } = useModels();
  const {
    draftActorRef,
    attachmentSource,
    execution: { execution },
    consumeDraft,
  } = useChatComposer();
  const nameAhead = useProjectNameAhead();

  const focusComposer = useCallback((): void => {
    textareaRef.current?.focus();
  }, []);

  /* Mount autofocus alone misses a return to an already-mounted Home, so honour a
   * navigation that asks for focus (`state.focusChatComposer`) too. */
  const { key: locationKey, state: locationState } = useLocation() as { key: string; state: unknown };
  // Each navigation that asks for focus is its own request, identified by its location key.
  const focusRequestKey =
    (locationState as { focusChatComposer?: unknown } | undefined)?.focusChatComposer === true
      ? locationKey
      : undefined;
  useEffect(() => {
    if (enableAutoFocus && focusRequestKey !== undefined) {
      focusComposer();
    }
  }, [enableAutoFocus, focusComposer, focusRequestKey]);

  /* Returning to the window restores the last focused element; when that is
   * nothing, the draft is what the user came back for. */
  useEffect(() => {
    if (!enableAutoFocus) {
      return undefined;
    }
    const handleWindowFocus = (): void => {
      if (document.activeElement === null || document.activeElement === document.body) {
        focusComposer();
      }
    };
    globalThis.addEventListener('focus', handleWindowFocus);
    return () => {
      globalThis.removeEventListener('focus', handleWindowFocus);
    };
  }, [enableAutoFocus, focusComposer]);

  const creationLocationControl = useMemo(
    () =>
      location.shouldShowPicker ? (
        <WorkspaceSelector
          data-chat-textarea-focustrap
          state={location}
          variant='toolbar'
          onSelectionComplete={focusComposer}
          onRequestFocus={focusComposer}
        />
      ) : undefined,
    [focusComposer, location],
  );

  const onSubmit: ChatTextareaProperties['onSubmit'] = useCallback(
    async ({ content }) => {
      if (location.phase !== 'ready') {
        return;
      }
      // The stored draft is the source of truth for attachments: the new
      // project's chat receives copies of exactly these bytes.
      const attachments = draftActorRef
        .getSnapshot()
        .context.draftAttachments.map(({ byteLength: _byteLength, ...stored }) => stored);
      /* WP-12 step 3: a turn this browser hosts boots its agent-host worker while the project is created and its route
       * opens, not after the route mounts. Another host's turn needs no worker here. */
      if (execution.kind === 'tau' && daemonPlacementOf(execution) === undefined) {
        void prewarmAgentHost();
      }
      try {
        /* C1, WP-12 step 1: the latest name generated while the prompt was written, or one from its first words; the
         * create never waits on naming. */
        const projectName = nameAhead.take({ text: content, attachments });
        const created = await projectManager.createProject({
          kernel: creationKernel,
          ...(projectName === undefined ? {} : { projectName }),
          /* The chip's value verbatim — not a Tau execution rebuilt from the
           * model. Rebuilding dropped `hostId` (and any `acp` choice),
           * so a project started from a "Tau Host · …" chip ran its first turn
           * in this browser instead, against a chip that still named the
           * daemon. Both providers keep this execution's Tau model in step with
           * the model chip, so there is nothing left to override here. Project
           * creation keeps a device-relative host for this device only (XD2). */
          activeExecution: await withCatalogDefaultModel(execution),
          initialMessage: { content, attachments, ...(attachmentSource === undefined ? {} : { attachmentSource }) },
          editorState: {
            panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' }, mobileActiveTab: 'chat' },
          },
          location: location.value,
        });
        /* WP-12 step 5: the first cloud backup waits for the first turn to stream, or 5 s. */
        holdFirstTurnBackup(created.id);
        /* WP-12 with WP-07 step 5: the project's chat lane draws the message at its first row's place from the frame's
         * first paint until the transcript draws it, so Enter never blanks the person's words. A message with images
         * waits for its row: a text-only stand-in would grow when they arrive. */
        if (attachments.length === 0) {
          departFirstMessage(`${created.slugs.workspaceSlug}/${created.slugs.projectSlug}`, content);
        }
        /* The draft is consumed before the project route reads anything, and the navigation starts in the same task,
         * so Home's composer clears as the frame is drawn ahead of the route, not a beat before. */
        const url = projectUrl(created.slugs);
        /* The project opens on its chat (`mobileActiveTab`); a phone's frame draws that sheet, and the message in it,
         * from its first paint rather than the default model tab with the sheet closed. */
        const hintKey = frameHintKey(url);
        if (hintKey !== undefined) {
          writePhoneFrameHint(hintKey, 'chat');
        }
        const consumed = consumeDraft();
        const navigation = navigate(url);
        await consumed;
        await navigation;
      } catch (error) {
        if (presentLocationError(error)) {
          if (location.hasWebAccessCapability) {
            await location.refresh();
          }
          return;
        }
        console.error('Failed to create project:', error);
        reportProjectCreationFailure(error);
        toast.error('Failed to create project');
      }
    },
    [
      attachmentSource,
      consumeDraft,
      draftActorRef,
      execution,
      creationKernel,
      location,
      nameAhead,
      navigate,
      presentLocationError,
      projectManager,
      withCatalogDefaultModel,
    ],
  );

  return (
    /* `contents` keeps the textarea's layout; the wrapper only hears a paste, which asks for the name at once (C1). */
    <div className='contents' onPasteCapture={nameAhead.onPasteCapture}>
      <ChatTextarea
        enableEarlyInput={enableEarlyInput}
        adoptedEarlyInput={adoptedEarlyInput}
        ref={textareaRef}
        enableAutoFocus={enableAutoFocus}
        enableContextActions={false}
        creationLocationControl={creationLocationControl}
        isSubmitDisabled={!location.canCreate}
        className={className}
        onSubmit={onSubmit}
      />
    </div>
  );
}
