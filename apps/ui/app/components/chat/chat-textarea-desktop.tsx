import {
  chatComposerAddTriggerClassName,
  chatComposerBarClassName,
  chatComposerBarLeftClassName,
  chatComposerBarRightClassName,
  chatComposerCollapseTransitionClassName,
  chatComposerCollapsibleControlsClassName,
  chatComposerEditorAreaClassName,
  chatComposerFrameClassName,
  chatComposerMainEditorAreaClassName,
  chatComposerShellClassName,
} from '@taucad/chat-ui/components/chat-input-styles';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { queuedSendStatus } from '#components/hand-off/hand-off.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import type { Editor, JSONContent } from '@tiptap/core';
import type { AttachmentDirectories } from '#hooks/use-attachment-source.js';
import { AtSign, Paperclip, Plus, TriangleAlert } from 'lucide-react';
import { useDictation } from '#components/dictation/use-dictation.js';
import { DictationControl, DictationFeedback } from '#components/dictation/dictation-controls.js';
import type { AcpSessionData, CadAgentExecution } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { FileEntry } from '@taucad/types';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { ChatAgentSheet, ghostPillClass } from '#components/chat/chat-agent-sheet.js';
import { ChatAgentModeControl } from '#components/chat/chat-mode-selector.js';
import { useAgentConfig } from '#components/chat/use-agent-config.js';
import { KernelPreferenceSelector } from '#components/chat/chat-kernel-selector.js';
import { kernelPillFace } from '#components/chat/kernel-picker-layout.js';
import { KernelPillContent, kernelPillStyles } from '#components/chat/kernel-pill.js';
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
import { cn } from '@taucad/ui/utils/cn';
import { ChatContextIndicator } from '#components/chat/chat-context-indicator.js';
import { ChatTextareaBorderBeam } from '@taucad/chat-ui/components/chat-textarea-border-beam';
import { ChatTextareaAttachmentRail } from '#components/chat/chat-textarea-image-strip.js';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';
import type { ChatAttachmentAddOptions, ChatTextareaDragKind } from '#components/chat/chat-textarea-types.js';
import { ChatDropOverlay, useChatDropZone } from '#components/chat/chat-drop-zone.js';
import type { ChatDragEvent } from '#components/chat/chat-drop-zone.js';
import type { DraftAttachment, PendingDraftImage } from '@taucad/chat-ui/hooks/draft.machine';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useAgentHostPlacements } from '#hooks/use-cad-agent-config.js';
import { ChatEditor } from '@taucad/chat-ui/components/tiptap/chat-editor';
import type { CadReference } from '@taucad/chat/references';
import {
  buildEditorContentJson,
  cadReferencesOfChips,
  extractContent,
  useChatEditor,
} from '#components/chat/tiptap/use-chat-editor.js';
import type { ContextSuggestionItem, SlashCommandItem } from '@taucad/chat-ui/components/tiptap/suggestion-types';
import type { ClipboardPasteEvent } from '@taucad/chat-ui/components/chat-paste-handler';
import { createScreenshotContextHandler } from '@taucad/chat-ui/components/screenshot-actions.utils';
import { buildPastedContent, commandInvocation } from '@taucad/chat-ui/utils/at-reference.utils';
import { skillMetadataToSlashCommand, useSkillsCatalogState } from '#hooks/use-skills-catalog.js';
import type { SkillsCatalogState } from '#hooks/use-skills-catalog.js';
import type { ChatContextReference } from '@taucad/chat-ui/components/chat-context-insertion';

/** One identity for "no skills", so an unavailable catalog does not re-derive the slash items each render. */
const noSkills: SkillsCatalogState['commands'] = [];
/** One identity for "nothing converting", so the memoised rail is not re-rendered for a new empty list. */
const noPendingImages: readonly PendingDraftImage[] = [];

/**
 * What becomes of an Enter queued on a painted draft nobody edited, decided by the draft's owner from the chat's record
 * (ruling 2026-11-17T03:28Z): wait while the record is unread, send when it holds the painted text, or cancel and show
 * the record's text.
 */
export type PaintedSendVerdict =
  | { readonly kind: 'wait' }
  | { readonly kind: 'send' }
  | { readonly kind: 'cancel'; readonly recordText: string };

