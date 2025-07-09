import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import type { JSX } from 'react';
import { Globe, ArrowUp, Image, X, Square, CircuitBoard, ChevronDown } from 'lucide-react';
import type { Attachment } from 'ai';
import type { ClassValue } from 'clsx';
import { useChatActions, useChatSelector } from '~/components/chat/ai-chat-provider.js';
import { ChatModelSelector } from '~/components/chat/chat-model-selector.js';
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from '~/components/ui/hover-card.js';
import { Button } from '~/components/ui/button.js';
import { Textarea } from '~/components/ui/textarea.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip.js';
import { useModels } from '~/hooks/use-models.js';
import { KeyShortcut } from '~/components/ui/key-shortcut.js';
import { formatKeyCombination } from '~/utils/keys.js';
import type { KeyCombination } from '~/utils/keys.js';
import { toast } from '~/components/ui/sonner.js';
import { useCookie } from '~/hooks/use-cookie.js';
import { cn } from '~/utils/ui.js';
import type { MessagePart } from '~/types/chat.types.js';
import { useKeydown } from '~/hooks/use-keydown.js';
import { ChatContextActions } from '~/components/chat/chat-context-actions.js';
import { SvgIcon } from '~/components/icons/svg-icon.js';
import type { KernelProvider } from '~/types/kernel.types.js';

export type ChatTextareaProperties = {
  readonly onSubmit: ({
    content,
    model,
    metadata,
    imageUrls,
  }: {
    content: string;
    model: string;
    metadata?: { 
      toolChoice?: 'web_search' | 'none' | 'auto' | 'any';
      cadKernel?: KernelProvider;
    };
    imageUrls?: string[];
  }) => Promise<void>;
  readonly onEscapePressed?: () => void;
  readonly shouldAutoFocus?: boolean;
  readonly initialContent?: MessagePart[];
  readonly initialAttachments?: Attachment[];
  readonly className?: ClassValue;
  readonly enableContextActions?: boolean;
  readonly initialCadKernel?: KernelProvider;
};

const defaultContent: MessagePart[] = [];
const defaultAttachments: Attachment[] = [];

// Define the key combination for cancelling the stream
const cancelKeyCombination = {
  key: 'Backspace',
  metaKey: true,
  shiftKey: true,
  requireAllModifiers: true,
} satisfies KeyCombination;

