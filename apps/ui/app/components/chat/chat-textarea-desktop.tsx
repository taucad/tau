import { chatComposerPaddingClassName } from '#components/chat/chat-input-styles.js';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import type { Editor } from '@tiptap/core';
import type { AttachmentDirectories } from '#hooks/use-attachment-source.js';
import { AtSign, Paperclip, Plus } from 'lucide-react';
import { useDictation } from '#components/dictation/use-dictation.js';
import { DictationControl, DictationFeedback } from '#components/dictation/dictation-controls.js';
import type { AcpSessionData } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { FileEntry } from '@taucad/types';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { ChatAgentSheet, ghostPillClass } from '#components/chat/chat-agent-sheet.js';
import { ChatAgentModeControl } from '#components/chat/chat-mode-selector.js';
import { useAgentConfig } from '#components/chat/use-agent-config.js';
import { ChatKernelSelector } from '#components/chat/chat-kernel-selector.js';
import { ChatKernelFallbackNotice } from '#components/chat/chat-kernel-fallback-notice.js';
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
import { useAgentHostPlacements } from '#hooks/use-cad-agent-config.js';
import { ChatEditor } from '#components/chat/tiptap/chat-editor.js';
import type { CadReference } from '@taucad/chat/references';
import {
  buildEditorContentJson,
  cadReferencesOfChips,
  chatComposerPlaceholder,
  extractContent,
  useChatEditor,
} from '#components/chat/tiptap/use-chat-editor.js';
import type { ContextSuggestionItem, SlashCommandItem } from '#components/chat/tiptap/suggestion-types.js';
import type { ClipboardPasteEvent } from '#components/chat/chat-paste-handler.js';
import { createScreenshotContextHandler } from '#components/chat/screenshot-actions.utils.js';
import { buildPastedContent, commandInvocation } from '#utils/at-reference.utils.js';
import { skillMetadataToSlashCommand, useSkillsCatalogState } from '#hooks/use-skills-catalog.js';
import type { ChatContextReference } from '#components/chat/chat-context-insertion.js';

const dragOverlayCopy: Record<ChatTextareaDragKind, string> = {
  image: 'Add files',
  viewer: 'Add screenshot',
  reference: 'Add reference',
};

type ChatTextareaDesktopProperties = {
  /** Serve a native input in the editor area until the rich editor exists (see `ChatEarlyInput`). */
  readonly enableEarlyInput?: boolean;
  readonly className?: string;
  readonly enableAutoFocus?: boolean;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;
  readonly creationLocationControl?: React.ReactNode;
  readonly isSubmitDisabled?: boolean;
  /** Which composer this is: the edit box speaks as one and owns shortcuts only while focused (F6, F19). */
  readonly mode?: 'main' | 'edit';
  /** Rest as one row on a phone until focused or drafted; see `ChatTextareaProperties`. */
  readonly enableMobileCollapse?: boolean;
  /** Whether focus is inside the composer or its portalled menus. */
  readonly isFocused?: boolean;

  // State
  readonly dragKind: ChatTextareaDragKind | undefined;
  readonly isSubmitting: boolean;
  readonly canResume?: boolean;
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
  readonly chats: ChatRecord[];
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
  readonly handleSubmit: (finalizedText?: string, references?: readonly CadReference[]) => Promise<void>;
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
  readonly handleTextareaFocus?: () => void;
  readonly handleTextareaBlur: () => void;
  readonly removeAttachment: (index: number) => void;
};

/** Map one ACP command to the composer menu; its chip's text is the agent's exact invocation. @public */
export const acpCommandToSlashCommand = (
  command: AcpSessionData['commands'][number],
  agentId: string,
): SlashCommandItem => {
  const invocation = commandInvocation(command.name);
  return {
    id: invocation,
    label: invocation,
    title: command.name,
    description: command.description,
    ...(command.input === null || command.input === undefined ? {} : { fullDescription: command.input.hint }),
    group: 'Commands',
    source: agentId,
  };
};

/**
 * At rest a collapsible composer is one row; anything in flight — focus, a
 * draft, dictation, a send, a drag — unfolds it. The container variants
 * confine the collapsed layout to mobile-width composer surfaces.
 *
 * @returns Whether the composer collapses: it may, and nothing holds it open.
 */