/** What the status says once a queued send on a painted draft is cancelled because the saved draft differs. */
export const paintedSendCancelledStatus = 'Queued send cancelled: the saved draft differs.';

type ChatTextareaDesktopProperties = {
  readonly earlyInput?: EarlyChatInput;
  /** For an Enter queued on a painted draft: whether it waits, is sent or is cancelled (see {@link PaintedSendVerdict}). */
  readonly paintedSendVerdict?: PaintedSendVerdict;
  /**
   * Called once `earlyInput` is in the editor, so its owner does not hand it over again. Returns whether a painted
   * draft becomes the draft (its owner's record is not read yet and holds nothing), so the editor keeps it.
   */
  readonly onEarlyInputAdopted?: () => boolean;
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
  /** Images still converting or storing; the rail holds their thumbnail slots. */
  readonly pendingImages?: readonly PendingDraftImage[];
  readonly inputText: string;
  readonly attachments: readonly DraftAttachment[];
  readonly attachmentDirectory: AttachmentDirectories;
  readonly sendBlockReason: string | undefined;
  readonly attachmentAccept: string;
  readonly attachmentInputSupported: boolean;
  readonly status: string;
  /** Whether Stop replaces Send (`useChatTextareaLogic`'s `canStop`). */
  readonly canStop?: boolean;
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
  readonly handleDragOver: (event: ChatDragEvent) => void;
  readonly handleDragLeave: () => void;
  readonly handleDrop: (event: ChatDragEvent) => Promise<void>;
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

/** Drag feedback: over the whole area when the composer takes its drops there, else over its own box. */
function ChatDropFeedback({
  dragKind,
  dropZone,
  className,
}: {
  readonly dragKind: ChatTextareaDragKind | undefined;
  readonly dropZone: HTMLElement | undefined;
  readonly className: string;
}): React.ReactNode {
  if (dragKind === undefined) {
    return null;
  }
  return dropZone === undefined ? (
    <ChatDropOverlay kind={dragKind} className={className} />
  ) : (
    createPortal(<ChatDropOverlay kind={dragKind} />, dropZone)
  );
}

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
  readonly pendingImages: readonly PendingDraftImage[];
}): boolean =>
  input.enableMobileCollapse === true &&
  input.isFocused !== true &&
  !input.dictationActive &&
  !input.isSubmitting &&
  input.dragKind === undefined &&
  input.inputText.trim().length === 0 &&
  input.attachments.length === 0 &&
  input.pendingImages.length === 0;

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
 * A native input's text as the editor's document: one paragraph per line, as the editor reports its text back.
 *
 * @param text - The text.
 * @returns The document.
 */
const plainTextDocument = (text: string): JSONContent => ({
  type: 'doc',
  content: text.split('\n').map((line) => ({
    type: 'paragraph',
    ...(line === '' ? {} : { content: [{ type: 'text', text: line }] }),
  })),
});

/**
 * Whether a send queued in the native input (P4) may go now: Send would send, and the chat has an agent to send with.
 * A first visit has no Tau model until the catalog answers, and a send made then is refused. It also waits for
 * dictation to end, since only Send stops a recording and sends its words.
 *
 * @returns Whether the queued send may go.
 */
