import { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import type { ToolSelection } from '@taucad/chat';
import { tauEditorPanelDragMime, tauFileDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import { useDraftActions, useDraftSelector } from '#hooks/use-chat.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { toast } from '#components/ui/sonner.js';
import { useKeybinding } from '#hooks/use-keyboard.js';

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
  readonly imageUrls: string[];
};

/**
 * Kind of drag currently hovering over the chat textarea.
 *
 * - `'image'` — OS image files or other unrecognised drag (default behavior)
 * - `'viewer'` — `tauViewerPanelDragMime` (viewer panel tab) → screenshot the pane
 * - `'reference'` — `tauEditorPanelDragMime` or `tauFileDragMime` (editor tab / file tree row) → insert as file-link pill
 */
export type ChatTextareaDragKind = 'image' | 'viewer' | 'reference';

/**
 * IMPORTANT NOTE:
 *
 * When adding a new element to the textarea and that element contains portalled content,
 * make sure to add the `data-chat-textarea-focustrap` attribute to the element.
 *
 * This is used to determine if the focus has truly left the textarea and its related UI elements.
 */
export const focusTrapAttribute = 'data-chat-textarea-focustrap';

/**
 * Pure helper: parses a `tauViewerPanelDragMime` payload and returns the
 * `entryFile` if the payload is well-formed, else `undefined`.
 */
const parseViewerEntryFile = (raw: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'entryFile' in parsed &&
      typeof parsed.entryFile === 'string' &&
      parsed.entryFile !== ''
    ) {
      return parsed.entryFile;
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

/**
 * Reads a file as a data URL using FileReader.
 * Returns a Promise that resolves with the data URL string.
 */
const readFileAsDataUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      const result = event.target?.result;
      if (typeof result === 'string' && result !== '') {
        resolve(result);
      } else {
        reject(new Error('Invalid file read result'));
      }
    });

    reader.addEventListener('error', () => {
      reject(new Error('Failed to read file'));
    });

    reader.readAsDataURL(file);
  });
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
  readonly className?: string;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;
  readonly mode?: 'main' | 'edit';
};

