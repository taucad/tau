import type { CadReference } from '@taucad/chat/references';
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { AttachmentDirectories } from '#hooks/use-attachment-source.js';
import { modelSupportsInput } from '@taucad/chat';
import type { ToolSelection } from '@taucad/chat';
import { tauEditorPanelDragMime, tauFileDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { chatDragKindOf } from '#components/chat/chat-drop-zone.js';
import type { ChatDragEvent } from '#components/chat/chat-drop-zone.js';
import { useDraftActions, useDraftSelector } from '#hooks/use-chat.js';
import type { DraftAttachmentOptions } from '#hooks/use-chat.js';
import type { DraftAttachment, DraftAttachmentSource, PendingDraftImage } from '#hooks/draft.machine.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { attachmentModelForExecution, attachmentSendBlockReason } from '#utils/chat.utils.js';
import type { StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import { homeComposerAttachmentDirectory, useChatAttachmentDirectories } from '#components/chat/attachment-preview.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { toast } from '@taucad/ui/components/sonner';
import { useKeybinding } from '@taucad/ui/components/keyboard';
import { useComposerExit } from '@taucad/chat-ui/components/use-composer-exit';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import type { HandOffTarget } from '#components/hand-off/hand-off-store.js';
import { cancelChatStreamKeyCombination } from '#components/chat/chat-textarea-submit-button.js';
import { getClipboardImageFiles, handleClipboardImagePaste } from '@taucad/chat-ui/components/chat-paste-handler';
import { readAttachmentFile } from '@taucad/chat-ui/utils/attachment-intake';
import type { AttachmentIntakeRefusal } from '@taucad/chat-ui/utils/attachment-intake';
import type { ClipboardPasteEvent } from '@taucad/chat-ui/components/chat-paste-handler';
import {
  attachmentTranscodeSourcesSnapshot,
  loadAttachmentTranscodeSources,
  noAttachmentTranscodeSources,
  subscribeAttachmentTranscodeSources,
} from '#services/attachment-transcode-sources-store.js';
import { recordAttachmentIntake } from '#telemetry/attachment-intake-telemetry.js';
import { osClass } from '#telemetry/platform-class.js';
import { attachmentAccept } from '#utils/attachment-accept.js';
import { attachmentRefusalCopy } from '#utils/attachment-refusal.js';

/**
 * Payload the chat textarea hands to its host's `onSubmit` callback.
 *
 * Deliberately narrow: the textarea owns text + dropped images, and nothing
 * else. Model / kernel / mode / toolChoice / snapshot / contextPayload /
 * testingEnabled all live on the per-request `agent` block and are composed
 * inside the chat-client layer (see `useCadChatClient`). Threading them here
 * was the smoking gun behind the "submit drops kernel / testingEnabled" bug
 * surface — every host site was responsible for re-stamping the same set of
 * metadata fields, which sprawled and went stale.
 *
 * @public
 */
export type ChatTextareaSubmitPayload = {
  readonly content: string;
  /** The draft's stored attachments; the chat client promotes them before sending. */
  readonly attachments: readonly StoredAttachmentRef[];
  /** The structured geometry references of the draft's chips (blueprint D6); present only when there are some. */
  readonly references?: readonly CadReference[];
};

/** Count a file intake refused and say so, naming its format and the next step. */
const refuseIntake = (refusal: AttachmentIntakeRefusal, file: File): void => {
  recordAttachmentIntake({
    outcome: 'refused',
    reason: refusal.reason,
    ...(refusal.format === undefined ? {} : { format: refusal.format }),
    declaredType: file.type,
  });
  const copy = attachmentRefusalCopy(refusal);
  toast.error(copy.title, { description: copy.description });
};

/**
 * What an entry point may say about an attachment it adds. The selected model
 * is supplied by the composer, which owns it.
 *
 * @public
 */
export type ChatAttachmentAddOptions = Omit<DraftAttachmentOptions, 'model'>;

/**
 * Kind of drag currently hovering over the chat textarea.
 *
 * - `'image'` — OS image files or other unrecognised drag (default behavior)
 * - `'viewer'` — `tauViewerPanelDragMime` (viewer panel tab) → screenshot the pane
 * - `'reference'` — `tauEditorPanelDragMime` or `tauFileDragMime` (editor tab / file tree row) → insert as file-link pill
 */
export type ChatTextareaDragKind = 'image' | 'viewer' | 'reference';

/**
 * Pure helper: parses a `tauViewerPanelDragMime` payload and returns the
 * `entryPath` if the payload is well-formed, else `undefined`.
 */
const parseViewerEntryPath = (raw: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'entryPath' in parsed &&
      typeof parsed.entryPath === 'string' &&
      parsed.entryPath !== ''
    ) {
      return parsed.entryPath;
    }
  } catch {
    // Malformed payload — caller should fall through to the next handler.
  }
  return undefined;
};

