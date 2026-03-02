import { useState, useRef, useEffect, useCallback, useImperativeHandle } from 'react';
import type { ToolSelection } from '@taucad/chat';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useModels } from '#hooks/use-models.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { toast } from '#components/ui/sonner.js';
import { useKeybinding } from '#hooks/use-keyboard.js';

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
  readonly onSubmit: ({
    content,
    model,
    metadata,
    imageUrls,
  }: {
    content: string;
    model: string;
    metadata?: { toolChoice?: ToolSelection; mode?: 'agent' | 'plan' };
    imageUrls?: string[];
  }) => Promise<void>;
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
}: Pick<ChatTextareaProperties, 'ref' | 'onSubmit' | 'enableAutoFocus' | 'onEscapePressed' | 'onBlur' | 'mode'>): {
  // State
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
  selectedModel: ReturnType<typeof useModels>['selectedModel'];
  formattedCancelKeyCombination: string;

  // Refs
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  textareaReference: React.RefObject<HTMLTextAreaElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  fileInputReference: React.RefObject<HTMLInputElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  containerReference: React.RefObject<HTMLDivElement | null>;

  // Handlers
  handleSubmit: () => Promise<void>;
  handleCancelClick: () => void;
  handleTextareaKeyDown: (event: React.KeyboardEvent) => void;
  handleDragOver: (event: React.DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (event: React.DragEvent) => void;
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
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [atSymbolPosition, setAtSymbolPosition] = useState<number>(-1);
  const [contextSearchQuery, setContextSearchQuery] = useState<string>('');
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const containerReference = useRef<HTMLDivElement>(null);
  const { selectedModel } = useModels();
  const status = useChatSelector((state) => state.status);

  // Read draft state from machine based on mode
  const inputText = useChatSelector((state) => (mode === 'main' ? state.draftText : state.editDraftText));
  const images = useChatSelector((state) => (mode === 'main' ? state.draftImages : state.editDraftImages));
  const selectedToolChoice = useChatSelector((state) =>
    mode === 'main' ? (state.draftToolChoice as ToolSelection) : 'auto',
  );
  const selectedMode = useChatSelector((state) =>
    mode === 'main' ? (state.draftMode as 'agent' | 'plan') : ('agent' as const),
  );

  const {
    stop,
    setDraftText,
    addDraftImage,
    removeDraftImage,
    setDraftToolChoice,
    setEditDraftText,
    addEditDraftImage,
    removeEditDraftImage,
  } = useChatActions();

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

  const handleSubmit = async (): Promise<void> => {
    // If there is no text or images, do not submit
    if ((inputText.trim().length === 0 && images.length === 0) || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      // The useChat hook will handle cancelling any ongoing stream
      await onSubmit({
        content: inputText,
        model: selectedModel?.id ?? '',
        metadata: {
          toolChoice: selectedToolChoice,
          mode: selectedMode,
        },
        imageUrls: images,
      });
      // Draft will be cleared by the machine's submit action
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelClick = (): void => {
    stop();
  };

  // Register keyboard shortcut for cancellation
  const { formattedKeyCombination: formattedCancelKeyCombination } = useKeybinding(
    cancelChatStreamKeyCombination,
    () => {
      if (status === 'streaming') {
        stop();
      }
    },
  );

  const handleTextareaKeyDown = (event: React.KeyboardEvent): void => {
    if (showContextMenu && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')) {
      // Let the ChatContextActions component handle these keys
      return;
    }

    if (showContextMenu && event.key === 'Escape') {
      // Close the context menu if it's open
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
      images.length > 0
    ) {
      // Delete the last image when backspace is pressed at the beginning of the textarea
      event.preventDefault();
      removeImage(images.length - 1);
    } else if (event.key === 'Escape') {
      onEscapePressed?.();
    }
  };

  const handleDragOver = useCallback((event: React.DragEvent): void => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((): void => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent): Promise<void> => {
      event.preventDefault();
      setIsDragging(false);

      if (event.dataTransfer.files.length > 0) {
        for (const file of event.dataTransfer.files) {
          if (file.type.startsWith('image/')) {
            try {
              // eslint-disable-next-line no-await-in-loop -- reading files sequentially
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
    [addImage],
  );

  const handleFileSelect = useCallback((): void => {
    fileInputReference.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      if (event.target.files && event.target.files.length > 0) {
        for (const file of event.target.files) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            const handleLoad = (readerEvent: ProgressEvent<FileReader>): void => {
              if (readerEvent.target?.result && typeof readerEvent.target.result === 'string') {
                const { result } = readerEvent.target;
                if (result !== '') {
                  addImage(result);
                }
              }

              reader.removeEventListener('load', handleLoad);
            };

            reader.addEventListener('load', handleLoad);
            reader.readAsDataURL(file);
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
    (event: ClipboardEvent): void => {
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
            const reader = new FileReader();
            const handleLoad = (readerEvent: ProgressEvent<FileReader>): void => {
              if (readerEvent.target?.result && typeof readerEvent.target.result === 'string') {
                const { result } = readerEvent.target;
                if (result !== '') {
                  addImage(result);
                }
              }

              reader.removeEventListener('load', handleLoad);
            };

            reader.addEventListener('load', handleLoad);
            reader.readAsDataURL(file);
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
    // Add paste event listener to the document
    document.addEventListener('paste', handlePaste);

    // Cleanup function
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

  const handlePointerDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    // Only prevent default when clicking outside the textarea
    // This allows cursor positioning within the textarea while preventing
    // focus changes when clicking on the container padding/margins
    if (event.target !== textareaReference.current) {
      event.preventDefault();
    }
  };

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
    isDragging,
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