// Define the key combination for cancelling the stream
export const cancelChatStreamKeyCombination = {
  key: 'Backspace',
  modKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

/**
 * Optional callbacks the chat textarea uses to dispatch drag-drops of
 * non-image MIME types that the container alone can recognise.
 */
export type ChatTextareaLogicOptions = Pick<
  ChatTextareaProperties,
  'ref' | 'onSubmit' | 'enableAutoFocus' | 'onEscapePressed' | 'onBlur' | 'mode'
> & {
  /** Called when a viewer panel tab is dropped — the host should screenshot the matching pane. */
  readonly onViewerScreenshotDrop?: (entryFile: string) => void;
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
  inputText: string;
  images: string[];
  selectedToolChoice: ToolSelection;
  status: string;
  selectedModel: ResolvedModel;
  formattedCancelKeyCombination: string;

  // Refs
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  textareaReference: React.RefObject<HTMLTextAreaElement | null>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  fileInputReference: React.RefObject<HTMLInputElement | null>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  containerReference: React.RefObject<HTMLDivElement | null>;

  // Handlers
  handleSubmit: () => Promise<void>;
  handleCancelClick: () => void;
  handleTextareaKeyDown: (event: React.KeyboardEvent) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (event: React.DragEvent) => Promise<void>;
  handleFileSelect: () => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleContextMenuSelect: (text: string) => void;
  handleContextImageAdd: (image: string) => void;
  handleAddText: (text: string) => void;
  handleAddImage: (image: string) => void;
  handleTextareaBlur: () => void;
  handlePointerDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  focusInput: () => void;
  removeImage: (index: number) => void;
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
  // SDK status and a real `stopRequest` dispatcher. The submit handler
  // stamps `selectedModel.id` into outgoing metadata regardless.
  const {
    model: { model: selectedModel },
    status,
    stop,
  } = useChatComposer();

  // Read draft state from machine based on mode
  const inputText = useDraftSelector((state) => (mode === 'main' ? state.draftText : state.editDraftText));
  const images = useDraftSelector((state) => (mode === 'main' ? state.draftImages : state.editDraftImages));
  const selectedToolChoice = useDraftSelector((state) =>
    mode === 'main' ? (state.draftToolChoice as ToolSelection) : 'auto',
  );

  const {
    setDraftText,
    addDraftImage,
    removeDraftImage,
    setDraftToolChoice,
    setEditDraftText,
    addEditDraftImage,
    removeEditDraftImage,
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

  const addImage = useCallback(
    (image: string) => {
      if (mode === 'main') {
        addDraftImage(image);
      } else {
        addEditDraftImage(image);
      }
    },
    [mode, addDraftImage, addEditDraftImage],
  );

  const removeImage = useCallback(
    (index: number) => {
      if (mode === 'main') {
        removeDraftImage(index);
      } else {
        removeEditDraftImage(index);
      }
    },
    [mode, removeDraftImage, removeEditDraftImage],
  );

  // Refs for stable handleSubmit — prevents re-render cascades through memo'd children
  const inputTextRef = useRef(inputText);
  inputTextRef.current = inputText;
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if ((inputTextRef.current.trim().length === 0 && imagesRef.current.length === 0) || isSubmittingRef.current) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitRef.current({
        content: inputTextRef.current,
        imageUrls: imagesRef.current,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const handleCancelClick = useCallback((): void => {
    stop();
  }, [stop]);

  // Register keyboard shortcut for cancellation
  const { formattedKeyCombination: formattedCancelKeyCombination } = useKeybinding(
    cancelChatStreamKeyCombination,
    () => {
      if (status === 'streaming') {
        stop();
      }
    },
  );

  const showContextMenuRef = useRef(showContextMenu);
  showContextMenuRef.current = showContextMenu;
  const onEscapePressedRef = useRef(onEscapePressed);
  onEscapePressedRef.current = onEscapePressed;

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
        imagesRef.current.length > 0
      ) {
        event.preventDefault();
        removeImage(imagesRef.current.length - 1);
      } else if (event.key === 'Escape') {
        onEscapePressedRef.current?.();
      }
    },
    [handleSubmit, removeImage],
  );

  const handleDragOver = useCallback((event: React.DragEvent): void => {
    event.preventDefault();
    const { types } = event.dataTransfer;
    if (types.includes(tauViewerPanelDragMime)) {
      setDragKind('viewer');
      return;
    }
    if (types.includes(tauEditorPanelDragMime) || types.includes(tauFileDragMime)) {
      setDragKind('reference');
      return;
    }
    setDragKind('image');
  }, []);

  const handleDragLeave = useCallback((): void => {
    setDragKind(undefined);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent): Promise<void> => {
      event.preventDefault();
      setDragKind(undefined);

      const { dataTransfer } = event;

      // 1. Viewer panel drop → request a screenshot of the matching pane
      const viewerData = dataTransfer.getData(tauViewerPanelDragMime);
      const viewerEntryFile = viewerData ? parseViewerEntryFile(viewerData) : undefined;
      if (viewerEntryFile !== undefined) {
        onViewerScreenshotDrop?.(viewerEntryFile);
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

      // 4. OS files (images) — read sequentially and hand the raw data URL
      // to the draft machine. Resizing + error toast are owned by the
      // `imageProcessing` chokepoint inside `draftMachine`; the only failure
      // class we still own here is the file-read step itself.
      if (dataTransfer.files.length > 0) {
        for (const file of dataTransfer.files) {
          if (file.type.startsWith('image/')) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- reading files sequentially
              const dataUrl = await readFileAsDataUrl(file);
              addImage(dataUrl);
            } catch {
              toast.error('Failed to read image');
            }
          } else {
            toast.error('Only images are supported');
          }
        }
      }
    },
    [addImage, onViewerScreenshotDrop, onAddContextChips],
  );

  const handleFileSelect = useCallback((): void => {
    fileInputReference.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
      if (event.target.files && event.target.files.length > 0) {
        for (const file of event.target.files) {
          if (file.type.startsWith('image/')) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- reading files sequentially
              const dataUrl = await readFileAsDataUrl(file);
              addImage(dataUrl);
            } catch {
              toast.error('Failed to read image');
            }
          }
        }

        // Clear the input so the same file can be selected again
        event.target.value = '';
      }
    },
    [addImage],
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

  /**
   * Handle paste event to add images to the chat
   */
  const handlePaste = useCallback(
    async (event: ClipboardEvent): Promise<void> => {
      // Check if the textarea is the active element or its ancestor contains focus
      const isTextareaFocused =
        document.activeElement === textareaReference.current ||
        textareaReference.current?.contains(document.activeElement);

      if (!isTextareaFocused) {
        return;
      }

      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- reading files sequentially
              const dataUrl = await readFileAsDataUrl(file);
              addImage(dataUrl);
            } catch {
              toast.error('Failed to read image');
            }
          }
        }
      }
    },
    [addImage],
  );

  const handleAddText = useCallback(
    (text: string): void => {
      setText(inputText + text);
      focusInput();
    },
    [focusInput, inputText, setText],
  );

  const handleAddImage = useCallback(
    (image: string): void => {
      addImage(image);
      focusInput();
    },
    [focusInput, addImage],
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
    (image: string): void => {
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

      addImage(image);
      focusInput();
    },
    [inputText, atSymbolPosition, contextSearchQuery, focusInput, setText, addImage],
  );

  useEffect(() => {
    if (enableAutoFocus) {
      focusInput();
    }
  }, [enableAutoFocus, focusInput]);

  useEffect(() => {
    if (!textareaReference.current) {
      return;
    }
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

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

  const handleTextareaBlur = useCallback((): void => {
    // Use requestAnimationFrame to check focus after the browser has finished
    // processing the focus change. This allows portaled elements (popovers, dialogs)
    // to receive focus before we check if we should trigger onBlur
    requestAnimationFrame(() => {
      const { activeElement } = document;
      const container = containerReference.current;

      if (!container) {
        return;
      }

      // Check if focus is within the container itself
      if (container.contains(activeElement)) {
        return;
      }

      // Check if focus moved to a related element (marked with data attribute)
      // This allows child components to mark their portaled content as related
      if (activeElement instanceof Element && activeElement.closest(`[${focusTrapAttribute}]`)) {
        return;
      }

      // Focus has truly left the component and its related UI elements
      onBlur?.();
    });
  }, [onBlur]);

  return {
    // State
    dragKind,
    isDragging: dragKind !== undefined,
    showContextMenu,
    atSymbolPosition,
    contextSearchQuery,
    selectedMenuIndex,
    isSubmitting,
    inputText,
    images,
    selectedToolChoice,
    status,
    selectedModel,
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
    handleFileSelect,
    handleFileChange,
    handleTextChange,
    handleContextMenuSelect,
    handleContextImageAdd,
    handleAddText,
    handleAddImage,
    handleTextareaBlur,
    handlePointerDown,
    focusInput,
    removeImage,
    setDraftToolChoice,
    setShowContextMenu,
    setAtSymbolPosition,
    setContextSearchQuery,
    setSelectedMenuIndex,
  };
}
