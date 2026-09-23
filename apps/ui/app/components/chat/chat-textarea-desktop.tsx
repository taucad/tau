import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { AttachmentDirectories } from '#hooks/use-attachment-source.js';
import { AtSign, Paperclip, Plus } from 'lucide-react';
import type { AcpSessionData, Chat } from '@taucad/chat';
import type { FileEntry } from '@taucad/types';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { ChatAgentSheet, ghostPillClass } from '#components/chat/chat-agent-sheet.js';
import { ChatAgentModeControl } from '#components/chat/chat-mode-selector.js';
import { useAgentConfig } from '#components/chat/use-agent-config.js';
import { ChatKernelSelector } from '#components/chat/chat-kernel-selector.js';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatContextIndicator } from '#components/chat/chat-context-indicator.js';
import { ChatTextareaBorderBeam } from '#components/chat/chat-textarea-border-beam.js';
import { ChatTextareaAttachmentRail } from '#components/chat/chat-textarea-image-strip.js';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';
import type { ChatAttachmentAddOptions, ChatTextareaDragKind } from '#components/chat/chat-textarea-types.js';
import type { DraftAttachment } from '#hooks/draft.machine.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { ChatEditor } from '#components/chat/tiptap/chat-editor.js';
import { buildEditorContentJson, extractContent, useChatEditor } from '#components/chat/tiptap/use-chat-editor.js';
import type { ContextSuggestionItem, SlashCommandItem } from '#components/chat/tiptap/suggestion-types.js';
import type { ClipboardPasteEvent } from '#components/chat/chat-paste-handler.js';
import { createScreenshotContextHandler } from '#components/chat/screenshot-actions.utils.js';
import { buildPastedContent } from '#utils/at-reference.utils.js';
import { skillMetadataToSlashCommand, useSkillsCatalog } from '#hooks/use-skills-catalog.js';
import type { ChatContextReference } from '#components/chat/chat-context-insertion.js';

const dragOverlayCopy: Record<ChatTextareaDragKind, string> = {
  image: 'Add files',
  viewer: 'Add screenshot',
  reference: 'Add reference',
};

type ChatTextareaDesktopProperties = {
  readonly className?: string;
  readonly enableAutoFocus?: boolean;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;
  readonly creationLocationControl?: React.ReactNode;
  readonly isSubmitDisabled?: boolean;
  /** Which composer this is: the edit box speaks as one and owns shortcuts only while focused (F6, F19). */
  readonly mode?: 'main' | 'edit';

  // State
  readonly dragKind: ChatTextareaDragKind | undefined;
  readonly isSubmitting: boolean;
  readonly isAttaching: boolean;
  readonly inputText: string;
  readonly attachments: readonly DraftAttachment[];
  readonly attachmentDirectory: AttachmentDirectories;
  readonly sendBlockReason: string | undefined;
  readonly attachmentAccept: string;
  readonly attachmentInputSupported: boolean;
  readonly status: string;
  readonly formattedCancelKeyCombination: string;

  // Context data for Tiptap editor
  readonly treeService: FileTreeService | undefined;
  readonly chats: Chat[];
  readonly actionItems?: ContextSuggestionItem[];
  readonly setDraftText: (text: string) => void;
  readonly acpAgentId?: string;
  readonly acpSessionData?: AcpSessionData;

  // Refs
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly fileInputReference: React.RefObject<HTMLInputElement | null>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly containerReference: React.RefObject<HTMLDivElement | null>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object for imperative focus
  readonly focusEditorRef: React.RefObject<(() => void) | undefined>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object populated by this component for parent-driven chip insertion
  readonly addContextChipsRef: React.RefObject<((paths: string[]) => void) | undefined>;
  readonly addContextReferencesRef: React.RefObject<((references: ChatContextReference[]) => void) | undefined>;

  // Handlers (all must be stable references to prevent tooltip re-render loops)
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancelClick: () => void;
  readonly handleDragOver: (event: React.DragEvent) => void;
  readonly handleDragLeave: () => void;
  readonly handleDrop: (event: React.DragEvent) => Promise<void>;
  readonly handlePaste: (event: ClipboardPasteEvent) => boolean;
  readonly handleFileSelect: () => void;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleAddImage: (image: string, options?: ChatAttachmentAddOptions) => void;
  readonly onScreenshotAction: (item: ContextSuggestionItem) => void;
  readonly onEscapePressed?: () => void;
  readonly handleTextareaBlur: () => void;
  readonly removeAttachment: (index: number) => void;
};