export const ChatTextarea = memo(function ({
  onSubmit,
  shouldAutoFocus: autoFocus = true,
  initialContent = defaultContent,
  initialAttachments = defaultAttachments,
  onEscapePressed,
  className,
  enableContextActions = true,
  initialCadKernel,
}: ChatTextareaProperties): JSX.Element {
  const { initialInputText, initialImageUrls } = useMemo(() => {
    let initialInputText = '';
    const initialImageUrls: string[] = [];

    for (const content of initialContent) {
      if (content.type === 'text') {
        initialInputText = content.text;
      }

      if (content.type === 'file') {
        initialImageUrls.push(content.data);
      }
    }

    for (const attachment of initialAttachments) {
      initialImageUrls.push(attachment.url);
    }

    return { initialInputText, initialImageUrls };
  }, [initialContent, initialAttachments]);
  const [inputText, setInputText] = useState(initialInputText);
  const [isSearching, setIsSearching] = useCookie('chat-web-search', false);
  const [selectedCadKernel, setSelectedCadKernel] = useCookie<KernelProvider>('chat-cad-kernel', initialCadKernel ?? 'replicad');
  const [isFocused, setIsFocused] = useState(false);
  const [images, setImages] = useState(initialImageUrls);
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [atSymbolPosition, setAtSymbolPosition] = useState<number>(-1);
  const [contextSearchQuery, setContextSearchQuery] = useState<string>('');
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const { selectedModel } = useModels();
  const status = useChatSelector((state) => state.context.status);
  const { stop } = useChatActions();

  const handleSubmit = async () => {
    // If there is no text or images, do not submit
    if (inputText.trim().length === 0) return;

    // The useChat hook will handle cancelling any ongoing stream
    setInputText('');
    setImages([]);
    await onSubmit({
      content: inputText,
      model: selectedModel?.id ?? '',
      metadata: {
        toolChoice: isSearching ? 'web_search' : 'auto',
        cadKernel: selectedCadKernel,
      },
      imageUrls: images,
    });
  };

  const handleCancelClick = () => {
    stop();
  };

  // Register keyboard shortcut for cancellation
  const { formattedKeyCombination: formattedCancelKeyCombination } = useKeydown(cancelKeyCombination, () => {
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
      textareaReference.current?.selectionEnd === 0 &&
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

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      for (const file of event.dataTransfer.files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          const handleLoad = (readerEvent: ProgressEvent<FileReader>) => {
            if (readerEvent.target?.result && typeof readerEvent.target.result === 'string') {
              const result = readerEvent.target?.result;
              if (result !== '') {
                setImages((previous) => [...previous, result]);
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
  }, []);

  const handleFileSelect = useCallback(() => {
    fileInputReference.current?.click();
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      for (const file of event.target.files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          const handleLoad = (readerEvent: ProgressEvent<FileReader>) => {
            if (readerEvent.target?.result && typeof readerEvent.target.result === 'string') {
              const result = readerEvent.target?.result;
              if (result !== '') {
                setImages((previous) => [...previous, result]);
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
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((previous) => previous.filter((_, index_) => index_ !== index));
  }, []);

  const focusInput = useCallback(() => {
    textareaReference.current?.focus();
  }, [textareaReference]);

  /**
   * Handle paste event to add images to the chat
   */
  const handlePaste = useCallback((event: ClipboardEvent) => {
    // Check if the textarea is the active element or its ancestor contains focus
    const isTextareaFocused =
      document.activeElement === textareaReference.current ||
      textareaReference.current?.contains(document.activeElement);

    if (!isTextareaFocused) return;

    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          const handleLoad = (readerEvent: ProgressEvent<FileReader>) => {
            if (readerEvent.target?.result && typeof readerEvent.target.result === 'string') {
              const result = readerEvent.target?.result;
              if (result !== '') {
                setImages((previous) => [...previous, result]);
              }
            }

            reader.removeEventListener('load', handleLoad);
          };

          reader.addEventListener('load', handleLoad);
          reader.readAsDataURL(file);
        }
      }
    }
  }, []);

  const handleAddText = useCallback(
    (text: string) => {
      setInputText((previous) => previous + text);
      focusInput();
    },
    [focusInput],
  );

  const handleAddImage = useCallback(
    (image: string) => {
      setImages((previous) => [...previous, image]);
      focusInput();
    },
    [focusInput],
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

      setInputText(newValue);
    },
    [inputText, showContextMenu, atSymbolPosition],
  );

  const handleContextMenuSelect = useCallback(
    (text: string) => {
      if (atSymbolPosition >= 0) {
        // Replace the @ symbol and any text after it with the selected text
        const beforeAt = inputText.slice(0, atSymbolPosition);
        const afterAtAndQuery = inputText.slice(atSymbolPosition + 1 + contextSearchQuery.length);
        const newText = beforeAt + text + afterAtAndQuery;
        setInputText(newText);

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
    [inputText, atSymbolPosition, contextSearchQuery],
  );

  const handleContextImageAdd = useCallback(
    (image: string) => {
      setImages((previous) => [...previous, image]);
      // Close the menu
      setShowContextMenu(false);
      setAtSymbolPosition(-1);
      setContextSearchQuery('');

      // Remove the @ symbol and any query text from text
      if (atSymbolPosition >= 0) {
        const beforeAt = inputText.slice(0, atSymbolPosition);
        const afterAtAndQuery = inputText.slice(atSymbolPosition + 1 + contextSearchQuery.length);
        setInputText(beforeAt + afterAtAndQuery);
      }

      focusInput();
    },
    [inputText, atSymbolPosition, contextSearchQuery, focusInput],
  );

  useEffect(() => {
    if (autoFocus) {
      focusInput();
    }
  }, [autoFocus, focusInput]);

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

  return (
    <div className={cn('@container relative h-full rounded-2xl bg-background', className)}>
      {/* Textarea */}
      <div
        data-state={isFocused ? 'active' : 'inactive'}
        className={cn(
          'flex size-full cursor-text resize-none flex-col overflow-auto rounded-2xl border bg-neutral/10 shadow-md data-[state=active]:border-primary',
        )}
        onClick={() => {
          focusInput();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          ref={textareaReference}
          className={cn(
            'mt-2 mb-10 size-full max-h-48 min-h-14 resize-none border-none px-4 pt-1 pb-1 ring-0 shadow-none focus-visible:ring-0 focus-visible:outline-none',
            (images.length > 0 || enableContextActions) && 'mt-6 pt-5',
          )}
          rows={3}
          value={inputText}
          placeholder="Ask Tau a question..."
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          onChange={handleTextChange}
          onKeyDown={handleTextareaKeyDown}
        />
      </div>

      {/* Context Menu */}
      {showContextMenu ? (
        <div className="absolute bottom-full left-4 z-50 mb-2 w-60 rounded-md border bg-popover p-0 text-popover-foreground shadow-md">
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

      {/* Context */}
      <div className="absolute top-0 left-0 m-4 flex flex-wrap gap-1">
        {enableContextActions ? <ChatContextActions addImage={handleAddImage} addText={handleAddText} /> : null}
        {images.map((image, index) => (
          <div key={image} className="relative">
            <HoverCard openDelay={100} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className="flex h-6 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border bg-background object-cover">
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
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 z-10 size-4 rounded-full border-[1px] bg-background text-foreground"
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

      {/* Drag and drop feedback */}
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs">
          <p className="rounded-md bg-background/50 px-2 font-medium text-primary">Add image(s)</p>
        </div>
      ) : null}

      {/* Main input controls */}
      <div className="absolute bottom-2 left-2 flex flex-row items-center gap-1">
        {/* Model selector */}
        <Tooltip>
          <ChatModelSelector popoverProperties={{ align: 'start' }} onClose={focusInput}>
            {() => (
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-full">
                  <span className="flex max-w-24 shrink-0 flex-row items-center gap-2 rounded-full group-data-[state=open]:text-primary @md:max-w-fit">
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
            <span>({selectedModel?.name ?? 'Offline'})</span>
          </TooltipContent>
        </Tooltip>

        {/* Search button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-state={isSearching ? 'active' : 'inactive'}
              variant="outline"
              className="group rounded-full transition-transform duration-200 ease-in-out data-[state=active]:bg-neutral/20 data-[state=active]:text-primary data-[state=active]:shadow"
              onMouseDown={(event) => {
                // Prevent the button from being focused
                event.stopPropagation();
                event.preventDefault();
              }}
              onClick={() => {
                setIsSearching((previous) => !previous);
              }}
            >
              <span className="hidden text-xs @[22rem]:block">Search</span>
              <Globe className="transition-transform duration-200 ease-in-out group-hover:rotate-180" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isSearching ? 'Stop searching' : 'Search the web'}</p>
          </TooltipContent>
        </Tooltip>

        {/* CAD Kernel selector */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="group rounded-full transition-transform duration-200 ease-in-out"
              onMouseDown={(event) => {
                // Prevent the button from being focused
                event.stopPropagation();
                event.preventDefault();
              }}
              onClick={() => {
                setSelectedCadKernel((previous) => previous === 'replicad' ? 'openscad' : 'replicad');
              }}
            >
              <span className="hidden text-xs @[22rem]:block">{selectedCadKernel === 'replicad' ? 'Replicad' : 'OpenSCAD'}</span>
              <SvgIcon 
                id={selectedCadKernel} 
                className="transition-transform duration-200 ease-in-out group-hover:scale-110" 
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>CAD Kernel: {selectedCadKernel === 'replicad' ? 'Replicad (TypeScript)' : 'OpenSCAD'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Upload button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="rounded-full" title="Add image" onClick={handleFileSelect}>
              <span className="hidden text-xs @[22rem]:block">Upload</span>
              <Image />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload an image</p>
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
        {/* Submit button */}
        {status === 'streaming' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" className="rounded-full" onClick={handleCancelClick}>
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
              <Button size="icon" className="rounded-full" disabled={inputText.length === 0} onClick={handleSubmit}>
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