const isQueuedSendPermitted = (
  input: Omit<Parameters<typeof sendRefusalOf>[0], 'isEmpty'> & {
    readonly execution: CadAgentExecution;
    readonly dictationPhase: string;
  },
): boolean =>
  input.dictationPhase === 'idle' &&
  (input.execution.kind !== 'tau' || input.execution.model !== '') &&
  sendRefusalOf({ ...input, isEmpty: false }) === undefined;

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
  earlyInput,
  onEarlyInputAdopted,
  paintedSendVerdict: ownerPaintedSendVerdict,
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
  pendingImages = noPendingImages,
  inputText,
  attachments,
  attachmentDirectory,
  sendBlockReason,
  attachmentAccept,
  attachmentInputSupported,
  status,
  canStop = false,
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
  /* `closed` is a real close: an absent or idle catalog reports `registering` (use-observation). */
  const isCatalogUnavailable = catalog.status === 'closed' || catalog.status === 'error';
  const skillsCatalog = isCatalogUnavailable ? noSkills : catalog.commands;
  const { retry: retrySkills } = catalog;
  const skillsRecovery = useMemo(
    () => (acpAgentId === undefined && isCatalogUnavailable ? <ChatSkillsRecovery onRetry={retrySkills} /> : undefined),
    [acpAgentId, isCatalogUnavailable, retrySkills],
  );

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
  /* P4: Enter pressed in the native input before this existed is one send, made once the editor holds the adopted
   * text and sending is permitted (below). Any edit cancels it, as one in the native input would. */
  const queuedSubmitRef = useRef(earlyInput?.submitQueued === true);
  /* A15d (C10, the operator's ruling of 2026-11-13T13:14Z, item 5): the queued send is visible until it is sent or
   * cancelled — Send shows it pending and its status says so — and Escape cancels it, as an edit does. */
  const [isQueuedSubmitShown, setIsQueuedSubmitShown] = useState(earlyInput?.submitQueued === true);
  const cancelQueuedSubmit = useCallback((): void => {
    queuedSubmitRef.current = false;
    setIsQueuedSubmitShown(false);
  }, []);
  /* A painted draft that changed under its queued Enter before the send could go (Home's record read after adoption
   * with another text or an attachment): the Enter was not for this draft, so it is cancelled, and says so. */
  const [isPaintedDraftReplaced, setIsPaintedDraftReplaced] = useState(false);
  const cancelReplacedPaintedSend = useCallback((): void => {
    queuedSubmitRef.current = false;
    setIsPaintedDraftReplaced(true);
  }, []);
  const handleEditorUpdate = useCallback(
    (content: { text: string }) => {
      cancelQueuedSubmit();
      unconfirmedTextsRef.current.push(content.text);
      setDraftText(content.text);
    },
    [cancelQueuedSubmit, setDraftText],
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
  const {
    draftActorRef,
    execution: { execution },
  } = useChatComposer();
  const latestDraftOwner = useRef(draftActorRef);
  useLayoutEffect(() => {
    /* Another chat's draft, in the same mounted composer: an Enter queued for the previous chat is not for this one. */
    if (latestDraftOwner.current !== draftActorRef) {
      cancelQueuedSubmit();
    }
    latestDraftOwner.current = draftActorRef;
  }, [cancelQueuedSubmit, draftActorRef]);
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

  const chatEditor = useChatEditor({
    initialText: earlyInput?.edited === true || earlyInput?.prefilled === true ? earlyInput.text : undefined,
    onSubmit: submitWithDictation,
    onEscape: escapeWithDictation,
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
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const rehydratedTokensRef = useRef(knownTokens);
  /* A painted draft goes into the editor as plain text (Home's `initialText`, or the handover below): when the draft
   * delivers that text, its tokens are built into chips once, as a restored draft's are. */
  const paintedTextRef = useRef(earlyInput?.prefilled === true ? earlyInput.text : undefined);
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
    const isPaintedText = inputText !== '' && paintedTextRef.current === inputText;
    if (isPaintedText) {
      paintedTextRef.current = undefined;
    }
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
    if (inputText === current.text && (!(tokensChanged || isPaintedText) || chipCount <= current.contextChips.length)) {
      return undefined;
    }
    /* F20: each chip's node view calls `flushSync`, which React refuses inside
     * its own commit, so the content lands in a microtask after it. */
    let isCurrent = true;
    queueMicrotask(() => {
      if (!isCurrent || editor.isDestroyed) {
        return;
      }
      /* The editor may hold this text by now (a painted draft written at its handover, with its caret): nothing to do. */
      const latest = extractContent(editor);
      if (latest.text !== inputText || chipCount > latest.contextChips.length) {
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

  /* Home's native input held focus, with this box's outline, until this replaced it. The outline holds until
   * the editor exists, which takes focus in the same commit (below) so its own outline takes over in the same
   * style pass, or until the person moves focus elsewhere first. The swap never paints the box without it
   * (gate finding 2, #1562). */
  const [isFocusHandoverPending, setIsFocusHandoverPending] = useState(earlyInput?.focused === true);
  const isHandoverOutlined = isFocusHandoverPending && !editor;
  useEffect(() => {
    if (!isHandoverOutlined) {
      return undefined;
    }
    const endHandover = (): void => {
      setIsFocusHandoverPending(false);
    };
    document.addEventListener('focusin', endHandover);
    return () => {
      document.removeEventListener('focusin', endHandover);
    };
  }, [isHandoverOutlined]);
  const handedOverRef = useRef<EarlyChatInput | undefined>(undefined);
  /* The editor takes the native input's text, selection and focus in the commit that replaces it, before the
   * browser can deliver another key: anything later (a microtask, a frame) lets keys typed during the
   * handover land on the page and vanish. On Home its text is already in place (`initialText`); the project
   * route's served input is handed over once its lane is revealed, after this editor exists, so the edit is
   * written into the editor here, as an edit, so the draft follows it. */
  useLayoutEffect(() => {
    if (!editor || !earlyInput || handedOverRef.current === earlyInput) {
      return;
    }
    handedOverRef.current = earlyInput;
    const isPaintedDraftTaken = onEarlyInputAdopted?.() ?? false;
    if (earlyInput.edited && extractContent(editor).text !== earlyInput.text) {
      editor.commands.setContent(plainTextDocument(earlyInput.text), { emitUpdate: true });
    } else if (
      (isPaintedDraftTaken || inputText === earlyInput.text) &&
      earlyInput.prefilled &&
      extractContent(editor).text === ''
    ) {
      /* A painted draft stays in the box while the draft takes it (`onEarlyInputAdopted`), not written as an edit, so
       * the chat's record still wins when it lands (P-a: nothing leaves and comes back on arrival). A record already
       * read with the same text is written now too, rather than in the draft sync's microtask, so the painted caret
       * and selection are carried below. */
      editor.commands.setContent(plainTextDocument(earlyInput.text), { emitUpdate: false });
      paintedTextRef.current = earlyInput.text;
    }
    if (!(earlyInput.focused || (enableAutoFocus && !earlyInput.edited && earlyInput.focusUnclaimed))) {
      return;
    }
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== editor.view.dom) {
      // Focus is already elsewhere: there is nothing left to hand over.
      return;
    }
    /* A painted draft carries its caret and selection too, while the editor holds that text (P-a). */
    if (earlyInput.edited || (earlyInput.prefilled && extractContent(editor).text === earlyInput.text)) {
      const position = (offset: number): number => offset + 1 + earlyInput.text.slice(0, offset).split('\n').length - 1;
      const from = position(earlyInput.start);
      const to = position(earlyInput.end);
      editor.commands.setTextSelection(earlyInput.direction === 'backward' ? { from: to, to: from } : { from, to });
      /* The native input kept its caret in view; the editor shares its metrics, so keeping the caret in view keeps
       * the person's place in a draft longer than the box (P4: scroll position). */
      editor.commands.scrollIntoView();
    } else {
      editor.commands.setTextSelection(editor.state.doc.content.size);
    }
    // Tiptap's `focus` command waits a frame; the next key may already be on its way, so focus the view now.
    editor.view.focus();
  }, [editor, earlyInput, enableAutoFocus, onEarlyInputAdopted, inputText]);

  /* The queued send (above): an edit in the native input after its Enter had already cancelled it (`submitQueued` is
   * false then). It waits, still queued, while sending is not permitted, and carries the editor's text, since the
   * draft this composer was rendered with can still be the previous one; it also waits for a model and dictation. */
  /* The draft's owner decides from its record (the chat's, or Home's); Home also cancels at adoption, on its early
   * input, when the draft already holds another text. */
  const paintedSendVerdict: PaintedSendVerdict | undefined =
    earlyInput?.paintedSendCancelled === undefined
      ? ownerPaintedSendVerdict
      : { kind: 'cancel', recordText: earlyInput.paintedSendCancelled.recordText };
  /* An Enter on a painted draft the record does not hold is cancelled (shown as such while the queue was still live),
   * never sent; one the record holds waits for the record to be read. */
  const isPaintedSendCancelled =
    (paintedSendVerdict?.kind === 'cancel' || isPaintedDraftReplaced) && isQueuedSubmitShown;
  const isQueuedSendShown = isQueuedSubmitShown && !isPaintedSendCancelled;
  const isQueuedSubmitPermitted = isQueuedSendPermitted({
    dictationPhase: dictation.phase,
    sendBlockReason,
    isSubmitting,
    isAttaching,
    isSubmitDisabled,
    execution,
  });
  useEffect(() => {
    if (!editor || !queuedSubmitRef.current) {
      return;
    }
    if (paintedSendVerdict?.kind === 'cancel') {
      queuedSubmitRef.current = false;
      /* The record's text shows, not the painted one: a record with another draft already put it in the draft, and
       * one with none leaves the painted text there until this. */
      if (extractContent(editor).text !== paintedSendVerdict.recordText) {
        editor.commands.setContent(plainTextDocument(paintedSendVerdict.recordText), { emitUpdate: false });
        setDraftText(paintedSendVerdict.recordText);
      }
      return;
    }
    if (paintedSendVerdict?.kind === 'wait' || !isQueuedSubmitPermitted) {
      return;
    }
    const content = extractContent(editor);
    if (
      earlyInput?.prefilled === true &&
      !earlyInput.edited &&
      (content.text !== earlyInput.text || attachments.length > 0)
    ) {
      // oxlint-disable-next-line react/set-state-in-effect -- the editor (Tiptap) is the external system read here, and only it holds the draft the Enter would send.
      cancelReplacedPaintedSend();
      return;
    }
    queuedSubmitRef.current = false;
    /* Shown as queued until the send it replays has gone: Send's own pending state follows it. */
    const replay = async (): Promise<void> => {
      try {
        await submitWithReferences(content.text, cadReferencesOfChips(content.contextChips));
      } finally {
        setIsQueuedSubmitShown(false);
      }
    };
    void replay();
  }, [
    editor,
    isQueuedSubmitPermitted,
    paintedSendVerdict,
    setDraftText,
    submitWithReferences,
    earlyInput,
    attachments,
    cancelReplacedPaintedSend,
  ]);

  const cancelQueuedSubmitOnEscape = useCallback(
    (event: React.KeyboardEvent): void => {
      if (event.key === 'Escape' && queuedSubmitRef.current) {
        cancelQueuedSubmit();
      }
    },
    [cancelQueuedSubmit],
  );

  useEffect(() => {
    // With an early input, focus is the native input's to hand over (above), not the mount's.
    if (!editor || earlyInput !== undefined || !enableAutoFocus) {
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
  }, [enableAutoFocus, editor, mode, earlyInput]);

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
      dictation.available === true ? (
        <DictationControl
          phase={dictation.phase}
          waveform={dictation.waveform}
          onStart={dictation.start}
          onStop={dictation.stop}
          onCancel={dictation.cancel}
        />
      ) : undefined,
    [dictation.available, dictation.phase, dictation.waveform, dictation.start, dictation.stop, dictation.cancel],
  );
  const blockReasonId = useId();
  const collapse = collapsibleClassNames(enableMobileCollapse, dictation.available);
  const isCollapsed = isComposerAtRest({
    enableMobileCollapse,
    isFocused,
    dictationActive,
    isSubmitting,
    dragKind,
    inputText,
    attachments,
    pendingImages,
  });
  /* F19: the beam follows the box's corners. */
  const radius = mode === 'edit' ? 'rounded-lg' : 'rounded-2xl';
  const dropZone = useChatDropZone({
    isEnabled: mode === 'main',
    containerReference,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  });
  /* With an area to take its drops, the area's listeners are the only ones, so a drop lands once. */
  const boxDropHandlers = useMemo(
    () =>
      dropZone === undefined
        ? { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop }
        : undefined,
    [dropZone, handleDragOver, handleDragLeave, handleDrop],
  );

  return (
    // Outer wrapper is purely a positioning context for the beam overlay
    // and intentionally takes NO `className` passthrough — see
    // ChatTextareaBorderBeam's docs for why. All layout / styling
    // overrides live on the inner border container below.
    <div className={chatComposerShellClassName} data-chat-composer={mode}>
      <ChatTextareaBorderBeam isActive={isSubmitting} className={radius} />

      <div
        ref={containerReference}
        className={cn(
          chatComposerFrameClassName,
          radius,
          collapse.composer,
          'has-[.tiptap:focus-visible]:focus-outline',
          /* Home's native input held focus until this replaced it: keep its outline until the editor takes focus. */
          isHandoverOutlined && 'focus-outline',
          className,
        )}
        data-collapsed={isCollapsed ? '' : undefined}
        data-queued-send={isQueuedSendShown ? '' : undefined}
        onKeyDownCapture={cancelQueuedSubmitOnEscape}
        onFocus={handleTextareaFocus}
        onBlur={handleTextareaBlur}
        {...boxDropHandlers}
      >
        {/* Only a session's chat can hold a kernel this runtime cannot run. */}
        <ChatKernelFallbackNotice />
        {/* Attachments */}
        <ChatTextareaAttachmentRail
          attachments={attachments}
          pendingImages={pendingImages}
          directory={attachmentDirectory}
          blockReason={sendBlockReason}
          blockReasonId={blockReasonId}
          size='desktop'
          onRemove={removeAttachment}
        />

        {/* Editor */}
        <div
          className={cn(
            chatComposerEditorAreaClassName,
            mode === 'main' && chatComposerMainEditorAreaClassName,
            collapse.editor,
          )}
          onClick={handleEditorAreaClick}
        >
          <ChatEditor
            editor={editor}
            contextSuggestionState={chatEditor.contextSuggestionState}
            slashCommandState={chatEditor.slashCommandState}
            contextKeydownRef={chatEditor.contextKeydownRef}
            slashKeydownRef={chatEditor.slashKeydownRef}
            isLoading={isSubmitting}
            className={collapse.editorContent}
          />
        </div>

        <ChatDropFeedback dragKind={dragKind} dropZone={dropZone} className={radius} />

        <DictationFeedback transcript={dictation.transcript} />
        {/* Present from mount for an input that queued a send, so the status is read when it changes. */}
        {earlyInput?.submitQueued === true ? (
          <span role='status' className='sr-only'>
            {isQueuedSendShown ? queuedSendStatus : isPaintedSendCancelled ? paintedSendCancelledStatus : ''}
          </span>
        ) : null}
        <ChatTextareaBar
          dictationControl={dictationControl}
          skillsRecovery={skillsRecovery}
          isDictating={dictationActive}
          composerMode={mode}
          containerReference={containerReference}
          enableContextActions={enableContextActions}
          enableKernelSelector={enableKernelSelector}
          creationLocationControl={creationLocationControl}
          acpSessionData={acpSessionData}
          status={status}
          canStop={canStop}
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
          chatComposerCollapseTransitionClassName,
          // Half the Send diameter + its inset + the border. A finite radius interpolates without pill clamping.
          '[corner-shape:superellipse(1.5)] @max-[768px]/composer:data-[collapsed]:rounded-[calc(var(--spacing)*5.5+1px)] @max-[768px]/composer:data-[collapsed]:[corner-shape:round] @max-[768px]/composer:data-[collapsed]:pt-2.5',
        ),
        editor: cn(
          chatComposerCollapseTransitionClassName,
          // Under a coarse pointer the row also clears the controls' 6px touch rings, so a tap at the
          // editor's edge reaches the editor, not + or dictation (see `chatComposerBarClassName`).
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pl-7 pointer-coarse:@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pl-8.5',
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:max-h-6 @max-[768px]/composer:group-data-[collapsed]/chat-textarea:overflow-hidden',
          hasDictation === true
            ? // Touch also spaces dictation and Send 12px apart.
              '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-15 pointer-coarse:@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-18.5'
            : '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-7 pointer-coarse:@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pr-8.5',
        ),
        editorContent: cn(
          chatComposerCollapseTransitionClassName,
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:[&_.tiptap]:overflow-hidden',
          // Match the collapsed editor's 24px box on fine pointers as well as touch devices.
          '@max-[768px]/composer:group-data-[collapsed]/chat-textarea:pb-0 @max-[768px]/composer:group-data-[collapsed]/chat-textarea:leading-6',
        ),
      }
    : {};

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
      /* The pending name's placeholder is cut like the name, so it too makes the labels leave first. */
      const name = bar.querySelector<HTMLElement>('[data-slot=trigger-model], [data-slot=trigger-model-placeholder]');
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
  skillsRecovery,
  isDictating = false,
  composerMode,
  containerReference,
  enableContextActions,
  enableKernelSelector,
  creationLocationControl,
  acpSessionData,
  status,
  canStop = false,
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
  /** Recovery for a failed skills catalog; a control in the bar, so it never grows the composer. */
  readonly skillsRecovery?: React.ReactNode;
  readonly isDictating?: boolean;
  readonly composerMode: 'main' | 'edit';
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly containerReference: React.RefObject<HTMLDivElement | null>;
  readonly enableContextActions: boolean;
  readonly enableKernelSelector: boolean;
  readonly creationLocationControl?: React.ReactNode;
  readonly acpSessionData?: AcpSessionData;
  readonly status: string;
  readonly canStop?: boolean;
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
  const { targets: placements, refresh: refreshPlacements } = useAgentHostPlacements();
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
    <div ref={barRef} data-slot='composer-bar' className={chatComposerBarClassName}>
      <div data-slot='composer-left' className={chatComposerBarLeftClassName}>
        <ChatAddMenu
          enableContextActions={enableContextActions}
          isAttachmentSupported={attachmentInputSupported}
          handleAtButtonClick={handleAtButtonClick}
          handleFileSelect={handleFileSelect}
          focusEditor={focusEditor}
        />
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-0.5 pointer-coarse:gap-3')}
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
      <div data-slot='composer-right' className={chatComposerBarRightClassName}>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-1 pointer-coarse:gap-3')}
        >
          {skillsRecovery}
          <ChatContextIndicator />
          <ChatAgentSheet
            agentConfig={agentConfig}
            placements={placements}
            focusEditor={focusEditor}
            onOpen={refreshPlacements}
            enableShortcut={ownsShortcuts}
          />
        </div>
        {dictationControl}
        <ChatTextareaSubmitButton
          status={status}
          canStop={canStop}
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

/**
 * A failed skills catalog's recovery, in the bar beside the context meter. It appears only after a
 * real failure (the catalog errored or closed; a catalog that has not started is `registering`) and
 * never takes a row of its own, so the composer's height is the same with or without it.
 */
function ChatSkillsRecovery({ onRetry }: { readonly onRetry: () => void }): React.JSX.Element {
  return (
    <>
      <span role='status' className='sr-only'>
        Skill updates unavailable
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            data-slot='skills-recovery'
            aria-label='Retry skill updates'
            className={cn(ghostPillClass, 'gap-1.5')}
            onClick={onRetry}
          >
            <TriangleAlert aria-hidden className='size-3.5 shrink-0 text-warning' />
            <span className='text-xs'>Retry skills</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side='top' className='text-xs'>
          Skill updates unavailable
        </TooltipContent>
      </Tooltip>
    </>
  );
}

/**
 * The kernel pill, in the location pill's finish so the two read as one row of choices: glyph, name, chevron, and the
 * name is the first to leave when the bar needs the room. It opens the Auto-first selector (blueprint D8).
 */
function ChatTextareaKernelControl({ focusEditor }: { readonly focusEditor: () => void }): React.JSX.Element {
  const {
    kernel: { preference, owner },
  } = useChatComposer();
  const face = kernelPillFace({ preference, ...(owner === undefined ? {} : { owner }) });
  return (
    <Tooltip>
      <KernelPreferenceSelector
        data-chat-textarea-focustrap
        popoverProperties={{ align: 'start' }}
        onSelect={focusEditor}
        onClose={focusEditor}
      >
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant={kernelPillStyles.variant}
            size='sm'
            aria-label={face.label}
            data-slot='kernel-pill'
            className={cn('min-w-0', kernelPillStyles.button)}
          >
            <KernelPillContent face={face} />
          </Button>
        </TooltipTrigger>
      </KernelPreferenceSelector>
      <TooltipContent className='max-w-64'>{face.hint}</TooltipContent>
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
              className={chatComposerAddTriggerClassName}
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