/** Map one ACP command to the existing slash menu without changing its native invocation. @public */
export const acpCommandToSlashCommand = (
  command: AcpSessionData['commands'][number],
  agentId: string,
): SlashCommandItem => {
  const invocation = command.name.startsWith('$') || command.name.startsWith('/') ? command.name : `/${command.name}`;
  return {
    id: invocation,
    label: invocation,
    title: command.name,
    description: command.description,
    ...(command.input === null || command.input === undefined ? {} : { fullDescription: command.input.hint }),
    group: 'Commands',
    source: agentId,
    commandText: `${invocation} `,
  };
};

/**
 * Why Send refuses, in the words its tooltip and description use (F14).
 *
 * @returns The reason, or `undefined` when Send would send.
 */
const sendRefusalOf = (input: {
  readonly sendBlockReason: string | undefined;
  readonly isSubmitting: boolean;
  readonly isAttaching: boolean;
  readonly isSubmitDisabled: boolean;
  readonly isEmpty: boolean;
}): string | undefined => {
  if (input.sendBlockReason !== undefined) {
    return input.sendBlockReason;
  }
  if (input.isSubmitting) {
    return 'Sending…';
  }
  if (input.isAttaching) {
    return 'Waiting for the attachment to finish';
  }
  if (input.isEmpty) {
    return 'Write a message first';
  }
  return input.isSubmitDisabled ? 'Not ready to send yet' : undefined;
};

/**
 * The chat composer, on every device (C11): the Tiptap rich text editor with
 * inline context chips via @-mentions, slash commands, drag-drop from dockview
 * tabs, and one bar of controls.
 *
 * Architecture note: all callback props MUST be stable (memoized) references.
 * Radix UI's SlotClone (used by TooltipTrigger asChild) calls composeRefs()
 * inline on every render. In React 19, if the parent re-renders and creates
 * a new composed ref, the ref cleanup/set cycle calls setTrigger(null) then
 * setTrigger(domNode), which triggers another re-render -> infinite loop.
 * Keeping props stable means memo() prevents parent re-renders from reaching
 * the tooltip tree entirely.
 */