/**
 * Pure helper: parses a `tauEditorPanelDragMime` payload and returns the
 * `filePath` if the payload is well-formed, else `undefined`.
 */
const parseEditorFilePath = (raw: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'filePath' in parsed &&
      typeof parsed.filePath === 'string' &&
      parsed.filePath !== ''
    ) {
      return parsed.filePath;
    }
  } catch {
    // Malformed payload — caller should fall through.
  }
  return undefined;
};

/**
 * Pure helper: parses a `tauFileDragMime` payload and returns the list of
 * dropped paths. Accepts both bare arrays (`['a', 'b']`) and the wrapped
 * `{ paths: [...] }` form. Returns an empty array when the payload is
 * malformed or contains no string entries.
 */
const parseFileDragPaths = (raw: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
    if (typeof parsed === 'object' && parsed !== null && 'paths' in parsed && Array.isArray(parsed.paths)) {
      return parsed.paths.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    // Malformed payload — caller treats this as no paths.
  }
  return [];
};

export type ChatTextareaHandle = {
  focus: () => void;
};

export type ChatTextareaProperties = {
  readonly ref?: React.Ref<ChatTextareaHandle>;
  readonly onSubmit: (payload: ChatTextareaSubmitPayload) => Promise<void>;
  readonly onEscapePressed?: () => void;
  readonly onBlur?: () => void;
  readonly enableAutoFocus?: boolean;
  /** Let Home accept native text before the rich editor is hydrated. */
  readonly enableEarlyInput?: boolean;
  /**
   * An early edit a host above this component already adopted, when the host owns the native input
   * instead of this component. Mutually exclusive with `enableEarlyInput`, which is the arrangement
   * where this component owns it and so has to be loaded before anything can be typed.
   */
  readonly adoptedEarlyInput?: EarlyChatInput;
  /**
   * The hand-off surface whose native input this composer adopts on mount (progressive loading P4): the project's
   * placeholder serves one, and its text, caret, focus and a queued send come here. Only an input served for the same
   * scope (the project) is adopted. Ignored with either arrangement above.
   */
  readonly handOff?: HandOffTarget;
  readonly className?: string;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;
  /** Where a project created from this draft goes: Home's location control, in the bar. */
  readonly creationLocationControl?: React.ReactNode;
  /** Blocks every submit path while external prerequisites are unresolved. */
  readonly isSubmitDisabled?: boolean;
  readonly mode?: 'main' | 'edit';
  /**
   * Below the `md` breakpoint, rest as one row — +, the editor, dictation and
   * Send — until the composer is focused or holds a draft; the rest of the bar
   * unfolds on focus. Wider viewports always show the full composer.
   */
  readonly enableMobileCollapse?: boolean;
};

/**
 * Optional callbacks the chat textarea uses to dispatch drag-drops of
 * non-image MIME types that the container alone can recognise.
 */
export type ChatTextareaLogicOptions = Pick<
  ChatTextareaProperties,
  'ref' | 'onSubmit' | 'enableAutoFocus' | 'onEscapePressed' | 'onBlur' | 'mode' | 'isSubmitDisabled'