const isComposerAtRest = (input: {
  readonly enableMobileCollapse: boolean | undefined;
  readonly isFocused: boolean | undefined;
  readonly dictationActive: boolean;
  readonly isSubmitting: boolean;
  readonly dragKind: ChatTextareaDragKind | undefined;
  readonly inputText: string;
  readonly attachments: readonly DraftAttachment[];
}): boolean =>
  input.enableMobileCollapse === true &&
  input.isFocused !== true &&
  !input.dictationActive &&
  !input.isSubmitting &&
  input.dragKind === undefined &&
  input.inputText.trim().length === 0 &&
  input.attachments.length === 0;

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
  enableEarlyInput = false,
  className,
  enableAutoFocus = true,
  enableContextActions = true,
  enableKernelSelector = true,
  creationLocationControl,
  isSubmitDisabled = false,
  mode = 'main',
  enableMobileCollapse,
  isFocused,

  // State
  dragKind,
  isSubmitting,
  canResume = false,
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
  handleTextareaFocus,
  handleTextareaBlur,
  removeAttachment,
}: ChatTextareaDesktopProperties): React.JSX.Element {
  const catalog = useSkillsCatalogState();
  const skillsCatalog = catalog.status === 'closed' || catalog.status === 'error' ? [] : catalog.commands;

  const commands = acpSessionData?.commands;
  const slashCommandItems = useMemo(
    (): SlashCommandItem[] =>
      acpAgentId === undefined
        ? skillsCatalog.map((skillMetadata) => skillMetadataToSlashCommand(skillMetadata))
        : (commands ?? []).map((command) => acpCommandToSlashCommand(command, acpAgentId)),
    [acpAgentId, commands, skillsCatalog],
  );
  /* Keyed by content: the skills catalog re-reads on every tree change, and a new
   * identity must not re-run rehydration when the offered tokens are the same. */
  const knownTokensKey = slashCommandItems
    .filter((item) => item.enabled !== false)
    .map((item) => item.label)
    .join('\n');
  const knownTokens = useMemo(() => new Set(knownTokensKey === '' ? [] : knownTokensKey.split('\n')), [knownTokensKey]);

  /* Texts the editor reported that no render has shown back yet; see the rehydration below. */
  const unconfirmedTextsRef = useRef<string[]>([]);
  const handleEditorUpdate = useCallback(
    (content: { text: string }) => {
      unconfirmedTextsRef.current.push(content.text);
      setDraftText(content.text);
    },
    [setDraftText],
  );

  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Tiptap initializes after the composer hooks.
  const editorRef = useRef<Editor | null>(null);
  const insertTranscript = useCallback((text: string): void => {
    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed) {
      return;
    }
    const precedingText = extractContent(currentEditor).text;
    const separator = precedingText === '' || /\s$/u.test(precedingText) ? '' : ' ';
    currentEditor
      .chain()
      .focus('end')
      .insertContent({ type: 'text', text: separator + text })
      .run();
  }, []);
  const { draftActorRef } = useChatComposer();
  const latestDraftOwner = useRef(draftActorRef);
  useLayoutEffect(() => {
    latestDraftOwner.current = draftActorRef;
  }, [draftActorRef]);
  const dictation = useDictation(insertTranscript, draftActorRef);
  /* The chips' structured references travel beside the text only when the draft has some. */
  const submitWithReferences = useCallback(
    async (text: string | undefined, references: readonly CadReference[]): Promise<void> =>
      references.length === 0 ? handleSubmit(text) : handleSubmit(text, references),
    [handleSubmit],
  );
  const submitWithDictation = useCallback(async (): Promise<void> => {
    if (dictation.phase !== 'idle') {
      if (dictation.phase !== 'recording' || !(await dictation.stop())) {
        return;
      }
      const currentEditor = editorRef.current;
      if (currentEditor && !currentEditor.isDestroyed && latestDraftOwner.current === draftActorRef) {
        const content = extractContent(currentEditor);
        await submitWithReferences(content.text, cadReferencesOfChips(content.contextChips));
      }
      return;
    }
    const currentEditor = editorRef.current;
    await submitWithReferences(
      undefined,
      currentEditor && !currentEditor.isDestroyed
        ? cadReferencesOfChips(extractContent(currentEditor).contextChips)
        : [],
    );
  }, [dictation.phase, dictation.stop, draftActorRef, submitWithReferences]);
  const escapeWithDictation = useCallback((): void => {
    if (dictation.phase === 'idle') {
      onEscapePressed?.();
    } else {
      dictation.cancel();
    }
  }, [dictation.cancel, dictation.phase, onEscapePressed]);

  /* What the served native input held when the editor took over; the draft already has its text. */
  const [earlyInput, setEarlyInput] = useState<EarlyChatInput>();
  const editorPlaceholder = mode === 'edit' ? 'Edit your message' : chatComposerPlaceholder;
  const chatEditor = useChatEditor({
    onSubmit: submitWithDictation,
    onEscape: escapeWithDictation,
    onUpdate: handleEditorUpdate,
    treeService,
    chats,
    actionItems,
    slashCommandItems,
    placeholder: editorPlaceholder,
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
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const rehydratedTokensRef = useRef(knownTokens);
  useEffect(() => {
    if (!editor) {
      return undefined;
    }
    const current = extractContent(editor);
    /* This render's text can trail the editor by keystrokes it already holds: when tokens or the tree
     * arrive mid-typing, the effect re-runs with an older text the editor itself reported, and writing
     * that back deletes what was typed since. A render with the newer text follows, so wait for it. */
    if (inputText === current.text) {
      unconfirmedTextsRef.current = [];
    } else if (unconfirmedTextsRef.current.includes(inputText)) {
      return undefined;
    }
    const tokensChanged = rehydratedTokensRef.current !== knownTokens;
    rehydratedTokensRef.current = knownTokens;
    if (inputText === '') {
      if (current.text !== '') {
        editor.commands.clearContent(false);
      }
      return undefined;
    }
    const lazyTree: Map<string, FileEntry> = treeService?.getTreeSnapshot() ?? new Map<string, FileEntry>();
    const segments = buildPastedContent(inputText, {
      fileTree: lazyTree,
      chats,
      knownTokens,
    });
    /* Same text is a no-op (typing must not move the caret) unless tokens that arrived
     * late (catalog, agent commands) now resolve to more chips — a restored draft rehydrates. */
    const chipCount = segments.filter((segment) => segment.type === 'chip').length;
    if (inputText === current.text && (!tokensChanged || chipCount <= current.contextChips.length)) {
      return undefined;
    }
    /* F20: each chip's node view calls `flushSync`, which React refuses inside
     * its own commit, so the content lands in a microtask after it. */
    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent && !editor.isDestroyed) {
        editor.commands.setContent(buildEditorContentJson(segments), {
          emitUpdate: false,
        });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [inputText, editor, treeService, chats, knownTokens]);

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
          return {
            id: path,
            label,
            chipType: isFolder ? 'folder' : 'file',
            path,
          };
        }),
      );
    };
    addContextReferencesRef.current = insertContextReferences;
    return () => {
      addContextChipsRef.current = undefined;
      addContextReferencesRef.current = undefined;
    };
  }, [addContextChipsRef, addContextReferencesRef, insertContextReferences]);

  /* The editor takes the native input's text, selection and focus in the commit that replaces it,
   * before the browser can deliver another key: anything later (a microtask, a frame) lets keys typed
   * during the handover land on the page and vanish. Plain text needs no chip node views, so it can be
   * installed synchronously; the draft rehydration that follows finds the same text and leaves it. */
  useLayoutEffect(() => {
    if (!editor || !earlyInput) {
      return;
    }
    if (earlyInput.edited) {
      editor.commands.setContent(buildEditorContentJson([{ type: 'text', value: earlyInput.text }]), {
        emitUpdate: false,
      });
    }
    if (!(earlyInput.focused || (enableAutoFocus && !earlyInput.edited && earlyInput.focusUnclaimed))) {
      return;
    }
    if (earlyInput.edited) {
      const position = (offset: number): number => offset + 1 + earlyInput.text.slice(0, offset).split('\n').length - 1;
      const from = position(earlyInput.start);
      const to = position(earlyInput.end);
      editor.commands.setTextSelection(earlyInput.direction === 'backward' ? { from: to, to: from } : { from, to });
    } else {
      editor.commands.setTextSelection(editor.state.doc.content.size);
    }
    // Tiptap's `focus` command waits a frame; the next key may already be on its way, so focus the view now.
    editor.view.focus();
  }, [editor, earlyInput, enableAutoFocus]);

  useEffect(() => {
    // With an early input, focus is the native input's to hand over (above), not the mount's.
    if (!editor || enableEarlyInput || !enableAutoFocus) {
      return undefined;
    }
    // Rehydration installs the draft in a microtask. Focus after it so opening
    // a history message keeps its first line visible instead of scrolling to the end.
    const frame = requestAnimationFrame(() => {
      if (!editor.isDestroyed) {
        editor.commands.focus(mode === 'edit' ? 'start' : 'end');
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [enableAutoFocus, enableEarlyInput, editor, mode]);

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

  const dictationActive = dictation.phase !== 'idle';
  const dictationPending = dictationActive && dictation.phase !== 'recording';
  const sendRefusal = dictationPending
    ? 'Wait for dictation to finish'
    : sendRefusalOf({
        sendBlockReason,
        isSubmitting,
        isAttaching,
        isSubmitDisabled,
        isEmpty: !dictationActive && !canResume && inputText.trim().length === 0 && attachments.length === 0,
      });
  const dictationControl = useMemo(
    () =>
      /* Shown while availability is still being asked, so the bar is laid out as it will be; only a
       * deployment without dictation loses it. */
      dictation.available === false ? undefined : (
        <DictationControl
          isPending={dictation.available === undefined}
          phase={dictation.phase}
          waveform={dictation.waveform}
          onStart={dictation.start}
          onStop={dictation.stop}
          onCancel={dictation.cancel}
        />
      ),
    [dictation.available, dictation.phase, dictation.waveform, dictation.start, dictation.stop, dictation.cancel],
  );
  const blockReasonId = useId();
  const collapse = collapsibleClassNames(enableMobileCollapse, dictation.available !== false);
  const editorView = (
    <ChatEditor
      editor={editor}
      contextSuggestionState={chatEditor.contextSuggestionState}
      slashCommandState={chatEditor.slashCommandState}
      contextKeydownRef={chatEditor.contextKeydownRef}
      slashKeydownRef={chatEditor.slashKeydownRef}
      isLoading={isSubmitting}
      className={collapse.editorContent}
    />
  );
  const isCollapsed = isComposerAtRest({
    enableMobileCollapse,
    isFocused,
    dictationActive,
    isSubmitting,
    dragKind,
    inputText,
    attachments,
  });
  /* F19: the beam follows the box's corners. */
  const radius = mode === 'edit' ? 'rounded-lg' : 'rounded-2xl';

  return (
    // Outer wrapper is purely a positioning context for the beam overlay
    // and intentionally takes NO `className` passthrough — see
    // ChatTextareaBorderBeam's docs for why. All layout / styling
    // overrides live on the inner border container below.
    <div className='@container/composer relative w-full' data-chat-composer={mode}>
      <ChatTextareaBorderBeam isActive={isSubmitting} className={radius} />

      <div
        ref={containerReference}
        className={cn(
          'group/chat-textarea @container',
          'relative flex w-full flex-col border border-border/60 bg-background',
          chatComposerPaddingClassName,
          radius,
          collapse.composer,
          'cursor-text overflow-hidden',
          'shadow-sm',
          'has-[.tiptap:focus-visible]:focus-outline',
          className,
        )}
        data-collapsed={isCollapsed ? '' : undefined}
        onFocus={handleTextareaFocus}
        onBlur={handleTextareaBlur}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {acpAgentId === undefined && (catalog.status === 'closed' || catalog.status === 'error') ? (
          <div role='status' className='flex items-center justify-between gap-2 px-3 pb-2 text-xs'>
            <span>Skill updates unavailable</span>
            <Button variant='ghost' size='sm' aria-label='Retry skill updates' onClick={catalog.retry}>
              Retry
            </Button>
          </div>
        ) : undefined}
        {/* Only a session's chat can hold a kernel this runtime cannot run. */}
        <ChatKernelFallbackNotice />
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
        <div
          className={cn(
            'max-h-48 min-w-0 overflow-y-auto overscroll-contain',
            mode === 'main' && 'max-h-[min(12rem,30cqh)]',
            collapse.editor,
          )}
          onClick={handleEditorAreaClick}
        >
          {enableEarlyInput ? (
            <ChatEarlyInput
              placeholder={editorPlaceholder}
              isHostReady={editor !== null}
              className={collapse.editorContent}
              onAdopt={setEarlyInput}
            >
              {editorView}
            </ChatEarlyInput>
          ) : (
            editorView
          )}
        </div>

        {/* Drag and drop feedback */}
        {dragKind ? (
          <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs'>
            <p className='rounded-md border bg-background/50 px-2 font-medium text-primary'>
              {dragOverlayCopy[dragKind]}
            </p>
          </div>
        ) : null}

        <DictationFeedback transcript={dictation.transcript} />
        <ChatTextareaBar
          dictationControl={dictationControl}
          isDictating={dictationActive}
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
          canResume={canResume}
          sendRefusal={sendRefusal}
          describedBy={sendBlockReason === undefined ? undefined : blockReasonId}
          formattedCancelKeyCombination={formattedCancelKeyCombination}
          handleSubmit={submitWithDictation}
          handleCancelClick={handleCancelClick}
        />
      </div>
    </div>
  );
});

ChatTextareaDesktop.displayName = 'ChatTextareaDesktop';

/* The collapsed composer (mobile-width surfaces): one row. The editor makes
 * room for + on the left and dictation and Send on the right; the bar rises
 * onto the editor's line, and every other control fades out in place, keeping
 * its width so the bar's measured collapse (D6) never re-runs. */
const collapseTransition =
  'transition-[padding,margin,border-radius,corner-shape,opacity,visibility] duration-200 ease-out motion-reduce:transition-none';

/**
 * A collapsible composer's own classes: the box's corners, and the editor's
 * room for + on the left and for dictation (when offered) and Send on the right.
 *
 * @returns The composer's, the editor area's and the editor content's classes; none when not collapsible.
 */
const collapsibleClassNames = (
  isCollapsible: boolean | undefined,
  hasDictation: boolean | undefined,
): {
  readonly composer?: string;
  readonly editor?: string;
  readonly editorContent?: string;
} =>
  isCollapsible === true
    ? {
        composer: cn(
          collapseTransition,
          // Half the Send diameter + its inset + the border. A finite radius interpolates without pill clamping.
          '[corner-shape:superellipse(1.5)] @max-[768px]/composer:data-[collapsed]:rounded-[calc(var(--spacing)*5.5+1px)] @max-[768px]/composer:data-[collapsed]:[corner-shape:round] @max-[768px]/composer:data-[collapsed]:pt-2.5',
        ),
        editor: cn(
          collapseTransition,
          // Under a coarse pointer the row also clears the controls' 6px touch rings, so a tap at the
          // editor's edge reaches the editor, not + or dictation (see `composerTouchTargetsClassName`).
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pl-7 pointer-coarse:@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pl-8.5',
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:max-h-6 @max-[768px]/composer:group-data-[collapsed]/chat-textarea:overflow-hidden',
          hasDictation === true
            ? // Touch also spaces dictation and Send 12px apart.
              '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-15 pointer-coarse:@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-18.5'
            : '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-7 pointer-coarse:@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-8.5',
        ),
        editorContent: cn(
          collapseTransition,
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:[&_.tiptap]:overflow-hidden',
          // Match the collapsed editor's 24px box on fine pointers as well as touch devices.
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pb-0 @max-[768px]/composer:group-data-[collapsed]/chat-textarea:leading-6',
        ),
      }
    : {};

/** The bar, risen onto the editor's line; taps between its controls reach the editor. */
const collapsedBarClassName = cn(
  collapseTransition,
  '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:-mt-6.5 @max-[768px]/composer:group-data-[collapsed]/chat-textarea:pointer-events-none',
);

/** Controls a collapsed composer hides: every one but +, dictation and Send. */
const collapsibleControlsClassName = cn(
  collapseTransition,
  'flex min-w-0 flex-row items-center empty:hidden',
  '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:invisible @max-[768px]/composer:group-data-[collapsed]/chat-textarea:opacity-0',
);

/**
 * Touch targets (I3). The bar keeps its 28px controls, so the composer keeps its
 * geometry, but under a coarse pointer each control's hit area reaches 40px and
 * the controls sit 12px apart, so neighbouring hit areas meet without overlapping.
 */
const composerTouchTargetsClassName =
  "pointer-coarse:gap-3 pointer-coarse:[&_button]:relative pointer-coarse:[&_button]:after:absolute pointer-coarse:[&_button]:after:-inset-1.5 pointer-coarse:[&_button]:after:content-['']";

/** Keyboard hints are for keyboards (I7). */
const keyboardHintClassName = 'pointer-coarse:hidden';

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
    let disposed = false;
    const fit = (): void => {
      if (disposed) {
        return;
      }
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
    mutation.observe(bar, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    /* Webfonts change the name's width without a resize. */
    const refitWhenFontsLoad = async (): Promise<void> => {
      await document.fonts.ready;
      fit();
    };
    if (document.fonts.status === 'loading') {
      void refitWhenFontsLoad();
    }
    return () => {
      disposed = true;
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
  dictationControl,
  isDictating = false,
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
  canResume = false,
  sendRefusal,
  describedBy,
  formattedCancelKeyCombination,
  handleSubmit,
  handleCancelClick,
}: {
  readonly dictationControl?: React.ReactNode;
  readonly isDictating?: boolean;
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
  readonly canResume?: boolean;
  readonly sendRefusal: string | undefined;
  readonly describedBy: string | undefined;
  readonly formattedCancelKeyCombination: string;
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancelClick: () => void;
}): React.JSX.Element {
  const barRef = useRef<HTMLDivElement>(null);
  useBarCollapse(barRef);
  const { targets: placements } = useAgentHostPlacements();
  const { execution } = useChatComposer().execution;
  const discoveredAgent =
    execution.kind === 'acp'
      ? placements
          .find((placement) => placement.hostId === execution.hostId)
          ?.externalAgents?.find((agent) => agent.id === execution.agentId)
      : undefined;
  const selectedModel = execution.kind === 'acp' ? (execution.model ?? discoveredAgent?.defaultModel) : undefined;
  const discoveredThoughtLevel =
    selectedModel === undefined
      ? discoveredAgent?.thoughtLevel
      : discoveredAgent?.models.find((model) => model.id === selectedModel)?.thoughtLevel;
  const agentConfig = useAgentConfig(acpSessionData, status, [
    ...(discoveredAgent?.configOptions ?? []),
    ...(discoveredThoughtLevel ? [discoveredThoughtLevel] : []),
  ]);
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
      className={cn(
        'group/bar flex items-center justify-between gap-2 px-2',
        composerTouchTargetsClassName,
        collapsedBarClassName,
      )}
    >
      <div
        data-slot='composer-left'
        className='pointer-events-auto flex shrink-0 flex-row items-center gap-0.5 pointer-coarse:gap-3'
      >
        <ChatAddMenu
          enableContextActions={enableContextActions}
          isAttachmentSupported={attachmentInputSupported}
          handleAtButtonClick={handleAtButtonClick}
          handleFileSelect={handleFileSelect}
          focusEditor={focusEditor}
        />
        <div
          data-slot='composer-collapsible'
          className={cn(collapsibleControlsClassName, 'gap-0.5 pointer-coarse:gap-3')}
        >
          <ChatAgentModeControl agentConfig={agentConfig} focusEditor={focusEditor} enableShortcut={ownsShortcuts} />
          {creationLocationControl}
          {enableKernelSelector ? <ChatTextareaKernelControl focusEditor={focusEditor} /> : null}
        </div>
        <input
          ref={fileInputReference}
          multiple
          type='file'
          accept={attachmentAccept}
          className='hidden'
          onChange={handleFileChange}
        />
      </div>
      <div
        data-slot='composer-right'
        className='pointer-events-auto flex min-w-0 flex-row items-center gap-1 pointer-coarse:gap-3'
      >
        <div
          data-slot='composer-collapsible'
          className={cn(collapsibleControlsClassName, 'gap-1 pointer-coarse:gap-3')}
        >
          <ChatContextIndicator />
          <ChatAgentSheet
            agentConfig={agentConfig}
            placements={placements}
            focusEditor={focusEditor}
            enableShortcut={ownsShortcuts}
          />
        </div>
        {dictationControl}
        <ChatTextareaSubmitButton
          status={status}
          isSubmitting={isSubmitting}
          isDictating={isDictating}
          canResume={canResume}
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
        {/* The same word as its name (I6); the menu says what it adds. */}
        <TooltipContent>Add</TooltipContent>
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
            <DropdownMenuShortcut className={keyboardHintClassName}>@</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