export const ChatTextareaDesktop = memo(function ({
  className,
  enableAutoFocus = true,
  enableContextActions = true,
  enableKernelSelector = true,
  creationLocationControl,
  isSubmitDisabled = false,
  mode = 'main',

  // State
  dragKind,
  isSubmitting,
  isAttaching,
  inputText,
  attachments,
  attachmentDirectory,
  sendBlockReason,
  attachmentAccept,
  attachmentInputSupported,
  status,
  formattedCancelKeyCombination,

  // Context data
  treeService,
  chats,
  actionItems,
  setDraftText,
  acpAgentId,
  acpSessionData,

  // Refs
  fileInputReference,
  containerReference,
  focusEditorRef,
  addContextChipsRef,
  addContextReferencesRef,

  // Handlers
  handleSubmit,
  handleCancelClick,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handlePaste,
  handleFileSelect,
  handleFileChange,
  handleAddImage,
  onScreenshotAction,
  onEscapePressed,
  handleTextareaBlur,
  removeAttachment,
}: ChatTextareaDesktopProperties): React.JSX.Element {
  const skillsCatalog = useSkillsCatalog();

  const commands = acpSessionData?.commands;
  const slashCommandItems = useMemo(
    () =>
      acpAgentId === undefined
        ? skillsCatalog.map((skillMetadata) => skillMetadataToSlashCommand(skillMetadata))
        : (commands ?? []).map((command) => acpCommandToSlashCommand(command, acpAgentId)),
    [acpAgentId, commands, skillsCatalog],
  );
  const knownSkillIds = useMemo(
    () => new Set(slashCommandItems.filter((item) => item.group !== 'Commands').map((item) => item.id)),
    [slashCommandItems],
  );

  const handleEditorUpdate = useCallback(
    (content: { text: string }) => {
      setDraftText(content.text);
    },
    [setDraftText],
  );

  const chatEditor = useChatEditor({
    onSubmit: handleSubmit,
    onEscape: onEscapePressed,
    onUpdate: handleEditorUpdate,
    treeService,
    chats,
    actionItems,
    slashCommandItems,
    placeholder: mode === 'edit' ? 'Edit your message' : undefined,
    handleImagePaste: handlePaste,
    onContextAction: createScreenshotContextHandler({
      handleAddImage,
      onScreenshotAction,
    }),
  });

  const { editor } = chatEditor;

  // Store editor in a ref so callbacks below remain stable (empty dep arrays).
  // This breaks the re-render cascade: editor changes (null→Editor) won't
  // recreate focusEditor/handleAtButtonClick, so Tooltip children stay memo'd.
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return undefined;
    }
    const currentText = extractContent(editor).text;
    if (inputText === currentText) {
      return undefined;
    }
    if (inputText === '') {
      editor.commands.clearContent(false);
      return undefined;
    }
    const lazyTree: Map<string, FileEntry> = treeService?.getTreeSnapshot() ?? new Map<string, FileEntry>();
    const segments = buildPastedContent(inputText, { fileTree: lazyTree, chats, knownSkills: knownSkillIds });
    /* F20: each chip's node view calls `flushSync`, which React refuses inside
     * its own commit, so the content lands in a microtask after it. */
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent && !editor.isDestroyed) {
        editor.commands.setContent(buildEditorContentJson(segments), { emitUpdate: false });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [inputText, editor, treeService, chats, knownSkillIds]);

  // Expose focus function to parent via mutable ref
  useEffect(() => {
    focusEditorRef.current = () => editorRef.current?.commands.focus('end');
    return () => {
      focusEditorRef.current = undefined;
    };
  }, [focusEditorRef]);

  const insertContextReferences = useCallback((references: ChatContextReference[]): void => {
    const currentEditor = editorRef.current;
    if (!currentEditor || references.length === 0) {
      return;
    }
    const chain = currentEditor.chain().focus();
    for (const reference of references) {
      chain
        .insertContent({
          type: 'contextChip',
          attrs: {
            id: reference.id,
            label: reference.label,
            chipType: reference.chipType,
            path: reference.path,
            referenceToken: reference.referenceToken,
            geometryReference: reference.geometryReference ? JSON.stringify(reference.geometryReference) : undefined,
          },
        })
        .insertContent(' ');
    }
    chain.run();
  }, []);

  // Expose chip insertion to parent via mutable refs so the outer container's
  // drop dispatcher and geometry explorer can route references into Tiptap nodes.
  useEffect(() => {
    addContextChipsRef.current = (paths: string[]): void => {
      insertContextReferences(
        paths.map((path) => {
          const isFolder = path.endsWith('/');
          const segments = path.split('/').filter((segment) => segment.length > 0);
          const label = segments.at(-1) ?? path;
          return { id: path, label, chipType: isFolder ? 'folder' : 'file', path };
        }),
      );
    };
    addContextReferencesRef.current = insertContextReferences;
    return () => {
      addContextChipsRef.current = undefined;
      addContextReferencesRef.current = undefined;
    };
  }, [addContextChipsRef, addContextReferencesRef, insertContextReferences]);

  useEffect(() => {
    if (enableAutoFocus && editor) {
      editor.commands.focus('end');
    }
  }, [enableAutoFocus, editor]);

  // Lock Tiptap while `await onSubmit(...)` is in-flight inside the textarea
  // hook (homepage create-project + `await navigate`, vs fire-and-forget
  // `sendMessage` on the project route). Only long submits flip `true`,
  // so the tracer beam + shimmer indicate CDN-heavy navigation without
  // flashing during normal chat sends on `/projects/:id`.
  useEffect(() => {
    if (!editor) {
      return;
    }
    /* No update event: editability is not content, and on mount the editor is
     * still empty until the restored draft lands (F20), so an update here
     * would persist an empty draft over it. */
    editor.setEditable(!isSubmitting, false);
  }, [editor, isSubmitting]);

  const focusEditor = useCallback(() => {
    editorRef.current?.commands.focus('end');
  }, []);

  const handleAtButtonClick = useCallback(() => {
    if (!editorRef.current) {
      return;
    }
    editorRef.current.chain().focus().insertContent('@').run();
  }, []);

  const handleEditorAreaClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.tiptap')) {
      editorRef.current?.commands.focus('end');
    }
  }, []);

  const sendRefusal = sendRefusalOf({
    sendBlockReason,
    isSubmitting,
    isAttaching,
    isSubmitDisabled,
    isEmpty: inputText.trim().length === 0 && attachments.length === 0,
  });
  const blockReasonId = useId();
  /* F19: the beam follows the box's corners. */
  const radius = mode === 'edit' ? 'rounded-lg' : 'rounded-2xl';

  return (
    // Outer wrapper is purely a positioning context for the beam overlay
    // and intentionally takes NO `className` passthrough — see
    // ChatTextareaBorderBeam's docs for why. All layout / styling
    // overrides live on the inner border container below.
    <div className='relative size-full' data-chat-composer={mode}>
      <ChatTextareaBorderBeam isActive={isSubmitting} className={radius} />

      <div
        ref={containerReference}
        className={cn(
          'group/chat-textarea @container',
          'relative flex size-full flex-col border bg-background',
          radius,
          'cursor-text overflow-hidden',
          'shadow-md',
          'has-[.tiptap:focus-visible]:focus-outline',
          className,
        )}
        onBlur={handleTextareaBlur}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attachments */}
        <ChatTextareaAttachmentRail
          attachments={attachments}
          directory={attachmentDirectory}
          blockReason={sendBlockReason}
          blockReasonId={blockReasonId}
          size='desktop'
          onRemove={removeAttachment}
        />

        {/* Editor */}
        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-auto')} onClick={handleEditorAreaClick}>
          <ChatEditor
            editor={editor}
            className='pt-2'
            contextSuggestionState={chatEditor.contextSuggestionState}
            slashCommandState={chatEditor.slashCommandState}
            contextKeydownRef={chatEditor.contextKeydownRef}
            slashKeydownRef={chatEditor.slashKeydownRef}
            isLoading={isSubmitting}
          />
        </div>

        {/* Drag and drop feedback */}
        {dragKind ? (
          <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs'>
            <p className='rounded-md border bg-background/50 px-2 font-medium text-primary'>
              {dragOverlayCopy[dragKind]}
            </p>
          </div>
        ) : null}

        <ChatTextareaBar
          composerMode={mode}
          containerReference={containerReference}
          enableContextActions={enableContextActions}
          enableKernelSelector={enableKernelSelector}
          creationLocationControl={creationLocationControl}
          acpSessionData={acpSessionData}
          status={status}
          focusEditor={focusEditor}
          handleAtButtonClick={handleAtButtonClick}
          handleFileSelect={handleFileSelect}
          attachmentInputSupported={attachmentInputSupported}
          fileInputReference={fileInputReference}
          attachmentAccept={attachmentAccept}
          handleFileChange={handleFileChange}
          isSubmitting={isSubmitting}
          sendRefusal={sendRefusal}
          describedBy={sendBlockReason === undefined ? undefined : blockReasonId}
          formattedCancelKeyCombination={formattedCancelKeyCombination}
          handleSubmit={handleSubmit}
          handleCancelClick={handleCancelClick}
        />
      </div>
    </div>
  );
});

