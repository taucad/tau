import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { ArrowUp, X, Square, CircuitBoard, ChevronDown, Paperclip, Wrench } from 'lucide-react';
import type { ClassValue } from 'clsx';
import type { ToolWithSelection } from '@taucad/types';
import { useChatActions, useChatSelector } from '#components/chat/chat-provider.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { ChatKernelSelector } from '#components/chat/chat-kernel-selector.js';
import { ChatToolSelector } from '#components/chat/chat-tool-selector.js';
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from '#components/ui/hover-card.js';
import { Button } from '#components/ui/button.js';
import { Textarea } from '#components/ui/textarea.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useModels } from '#hooks/use-models.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { toast } from '#components/ui/sonner.js';
import { cn } from '#utils/ui.utils.js';
import { useKeydown } from '#hooks/use-keydown.js';
import { ChatContextActions } from '#components/chat/chat-context-actions.js';

/**
 * IMPORTANT NOTE:
 *
 * When adding a new element to the textarea and that element contains portalled content,
 * make sure to add the `data-chat-textarea-focustrap` attribute to the element.
 *
 * This is used to determine if the focus has truly left the textarea and its related UI elements.
 */
const focusTrapAttribute = 'data-chat-textarea-focustrap';

export type ChatTextareaProperties = {
  readonly onSubmit: ({
    content,
    model,
    metadata,
    imageUrls,
  }: {
    content: string;
    model: string;
    metadata?: { toolChoice?: ToolWithSelection };
    imageUrls?: string[];
  }) => Promise<void>;
  readonly onEscapePressed?: () => void;
  readonly onBlur?: () => void;
  readonly enableAutoFocus?: boolean;
  readonly className?: ClassValue;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;
  readonly mode?: 'main' | 'edit';
};

