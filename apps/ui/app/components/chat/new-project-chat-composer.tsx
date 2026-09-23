import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ChatTextarea } from '#components/chat/chat-textarea.js';
import type { ChatTextareaHandle, ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { KernelSelector } from '#components/chat/kernel-selector.js';
import { WorkspaceSelector } from '#components/filesystem/workspace-selector.js';
import { toast } from '#components/ui/sonner.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useKernel } from '#hooks/use-kernel.js';
import { useProjectCreationLocation } from '#hooks/use-project-creation-location.js';
import { useProjectCreationLocationError } from '#hooks/use-project-creation-location-error.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import { projectUrl } from '#utils/project-url.utils.js';

type NewProjectChatComposerProperties = {
  readonly enableAutoFocus?: boolean;
  readonly className?: string;
};

/** Shared direct-create composer rendered inside an existing chat provider. */
export function NewProjectChatComposer({
  enableAutoFocus = true,
  className = 'pt-1',
}: NewProjectChatComposerProperties): React.JSX.Element {
  const navigate = useNavigate();
  const { kernel, setKernel } = useKernel();
  const projectManager = useProjectManager();
  const location = useProjectCreationLocation();
  const presentLocationError = useProjectCreationLocationError();
  const textareaRef = useRef<ChatTextareaHandle>(null);
  const {
    draftActorRef,
    attachmentSource,
    execution: { execution },
    consumeDraft,
  } = useChatComposer();

  const focusComposer = useCallback((): void => {
    textareaRef.current?.focus();
  }, []);

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
      const attachments = draftActorRef.getSnapshot().context.draftAttachments.map(({ hash, mediaType, filename }) => ({
        hash,
        mediaType,
        ...(filename === undefined ? {} : { filename }),
      }));
      try {
        const created = await projectManager.createProject({
          kernel,
          /* The chip's value verbatim — not a Tau execution rebuilt from the
           * model. Rebuilding dropped `hostId` (and any `acp` choice),
           * so a project started from a "Tau Host · …" chip ran its first turn
           * in this browser instead, against a chip that still named the
           * daemon. Both providers keep this execution's Tau model in step with
           * the model chip, so there is nothing left to override here. */
          activeExecution: execution,
          initialMessage: { content, attachments, ...(attachmentSource === undefined ? {} : { attachmentSource }) },
          editorState: {
            panelState: { desktopLayout: { chatOpen: true, compactAuxiliary: 'chat' }, mobileActiveTab: 'chat' },
          },
          location: location.value,
        });
        await consumeDraft();
        await navigate(projectUrl(created.slugs));
      } catch (error) {
        if (presentLocationError(error)) {
          if (location.hasWebAccessCapability) {
            await location.refresh();
          }
          return;
        }
        console.error('Failed to create project:', error);
        toast.error('Failed to create project');
      }
    },
    [
      attachmentSource,
      consumeDraft,
      draftActorRef,
      execution,
      kernel,
      location,
      navigate,
      presentLocationError,
      projectManager,
    ],
  );

  return (
    <div className='space-y-4'>
      <div className='flex justify-center'>
        <KernelSelector selectedKernel={kernel} onKernelChange={setKernel} />
      </div>
      <ChatTextarea
        ref={textareaRef}
        enableAutoFocus={enableAutoFocus}
        enableContextActions={false}
        enableKernelSelector={false}
        creationLocationControl={creationLocationControl}
        isSubmitDisabled={!location.canCreate}
        className={className}
        onSubmit={onSubmit}
      />
    </div>
  );
}