ChatTextareaDesktop.displayName = 'ChatTextareaDesktop';

/** The labels that leave, in order, before the model's name is cut (D6). */
const collapseSteps = ['data-hide-kernel', 'data-hide-mode', 'data-hide-level'] as const;

/**
 * The measured collapse. Before paint, and on every resize or label change,
 * labels leave in a fixed order — the kernel's (or the location's), the mode's,
 * then the level — until the model's name is whole; only then is it cut.
 */
// oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
function useBarCollapse(barRef: React.RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) {
      return undefined;
    }
    const fit = (): void => {
      const name = bar.querySelector<HTMLElement>('[data-slot=trigger-model]');
      for (let hidden = 0; hidden <= collapseSteps.length; hidden += 1) {
        for (const [index, flag] of collapseSteps.entries()) {
          bar.toggleAttribute(flag, index < hidden);
        }
        if (!name || name.scrollWidth <= name.clientWidth) {
          return;
        }
      }
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(bar);
    /* Labels change without a resize (another model, a level). Attributes are
     * not observed, so the flags this sets cannot loop. */
    const mutation = new MutationObserver(fit);
    mutation.observe(bar, { childList: true, subtree: true, characterData: true });
    /* Webfonts change the name's width without a resize. */
    const refitWhenFontsLoad = async (): Promise<void> => {
      await document.fonts.ready;
      fit();
    };
    void refitWhenFontsLoad();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [barRef]);
}