> & {
  /** Called when a viewer panel tab is dropped — the host should screenshot the matching pane. */
  readonly onViewerScreenshotDrop?: (entryPath: string) => void;
  /** Called when an editor tab or file-tree row is dropped — the host should insert file-link chips. */
  readonly onAddContextChips?: (paths: string[]) => void;
};

/**
 * Shared logic hook for the chat textarea component.
 * Provides all the state and handlers needed by both desktop and mobile versions.
 */
export function useChatTextareaLogic({
  ref,
  onSubmit,
  enableAutoFocus = true,
  onEscapePressed,
  onBlur,
  mode = 'main',
  isSubmitDisabled = false,
  onViewerScreenshotDrop,
  onAddContextChips,
}: ChatTextareaLogicOptions): {
  // State
  dragKind: ChatTextareaDragKind | undefined;
  isDragging: boolean;
  showContextMenu: boolean;
  atSymbolPosition: number;
  contextSearchQuery: string;
  selectedMenuIndex: number;
  isSubmitting: boolean;
  /** The session can continue interrupted work and the main draft is empty. */
  canResume: boolean;
  inputText: string;
  attachments: readonly DraftAttachment[];
  /** Why Send is disabled for the current attachments and model, shown beside them (D20). */
  sendBlockReason: string | undefined;
  /** An attachment is still being resized or stored; sending now would leave it behind. */
  isAttaching: boolean;
  /** The draft's images still converting or storing, whose thumbnail slots the rail holds. */
  pendingImages: readonly PendingDraftImage[];
  /** The caller's `isSubmitDisabled`, or an attachment still on its way (F4). */
  isSubmitDisabled: boolean;
  /** The directory the draft's attachment references resolve against. */
  attachmentDirectory: AttachmentDirectories;
  /** The picker's `accept` list: the attachment types the selected model can read. */
  attachmentAccept: string;
  selectedToolChoice: ToolSelection;
  status: string;
  /**
   * Whether the composer offers Stop: while a turn streams, and while its run waits on an approval or a stop the host
   * has not settled yet. A paused run's SDK stream has closed, so the status alone reads `ready` (and hid Stop).
   */
  canStop: boolean;
  selectedModel: ResolvedModel;
  imageInputSupported: boolean;
  attachmentInputSupported: boolean;
  formattedCancelKeyCombination: string;

  // Refs
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  textareaReference: React.RefObject<HTMLTextAreaElement | null>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  fileInputReference: React.RefObject<HTMLInputElement | null>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  containerReference: React.RefObject<HTMLDivElement | null>;

  // Handlers
  handleSubmit: (finalizedText?: string, references?: readonly CadReference[]) => Promise<void>;
  handleCancelClick: () => void;
  handleTextareaKeyDown: (event: React.KeyboardEvent) => void;
  handleDragOver: (event: ChatDragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (event: ChatDragEvent) => Promise<void>;
  handlePaste: (event: ClipboardPasteEvent) => boolean;
  handleFileSelect: () => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleContextMenuSelect: (text: string) => void;
  handleContextImageAdd: (image: string, options?: ChatAttachmentAddOptions) => void;
  handleAddText: (text: string) => void;
  handleAddImage: (image: string, options?: ChatAttachmentAddOptions) => void;
  rejectUnsupportedImageInput: () => void;
  handleTextareaBlur: () => void;
  handlePointerDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  focusInput: () => void;
  removeAttachment: (index: number) => void;
  setDraftToolChoice: (choice: ToolSelection) => void;
  setShowContextMenu: (show: boolean) => void;
  setAtSymbolPosition: (position: number) => void;
  setContextSearchQuery: (query: string) => void;
  setSelectedMenuIndex: (index: number) => void;
} {
  const [dragKind, setDragKind] = useState<ChatTextareaDragKind | undefined>(undefined);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [atSymbolPosition, setAtSymbolPosition] = useState<number>(-1);
  const [contextSearchQuery, setContextSearchQuery] = useState<string>('');
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const containerReference = useRef<HTMLDivElement>(null);
  // Unified composer contract — both providers populate `model`, `status`
  // and `stop`. Composer-only mounts (marketing CTA, library) get the
  // cookie-resolved model, a constant `'ready'` status and a no-op stop;
  // session-backed mounts get the chat-row-preferred model, the live AI
  // SDK status and a real `stopRequest` dispatcher. ACP execution carries
  // its own model, so the Tau model does not decide attachment admission.
  const {
    model: { model: selectedModel },
    execution: { execution },
    status,
    stop,
    resume,
    attachmentSource,
    agentActivity,
  } = useChatComposer();
  const canStop =
    status === 'streaming' ||
    status === 'submitted' ||
    agentActivity === 'approval-required' ||
    agentActivity === 'stopping';
  const attachmentModel = useMemo(
    () => attachmentModelForExecution(execution, selectedModel),
    [execution, selectedModel],
  );
  const { support } = attachmentModel;
  const imageInputSupported = modelSupportsInput(support, 'image');
  const pdfInputSupported = modelSupportsInput(support, 'pdf');
  const attachmentInputSupported = imageInputSupported || pdfInputSupported;
  /* The convertible formats load with the conversion runtime's definition, outside the entry; no worker starts. */
  const transcodeSources = useSyncExternalStore(
    subscribeAttachmentTranscodeSources,
    attachmentTranscodeSourcesSnapshot,
    noAttachmentTranscodeSources,
  );
  const pickerAccept = useMemo(
    () =>
      attachmentAccept({
        images: imageInputSupported,
        documents: pdfInputSupported,
        transcodeSources,
        isIos: osClass() === 'ios',
      }),
    [imageInputSupported, pdfInputSupported, transcodeSources],
  );
  /* A project chat's draft lives beside its composer record, and an open edit's sent attachments stay in the
   * chat's own directory (F5); a pre-project composer names its own directory. */
  const chatDirectories = useChatAttachmentDirectories();
  const attachmentDirectory = useMemo(
    () =>
      chatDirectories === undefined
        ? (attachmentSource ?? homeComposerAttachmentDirectory)
        : [chatDirectories.composer, chatDirectories.transcript],
    [attachmentSource, chatDirectories],
  );

  // Read draft state from machine based on mode
  const inputText = useDraftSelector((state) => (mode === 'main' ? state.draftText : state.editDraftText));
  const attachments = useDraftSelector((state) =>
    mode === 'main' ? state.draftAttachments : state.editDraftAttachments,
  );
  const sendBlockReason = attachmentSendBlockReason(attachments, attachmentModel);
  const isAttaching = useDraftSelector((state) => (mode === 'main' ? state.attachingMain : state.attachingEdit));
  const pendingImages = useDraftSelector((state) => (mode === 'main' ? state.pendingMain : state.pendingEdit));
  const canResume =
    mode === 'main' &&
    resume !== undefined &&
    status !== 'streaming' &&
    status !== 'submitted' &&
    inputText.trim().length === 0 &&
    attachments.length === 0 &&
    !isAttaching &&
    !isSubmitting &&
    !isSubmitDisabled;
  const selectedToolChoice = useDraftSelector((state) =>
    mode === 'main' ? (state.draftToolChoice as ToolSelection) : 'auto',
  );

  const {
    setDraftText,
    addDraftAttachment,
    removeDraftAttachment,
    setDraftToolChoice,
    setEditDraftText,
    addEditDraftAttachment,
    removeEditDraftAttachment,
  } = useDraftActions();

  // Helper functions that call the correct action based on mode
  const setText = useCallback(
    (text: string) => {
      if (mode === 'main') {
        setDraftText(text);
      } else {
        setEditDraftText(text);
      }
    },
    [mode, setDraftText, setEditDraftText],
  );

  const rejectUnsupportedImageInput = useCallback((): void => {
    toast.error('This model cannot read images', {
      description: 'Switch to a vision-capable model to attach images, or continue with text and GeoSpec.',
    });
  }, []);

  /**
   * Add one attachment to the draft. An image the model cannot read is refused
   * here with the vision toast; any other refusal (a PDF, D20) is the draft
   * machine's, which names the model.
   */
  const addAttachment = useCallback(
    (source: DraftAttachmentSource, options?: ChatAttachmentAddOptions) => {
      if (typeof source === 'string' && source.startsWith('data:image/') && !imageInputSupported) {
        rejectUnsupportedImageInput();
        return;
      }

      const add = mode === 'main' ? addDraftAttachment : addEditDraftAttachment;
      add(source, { ...options, model: attachmentModel });
    },
    [
      mode,
      addDraftAttachment,
      addEditDraftAttachment,
      attachmentModel,
      imageInputSupported,
      rejectUnsupportedImageInput,
    ],
  );

  const removeAttachment = useCallback(
    (index: number) => {
      if (mode === 'main') {
        removeDraftAttachment(index);
      } else {
        removeEditDraftAttachment(index);
      }
    },
    [mode, removeDraftAttachment, removeEditDraftAttachment],
  );

  /** Read OS files in order and add the ones the store accepts; the rest get one toast each. */
  const addFiles = useCallback(
    async (files: Iterable<File>): Promise<void> => {
      const transcodeSources = await loadAttachmentTranscodeSources();
      for (const file of files) {
        try {
          // Labelled from the bytes, never `file.type` (I1): an image as a data URL, a document as its bytes (S7).
          // oxlint-disable-next-line no-await-in-loop -- reading files sequentially keeps attachment order
          const intake = await readAttachmentFile(file, { transcodeSources });
          if (intake.outcome === 'refused') {
            refuseIntake(intake, file);
            continue;
          }
          addAttachment(intake.source, {
            ...(file.name ? { filename: file.name } : {}),
            declaredType: file.type,
          });
        } catch {
          toast.error(file.type.startsWith('image/') ? 'Failed to read image' : 'Failed to read file');
        }
      }
    },
    [addAttachment],
  );

  // Refs for stable handleSubmit — prevents re-render cascades through memo'd children
  const inputTextRef = useRef(inputText);
  const attachmentsRef = useRef(attachments);
  const sendBlockReasonRef = useRef(sendBlockReason);
  const isAttachingRef = useRef(isAttaching);
  const isSubmittingRef = useRef(isSubmitting);
  const submitInFlightRef = useRef(false);
  const isSubmitDisabledRef = useRef(isSubmitDisabled);
  const onSubmitRef = useRef(onSubmit);
  const resumeRef = useRef(canResume ? resume : undefined);
  /* A layout effect, so a child's effect that submits in the render that permits it (P4's queued submit) reads that
   * render's state: passive effects run child first. */
  useLayoutEffect(() => {
    inputTextRef.current = inputText;
    attachmentsRef.current = attachments;
    sendBlockReasonRef.current = sendBlockReason;
    isAttachingRef.current = isAttaching;
    isSubmittingRef.current = isSubmitting;
    isSubmitDisabledRef.current = isSubmitDisabled;
    onSubmitRef.current = onSubmit;
    resumeRef.current = canResume ? resume : undefined;
  }, [
    attachments,
    canResume,
    inputText,
    isAttaching,
    isSubmitDisabled,
    isSubmitting,
    onSubmit,
    resume,
    sendBlockReason,
  ]);

  const handleSubmit = useCallback(
    async (finalizedText?: string, references?: readonly CadReference[]): Promise<void> => {
      if (
        isSubmittingRef.current ||
        submitInFlightRef.current ||
        isSubmitDisabledRef.current ||
        sendBlockReasonRef.current !== undefined ||
        isAttachingRef.current
      ) {
        return;
      }

      const content = finalizedText ?? inputTextRef.current;
      if (content.trim().length === 0 && attachmentsRef.current.length === 0) {
        resumeRef.current?.();
        return;
      }

      submitInFlightRef.current = true;
      setIsSubmitting(true);
      try {
        await onSubmitRef.current({
          content,
          attachments: attachmentsRef.current,
          ...(references === undefined || references.length === 0 ? {} : { references }),
        });
      } finally {
        submitInFlightRef.current = false;
        setIsSubmitting(false);
      }
    },
    [],
  );

  const handleCancelClick = useCallback((): void => {
    stop('stop-button');
  }, [stop]);

  // Register keyboard shortcut for cancellation
  const { formattedKeyCombination: formattedCancelKeyCombination } = useKeybinding(
    cancelChatStreamKeyCombination,
    () => {
      /* F7: the same condition that shows Stop. */
      if (canStop) {
        stop('stop-shortcut');
      }
    },
  );

  const showContextMenuRef = useRef(showContextMenu);
  const onEscapePressedRef = useRef(onEscapePressed);
  useEffect(() => {
    showContextMenuRef.current = showContextMenu;
    onEscapePressedRef.current = onEscapePressed;
  }, [onEscapePressed, showContextMenu]);

  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent): void => {
      if (
        showContextMenuRef.current &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')
      ) {
        return;
      }

      if (showContextMenuRef.current && event.key === 'Escape') {
        event.preventDefault();
        setShowContextMenu(false);
        setAtSymbolPosition(-1);
        setSelectedMenuIndex(0);
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      } else if (
        event.key === 'Backspace' &&
        textareaReference.current?.selectionStart === 0 &&
        textareaReference.current.selectionEnd === 0 &&
        attachmentsRef.current.length > 0
      ) {
        event.preventDefault();
        removeAttachment(attachmentsRef.current.length - 1);
      } else if (event.key === 'Escape') {
        onEscapePressedRef.current?.();
      }
    },
    [handleSubmit, removeAttachment],
  );

  const handleDragOver = useCallback((event: ChatDragEvent): void => {
    event.preventDefault();
    setDragKind(chatDragKindOf(event.dataTransfer.types));
  }, []);

  const handleDragLeave = useCallback((): void => {
    setDragKind(undefined);
  }, []);

  const handleDrop = useCallback(
    async (event: ChatDragEvent): Promise<void> => {
      event.preventDefault();
      setDragKind(undefined);

      const { dataTransfer } = event;

      // 1. Viewer panel drop → request a screenshot of the matching pane
      const viewerData = dataTransfer.getData(tauViewerPanelDragMime);
      const viewerEntryPath = viewerData ? parseViewerEntryPath(viewerData) : undefined;
      if (viewerEntryPath !== undefined) {
        if (!imageInputSupported) {
          rejectUnsupportedImageInput();
          return;
        }

        onViewerScreenshotDrop?.(viewerEntryPath);
        return;
      }

      // 2. Editor panel drop → insert a single file-link pill
      const editorData = dataTransfer.getData(tauEditorPanelDragMime);
      const editorFilePath = editorData ? parseEditorFilePath(editorData) : undefined;
      if (editorFilePath !== undefined) {
        onAddContextChips?.([editorFilePath]);
        return;
      }

      // 3. File-tree drop → insert one file-link pill per dropped path
      const fileData = dataTransfer.getData(tauFileDragMime);
      const filePaths = fileData ? parseFileDragPaths(fileData) : [];
      if (filePaths.length > 0) {
        onAddContextChips?.(filePaths);
        return;
      }

      // 4. OS files (images and PDFs) — read sequentially and hand the raw
      // data URL to the draft machine. Resizing, storing, kind refusal and
      // their toasts are owned by the `attachmentProcessing` chokepoint inside
      // `draftMachine`; the only failure class we still own here is the
      // file-read step itself.
      // A mixed drop is judged per file there too, so a PDF still lands when the model reads no images (S13).
      // Copied before the first await: the browser may empty the drop's live `FileList` once the handler yields.
      if (dataTransfer.files.length > 0) {
        await addFiles([...dataTransfer.files]);
      }
    },
    [addFiles, onViewerScreenshotDrop, onAddContextChips],
  );

  const handleFileSelect = useCallback((): void => {
    if (!attachmentInputSupported) {
      rejectUnsupportedImageInput();
      return;
    }

    fileInputReference.current?.click();
  }, [attachmentInputSupported, rejectUnsupportedImageInput]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      if (event.target.files && event.target.files.length > 0) {
        if (!attachmentInputSupported) {
          rejectUnsupportedImageInput();
          event.target.value = '';
          return;
        }

        // Copy first: clearing the input empties its live `FileList`.
        const files = [...event.target.files];
        // Clear the input so the same file can be selected again
        event.target.value = '';
        await addFiles(files);
      }
    },
    [addFiles, attachmentInputSupported, rejectUnsupportedImageInput],
  );

  const focusInput = useCallback((): void => {
    if (textareaReference.current) {
      textareaReference.current.focus();
      // Set cursor position to end of text
      textareaReference.current.selectionStart = textareaReference.current.value.length;
      textareaReference.current.selectionEnd = textareaReference.current.value.length;
    }
  }, [textareaReference]);

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({ focus: focusInput }), [focusInput]);

  const handlePaste = useCallback(
    (event: ClipboardPasteEvent): boolean => {
      if (!imageInputSupported && getClipboardImageFiles(event.clipboardData).length > 0) {
        event.preventDefault();
        rejectUnsupportedImageInput();
        return true;
      }

      return handleClipboardImagePaste({
        event,
        onImage: (dataUrl, file) => {
          addAttachment(dataUrl, { declaredType: file.type });
        },
        onReadError: () => {
          toast.error('Failed to read image');
        },
        onRefused: refuseIntake,
        loadTranscodeSources: loadAttachmentTranscodeSources,
      });
    },
    [addAttachment, imageInputSupported, rejectUnsupportedImageInput],
  );

  const handleAddText = useCallback(
    (text: string): void => {
      setText(inputText + text);
      focusInput();
    },
    [focusInput, inputText, setText],
  );

  const handleAddImage = useCallback(
    (image: string, options?: ChatAttachmentAddOptions): void => {
      addAttachment(image, options);
      focusInput();
    },
    [focusInput, addAttachment],
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const newValue = event.target.value;
      const cursorPosition = event.target.selectionStart;

      // Check if the user just typed an @ symbol
      if (newValue.length > inputText.length && newValue[cursorPosition - 1] === '@') {
        setShowContextMenu(true);
        setAtSymbolPosition(cursorPosition - 1);
        setContextSearchQuery('');
        setSelectedMenuIndex(0);
      } else if (atSymbolPosition >= 0) {
        // Check if we're still after the @ symbol
        if (cursorPosition > atSymbolPosition && newValue[atSymbolPosition] === '@') {
          const textAfterAt = newValue.slice(atSymbolPosition + 1, cursorPosition);

          // If there's a space after @, close the menu
          if (textAfterAt.includes(' ')) {
            setShowContextMenu(false);
            setContextSearchQuery('');
            setSelectedMenuIndex(0);
          } else {
            // Update the search query for filtering and show menu if not already shown
            setContextSearchQuery(textAfterAt);
            setSelectedMenuIndex(0); // Reset selection when search changes
            if (!showContextMenu) {
              setShowContextMenu(true);
            }
          }
        } else {
          // Cursor moved before the @ symbol or @ was deleted
          setShowContextMenu(false);
          setAtSymbolPosition(-1);
          setContextSearchQuery('');
          setSelectedMenuIndex(0);
        }
      } else {
        // Look for @ symbol at current cursor position - 1 (for backspace scenarios)
        const atIndex = newValue.lastIndexOf('@', cursorPosition - 1);
        if (atIndex !== -1 && cursorPosition > atIndex) {
          const textAfterAt = newValue.slice(atIndex + 1, cursorPosition);
          // If there's no space and we're right after @, reopen the menu
          if (!textAfterAt.includes(' ')) {
            setShowContextMenu(true);
            setAtSymbolPosition(atIndex);
            setContextSearchQuery(textAfterAt);
            setSelectedMenuIndex(0);
          }
        }
      }

      setText(newValue);
    },
    [inputText, showContextMenu, atSymbolPosition, setText],
  );

  const handleContextMenuSelect = useCallback(
    (text: string): void => {
      if (atSymbolPosition >= 0) {
        // Replace the @ symbol and any text after it with the selected text
        const beforeAt = inputText.slice(0, atSymbolPosition);
        const afterAtAndQuery = inputText.slice(atSymbolPosition + 1 + contextSearchQuery.length);
        const newText = beforeAt + text + afterAtAndQuery;
        setText(newText);

        // Close the menu
        setShowContextMenu(false);
        setAtSymbolPosition(-1);
        setContextSearchQuery('');

        // Focus back to textarea
        setTimeout(() => {
          if (textareaReference.current) {
            const newCursorPosition = beforeAt.length + text.length;
            textareaReference.current.focus();
            textareaReference.current.setSelectionRange(newCursorPosition, newCursorPosition);
          }
        }, 0);
      }
    },
    [inputText, atSymbolPosition, contextSearchQuery, setText],
  );

  const handleContextImageAdd = useCallback(
    (image: string, options?: ChatAttachmentAddOptions): void => {
      // Close the menu and remove the @ symbol
      setShowContextMenu(false);
      setAtSymbolPosition(-1);
      setContextSearchQuery('');

      // Remove the @ symbol and any query text from text
      if (atSymbolPosition >= 0) {
        const beforeAt = inputText.slice(0, atSymbolPosition);
        const afterAtAndQuery = inputText.slice(atSymbolPosition + 1 + contextSearchQuery.length);
        const newText = beforeAt + afterAtAndQuery;
        setText(newText);
      }

      addAttachment(image, options);
      focusInput();
    },
    [inputText, atSymbolPosition, contextSearchQuery, focusInput, setText, addAttachment],
  );

  useEffect(() => {
    if (enableAutoFocus) {
      focusInput();
    }
  }, [enableAutoFocus, focusInput]);

  useEffect(() => {
    // Handle clicking outside the context menu to close it
    const handleClickOutside = (event: MouseEvent): void => {
      if (showContextMenu && textareaReference.current && !textareaReference.current.contains(event.target as Node)) {
        setShowContextMenu(false);
        setAtSymbolPosition(-1);
      }
    };

    if (showContextMenu) {
      document.addEventListener('pointerdown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [showContextMenu]);

  const handlePointerDown = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target !== textareaReference.current) {
      event.preventDefault();
    }
  }, []);

  const { handleBlur: handleTextareaBlur } = useComposerExit({ containerReference, onExit: onBlur });

  return {
    // State
    dragKind,
    isDragging: dragKind !== undefined,
    showContextMenu,
    atSymbolPosition,
    contextSearchQuery,
    selectedMenuIndex,
    isSubmitting,
    canResume,
    inputText,
    attachments,
    sendBlockReason,
    isAttaching,
    pendingImages,
    isSubmitDisabled: isSubmitDisabled || isAttaching,
    attachmentDirectory,
    attachmentAccept: pickerAccept,
    selectedToolChoice,
    status,
    canStop,
    selectedModel,
    imageInputSupported,
    attachmentInputSupported,
    formattedCancelKeyCombination,

    // Refs
    textareaReference,
    fileInputReference,
    containerReference,

    // Handlers
    handleSubmit,
    handleCancelClick,
    handleTextareaKeyDown,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    handleFileSelect,
    handleFileChange,
    handleTextChange,
    handleContextMenuSelect,
    handleContextImageAdd,
    handleAddText,
    handleAddImage,
    rejectUnsupportedImageInput,
    handleTextareaBlur,
    handlePointerDown,
    focusInput,
    removeAttachment,
    setDraftToolChoice,
    setShowContextMenu,
    setAtSymbolPosition,
    setContextSearchQuery,
    setSelectedMenuIndex,
  };
}