// Define the key combination for cancelling the stream
export const cancelChatStreamKeyCombination = {
  key: 'Backspace',
  metaKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

export const ChatTextarea = memo(function ({
  onSubmit,
  enableAutoFocus = true,
  onEscapePressed,
  onBlur,
  className,
  enableContextActions = true,
  enableKernelSelector = true,
  mode = 'main',
}: ChatTextareaProperties): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [atSymbolPosition, setAtSymbolPosition] = useState<number>(-1);
  const [contextSearchQuery, setContextSearchQuery] = useState<string>('');
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const { selectedModel } = useModels();
  const status = useChatSelector((state) => state.context.status);

  // Read draft state from machine based on mode
  const inputText = useChatSelector((state) =>
    mode === 'main' ? state.context.draftText : state.context.editDraftText,
  );
  const images = useChatSelector((state) =>
    mode === 'main' ? state.context.draftImages : state.context.editDraftImages,
  );
  const selectedToolChoice = useChatSelector((state) =>
    mode === 'main' ? (state.context.draftToolChoice as ToolWithSelection) : 'auto',
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

  const handleSubmit = async () => {
    // If there is no text or images, do not submit
    if (inputText.trim().length === 0) {
      return;
    }

    // The useChat hook will handle cancelling any ongoing stream
    await onSubmit({
      content: inputText,
      model: selectedModel?.id ?? '',
      metadata: {
        toolChoice: selectedToolChoice,
      },
      imageUrls: images,
    });
    // Draft will be cleared by the machine's submit action
  };

  const handleCancelClick = () => {
    stop();
  };

  // Register keyboard shortcut for cancellation
  const { formattedKeyCombination: formattedCancelKeyCombination } = useKeydown(cancelChatStreamKeyCombination, () => {
    if (status === 'streaming') {
      stop();
    }
  });

  const handleTextareaKeyDown = (event: React.KeyboardEvent) => {
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

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      if (event.dataTransfer.files.length > 0) {
        for (const file of event.dataTransfer.files) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            const handleLoad = (readerEvent: ProgressEvent<FileReader>) => {
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
          } else {
            toast.error('Only images are supported');
          }
        }
      }
    },
    [addImage],
  );

  const handleFileSelect = useCallback(() => {
    fileInputReference.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        for (const file of event.target.files) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            const handleLoad = (readerEvent: ProgressEvent<FileReader>) => {
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

  const focusInput = useCallback(() => {
    if (textareaReference.current) {
      textareaReference.current.focus();
      // Set cursor position to end of text
      textareaReference.current.selectionStart = textareaReference.current.value.length;
      textareaReference.current.selectionEnd = textareaReference.current.value.length;
    }
  }, [textareaReference]);

  /**
   * Handle paste event to add images to the chat
   */
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
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
            const handleLoad = (readerEvent: ProgressEvent<FileReader>) => {
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
    (text: string) => {
      setText(inputText + text);
      focusInput();
    },
    [focusInput, inputText, setText],
  );

  const handleAddImage = useCallback(
    (image: string) => {
      addImage(image);
      focusInput();
    },
    [focusInput, addImage],
  );

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
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
    (text: string) => {
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
    (image: string) => {
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
    const handleClickOutside = (event: MouseEvent) => {
      if (showContextMenu && textareaReference.current && !textareaReference.current.contains(event.target as Node)) {
        setShowContextMenu(false);
        setAtSymbolPosition(-1);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showContextMenu]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const containerReference = useRef<HTMLDivElement>(null);

  const handleTextareaBlur = useCallback(() => {
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

  return (
    <div
      ref={containerReference}
      className={cn(
        'group/chat-textarea @container',
        'relative flex size-full flex-col rounded-2xl border bg-background',
        'cursor-text overflow-auto',
        'shadow-md',
        'focus-within:border-primary',
        className,
      )}
      onBlur={handleTextareaBlur}
    >
      {/* Textarea */}
      <div
        className={cn('flex size-full flex-col overflow-auto')}
        onClick={focusInput}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseDown={handleMouseDown}
      >
        {/* Input */}
        <Textarea
          ref={textareaReference}
          className={cn(
            'mb-10 size-full max-h-48 min-h-6 resize-none border-none bg-transparent dark:bg-transparent',
            'px-3 pb-3',
            'ring-0 shadow-none focus-visible:ring-0 focus-visible:outline-none',
            images.length > 0 ? 'pt-10' : 'pt-2',
          )}
          rows={3}
          autoFocus={enableAutoFocus}
          value={inputText}
          placeholder="Ask Tau to build anything..."
          onChange={handleTextChange}
          onKeyDown={handleTextareaKeyDown}
        />
      </div>

      {/* Images overlay - only shown when images exist */}
      {images.length > 0 ? (
        <div className="absolute top-3 right-3 left-3 flex flex-wrap gap-1">
          {images.map((image, index) => (
            <div key={image} className="group/image-item relative text-muted-foreground hover:text-foreground">
              <HoverCard openDelay={100} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div className="flex h-6 cursor-zoom-in items-center justify-center overflow-hidden rounded-xs border bg-background object-cover">
                    <img src={image} alt="Uploaded" className="size-6 border-r object-cover" />
                    <span className="px-1 text-xs">Image</span>
                  </div>
                </HoverCardTrigger>
                <HoverCardPortal>
                  <HoverCardContent side="top" align="start" className="size-auto max-w-screen overflow-hidden p-0">
                    <img src={image} alt="Uploaded" className="h-48 object-cover md:h-96" />
                  </HoverCardContent>
                </HoverCardPortal>
              </HoverCard>
              <Button
                size="icon"
                className={cn(
                  'absolute top-1/2 left-0 z-10 size-6 -translate-y-1/2 rounded-none rounded-l-xs border border-r-0',
                  'hidden group-hover/image-item:flex',
                )}
                aria-label="Remove image"
                type="button"
                onClick={() => {
                  removeImage(index);
                }}
              >
                <X className="!size-3 stroke-2" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Context Menu */}
      {showContextMenu ? (
        <div className="absolute bottom-full left-2 z-50 mb-2 w-60 rounded-md border bg-popover p-0 text-popover-foreground shadow-md">
          <ChatContextActions
            asPopoverMenu
            addImage={handleContextImageAdd}
            addText={handleContextMenuSelect}
            searchQuery={contextSearchQuery}
            selectedIndex={selectedMenuIndex}
            onSelectedIndexChange={setSelectedMenuIndex}
            onSelectItem={(text: string) => {
              handleContextMenuSelect(text);
            }}
            onClose={() => {
              setShowContextMenu(false);
              setAtSymbolPosition(-1);
              setContextSearchQuery('');
              setSelectedMenuIndex(0);
            }}
          />
        </div>
      ) : null}

      {/* Drag and drop feedback */}
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs">
          <p className="rounded-md bg-background/50 px-2 font-medium text-primary">Add image(s)</p>
        </div>
      ) : null}

      {/* Main input controls */}
      <div className="absolute bottom-2 left-2 flex flex-row items-center gap-1 text-muted-foreground">
        {/* Model selector */}
        <Tooltip>
          <ChatModelSelector
            data-chat-textarea-focustrap
            popoverProperties={{
              align: 'start',
            }}
            onSelect={focusInput}
            onClose={focusInput}
          >
            {(_props) => (
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 cursor-pointer! rounded-full text-muted-foreground hover:text-foreground"
                >
                  <span className="flex max-w-24 shrink-0 flex-row items-center gap-2 rounded-full @max-[22rem]:w-7 @xs:max-w-fit">
                    <span className="hidden truncate text-xs @[22rem]:block">{selectedModel?.name ?? 'Offline'}</span>
                    <span className="relative flex size-4 items-center justify-center">
                      <ChevronDown className="absolute scale-0 transition-transform duration-200 ease-in-out group-hover:scale-0 @[22rem]:scale-100" />
                      <CircuitBoard className="absolute scale-100 transition-transform duration-200 ease-in-out group-hover:scale-100 @[22rem]:scale-0" />
                    </span>
                  </span>
                </Button>
              </TooltipTrigger>
            )}
          </ChatModelSelector>
          <TooltipContent>
            <span>Select model{` `}</span>
            <span>({selectedModel?.slug ?? 'Offline'})</span>
          </TooltipContent>
        </Tooltip>
        {/* Kernel selector */}
        {enableKernelSelector ? (
          <Tooltip>
            <ChatKernelSelector
              data-chat-textarea-focustrap
              popoverProperties={{
                align: 'start',
              }}
              onSelect={focusInput}
              onClose={focusInput}
            >
              {({ selectedKernel }) => (
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 cursor-pointer! rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <span className="flex max-w-24 shrink-0 flex-row items-center gap-2 rounded-full @max-[22rem]:w-7 @xs:max-w-fit">
                      <span className="hidden truncate text-xs @[22rem]:block">
                        {selectedKernel?.name ?? 'OpenSCAD'}
                      </span>
                      <span className="relative flex size-4 items-center justify-center">
                        <ChevronDown className="absolute scale-0 transition-transform duration-200 ease-in-out group-hover:scale-0 @[22rem]:scale-100" />
                        <SvgIcon
                          id={selectedKernel?.id ?? 'openscad'}
                          className="absolute scale-100 transition-transform duration-200 ease-in-out group-hover:scale-100 @[22rem]:scale-0"
                        />
                      </span>
                    </span>
                  </Button>
                </TooltipTrigger>
              )}
            </ChatKernelSelector>
            <TooltipContent>
              <span>Select kernel</span>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {/* Tool selector */}
        <Tooltip>
          <ChatToolSelector value={selectedToolChoice} onValueChange={setDraftToolChoice}>
            {({ selectedMode, selectedTools, toolMetadata }) => (
              <TooltipTrigger asChild>
                <Button
                  data-chat-textarea-focustrap
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7',
                    selectedTools.length > 0 && 'px-2 @max-[22rem]:w-auto',
                    // eslint-disable-next-line no-warning-comments -- keeping this file clean.
                    'hidden', // TODO: add back when MCP is added.
                  )}
                >
                  <span className="hidden text-xs @[22rem]:block">
                    {selectedMode === 'auto' && 'Auto'}
                    {selectedMode === 'none' && 'No tools'}
                    {selectedMode === 'any' && 'Any tool'}
                    {selectedMode === 'custom' && 'Custom'}
                  </span>
                  {selectedMode === 'custom' && selectedTools.length > 0 ? (
                    <span className="flex items-center gap-1">
                      {selectedTools.map((tool) => {
                        const Icon = toolMetadata[tool].icon;
                        return <Icon key={tool} className="size-4" />;
                      })}
                    </span>
                  ) : (
                    <Wrench className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
            )}
          </ChatToolSelector>
          <TooltipContent>
            <p>Tool selection</p>
          </TooltipContent>
        </Tooltip>

        <input
          ref={fileInputReference}
          multiple
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="absolute right-2 bottom-2 flex flex-row items-center gap-1">
        {/* Context actions */}
        {enableContextActions ? (
          <ChatContextActions data-chat-textarea-focustrap addImage={handleAddImage} addText={handleAddText} />
        ) : null}

        {/* Upload button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              title="Add image"
              onClick={handleFileSelect}
            >
              <Paperclip />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload an image</p>
          </TooltipContent>
        </Tooltip>

        {/* Submit button */}
        {status === 'streaming' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" className="size-7 rounded-full" onClick={handleCancelClick}>
                <Square className="size-4 fill-primary-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2 align-baseline">
              Stop <KeyShortcut variant="tooltip">{formattedCancelKeyCombination}</KeyShortcut>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="size-7 rounded-full"
                disabled={inputText.trim().length === 0}
                onClick={handleSubmit}
              >
                <ArrowUp className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2 align-baseline">
              Send <KeyShortcut variant="tooltip">{formatKeyCombination({ key: 'Enter' })}</KeyShortcut>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
});