/**
 * The composer's one bar (D6): `justify-between`, so the two clusters can
 * never overlap (F4). Left: +, the external agent's mode, the kernel (the
 * location on Home). Right: the context meter, the agent-and-model trigger,
 * Send. Every control is ghost; Send alone keeps its fill.
 *
 * Memo'd to isolate Radix `TooltipTrigger asChild` composeRefs loops: every
 * callback prop must be stable.
 *
 * @internal
 */
export const ChatTextareaBar = memo(function ({
  composerMode,
  containerReference,
  enableContextActions,
  enableKernelSelector,
  creationLocationControl,
  acpSessionData,
  status,
  focusEditor,
  handleAtButtonClick,
  handleFileSelect,
  attachmentInputSupported,
  fileInputReference,
  attachmentAccept,
  handleFileChange,
  isSubmitting,
  sendRefusal,
  describedBy,
  formattedCancelKeyCombination,
  handleSubmit,
  handleCancelClick,
}: {
  readonly composerMode: 'main' | 'edit';
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly containerReference: React.RefObject<HTMLDivElement | null>;
  readonly enableContextActions: boolean;
  readonly enableKernelSelector: boolean;
  readonly creationLocationControl?: React.ReactNode;
  readonly acpSessionData?: AcpSessionData;
  readonly status: string;
  readonly focusEditor: () => void;
  readonly handleAtButtonClick: () => void;
  readonly handleFileSelect: () => void;
  readonly attachmentInputSupported: boolean;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly fileInputReference: React.RefObject<HTMLInputElement | null>;
  readonly attachmentAccept: string;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly isSubmitting: boolean;
  readonly sendRefusal: string | undefined;
  readonly describedBy: string | undefined;
  readonly formattedCancelKeyCombination: string;
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancelClick: () => void;
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  useBarCollapse(barRef);
  const agentConfig = useAgentConfig(acpSessionData, status);
  /* F6: only the composer being typed in owns ⌘/ and ⌘. — the edit box while
   * focus is inside it, the main composer otherwise. */
  const ownsShortcuts = useCallback(
    () =>
      composerMode === 'edit'
        ? containerReference.current?.contains(document.activeElement) === true
        : !document.activeElement?.closest('[data-chat-composer=edit]'),
    [composerMode, containerReference],
  );

  return (
    <div
      ref={barRef}
      data-slot='composer-bar'
      className='group/bar absolute inset-x-2 bottom-2 flex items-center justify-between gap-2'
    >
      <div data-slot='composer-left' className='flex shrink-0 flex-row items-center gap-0.5'>
        <ChatAddMenu
          enableContextActions={enableContextActions}
          isAttachmentSupported={attachmentInputSupported}
          handleAtButtonClick={handleAtButtonClick}
          handleFileSelect={handleFileSelect}
          focusEditor={focusEditor}
        />
        <ChatAgentModeControl agentConfig={agentConfig} focusEditor={focusEditor} enableShortcut={ownsShortcuts} />
        {creationLocationControl}
        {enableKernelSelector ? <ChatTextareaKernelControl focusEditor={focusEditor} /> : null}
        <input
          ref={fileInputReference}
          multiple
          type='file'
          accept={attachmentAccept}
          className='hidden'
          onChange={handleFileChange}
        />
      </div>
      <div data-slot='composer-right' className='flex min-w-0 flex-row items-center gap-1'>
        <ChatContextIndicator />
        <ChatAgentSheet agentConfig={agentConfig} focusEditor={focusEditor} enableShortcut={ownsShortcuts} />
        <ChatTextareaSubmitButton
          status={status}
          isSubmitting={isSubmitting}
          refusal={sendRefusal}
          describedBy={describedBy}
          formattedCancelKeyCombination={formattedCancelKeyCombination}
          onSubmit={handleSubmit}
          onCancel={handleCancelClick}
        />
      </div>
    </div>
  );
});

/** The kernel, ghost and glyph first; its label is the first to leave when the bar needs the room. */
function ChatTextareaKernelControl({ focusEditor }: { readonly focusEditor: () => void }): React.JSX.Element {
  const {
    kernel: { kernel: selectedKernel },
  } = useChatComposer();
  return (
    <Tooltip>
      <ChatKernelSelector
        data-chat-textarea-focustrap
        popoverProperties={{ align: 'start' }}
        onSelect={focusEditor}
        onClose={focusEditor}
      >
        {({ selectedKernel: kernel }) => (
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              aria-label={`Select kernel (${kernel.name})`}
              className={cn(
                ghostPillClass,
                'min-w-0 gap-1.5 group-data-[hide-kernel]/bar:w-7 group-data-[hide-kernel]/bar:px-0',
              )}
            >
              <SvgIcon id={kernel.id} className='size-4 shrink-0 grayscale' />
              <span className='truncate text-xs group-data-[hide-kernel]/bar:hidden'>{kernel.name}</span>
            </Button>
          </TooltipTrigger>
        )}
      </ChatKernelSelector>
      <TooltipContent>Select kernel ({selectedKernel.name})</TooltipContent>
    </Tooltip>
  );
}

/**
 * One + for everything a turn can carry (F10): attach a file, or — outside
 * Home — add context, which types @ and opens the shipped menu. A model that
 * cannot read files keeps the item, disabled, saying why (F14).
 */
function ChatAddMenu({
  enableContextActions,
  isAttachmentSupported,
  handleAtButtonClick,
  handleFileSelect,
  focusEditor,
}: {
  readonly enableContextActions: boolean;
  readonly isAttachmentSupported: boolean;
  readonly handleAtButtonClick: () => void;
  readonly handleFileSelect: () => void;
  readonly focusEditor: () => void;
}): React.JSX.Element {
  const choseItem = useRef(false);
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <DropdownMenuTrigger asChild>
          <TooltipTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              data-chat-textarea-focustrap
              aria-label='Add'
              className={cn(ghostPillClass, 'w-7 shrink-0 px-0')}
            >
              <Plus className='size-4' aria-hidden='true' />
            </Button>
          </TooltipTrigger>
        </DropdownMenuTrigger>
        <TooltipContent>{enableContextActions ? 'Attach a file or add context' : 'Attach a file'}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align='start'
        data-chat-textarea-focustrap
        className='w-60'
        onCloseAutoFocus={(event) => {
          /* A chosen item moves focus itself: to the file picker, or to the editor at a typed @. */
          event.preventDefault();
          if (!choseItem.current) {
            focusEditor();
          }
          choseItem.current = false;
        }}
      >
        <DropdownMenuItem
          disabled={!isAttachmentSupported}
          className='h-auto items-start'
          onSelect={() => {
            choseItem.current = true;
            handleFileSelect();
          }}
        >
          <Paperclip aria-hidden='true' className='mt-0.5' />
          <span className='flex flex-col'>
            Attach image or PDF
            {isAttachmentSupported ? null : (
              <span className='text-xs text-muted-foreground'>This model can&apos;t read images or PDFs</span>
            )}
          </span>
        </DropdownMenuItem>
        {enableContextActions ? (
          <DropdownMenuItem
            onSelect={() => {
              choseItem.current = true;
              handleAtButtonClick();
            }}
          >
            <AtSign aria-hidden='true' />
            Add context
            <DropdownMenuShortcut>@</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
