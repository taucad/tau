import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { Globe, ArrowUp, ChevronDown, CircuitBoard, Image, X, Square } from 'lucide-react';
import type { Attachment } from 'ai';
import { useAiChat } from './ai-chat-provider.js';
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { Button } from '@/components/ui/button.js';
import { Textarea } from '@/components/ui/textarea.js';
import { Badge } from '@/components/ui/badge.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive.js';
import type { Model } from '@/hooks/use-models.js';
import { useModels } from '@/hooks/use-models.js';
import { SvgIcon } from '@/components/icons/svg-icon.js';
import type { ModelProvider } from '@/types/cad.js';
import { cn } from '@/utils/ui.js';
import type { MessagePart } from '@/types/chat.js';
import { useKeydown } from '@/hooks/use-keydown.js';
import { KeyShortcut } from '@/components/ui/key-shortcut.js';
import { formatKeyCombination } from '@/utils/keys.js';
import type { KeyCombination } from '@/utils/keys.js';
import { toast } from '@/components/ui/sonner.js';
import { useCookie } from '@/hooks/use-cookie.js';

export type ChatTextareaProperties = {
  readonly onSubmit: ({
    content,
    model,
    metadata,
    imageUrls,
  }: {
    content: string;
    model: string;
    metadata?: { toolChoice?: 'web' | 'none' | 'auto' | 'any' };
    imageUrls?: string[];
  }) => Promise<void>;
  readonly onEscapePressed?: () => void;
  readonly models: Model[];
  readonly shouldAutoFocus?: boolean;
  readonly initialContent?: MessagePart[];
  readonly initialAttachments?: Attachment[];
};

const defaultContent: MessagePart[] = [];
const defaultAttachments: Attachment[] = [];

// Define the key combination for cancelling the stream
const cancelKeyCombination = {
  key: 'Backspace',
  metaKey: true,
} satisfies KeyCombination;

export function ChatTextarea({
  onSubmit,
  models,
  shouldAutoFocus: autoFocus = true,
  initialContent = defaultContent,
  initialAttachments = defaultAttachments,
  onEscapePressed,
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
  const [isSearching, setIsSearching] = useCookie('chat-web', true);
  const [isFocused, setIsFocused] = useState(false);
  const [images, setImages] = useState(initialImageUrls);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement>(null);
  const { selectedModel, setSelectedModel } = useModels();
  const { stop, status } = useAiChat();

  const handleSubmit = async () => {
    // If there is no text or images, do not submit
    if (inputText.trim().length === 0) return;

    // The useChat hook will handle cancelling any ongoing stream
    setInputText('');
    setImages([]);
    await onSubmit({
      content: inputText,
      model: selectedModel,
      metadata: {
        toolChoice: isSearching ? 'web' : 'auto',
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

  const providerModelsMap = new Map<string, Model[]>();
  for (const model of models) {
    if (!providerModelsMap.has(model.provider)) {
      providerModelsMap.set(model.provider, []);
    }

    providerModelsMap.get(model.provider)?.push(model);
  }

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

  return (
    <div className="@container relative h-full">
      {/* Textarea */}
      <div
        data-state={isFocused ? 'active' : 'inactive'}
        className={cn(
          'flex size-full cursor-text resize-none flex-col overflow-auto rounded-xl border shadow-md data-[state=active]:border-primary',
          images.length > 0 && 'pt-10',
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
          className="mb-8 size-full resize-none border-none p-4 pt-3 pb-0 ring-0 shadow-none focus-visible:ring-0 focus-visible:outline-none"
          rows={3}
          value={inputText}
          placeholder="Ask Tau a question..."
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          onChange={(event) => {
            setInputText(event.target.value);
          }}
          onKeyDown={handleTextareaKeyDown}
        />
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="absolute top-0 left-0 m-4 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={image} className="relative">
              <HoverCard openDelay={100} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <img
                    src={image}
                    alt="Uploaded"
                    className="h-8 w-8 cursor-zoom-in rounded-md border bg-muted object-cover"
                  />
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
                className="absolute -top-2 -right-2 size-4 rounded-full border-[1px] bg-background text-foreground"
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
      )}

      {/* Drag and drop feedback */}
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs">
          <p className="rounded-md bg-background/50 px-2 font-medium text-primary">Drop images here</p>
        </div>
      ) : null}

      {/* Main input controls */}
      <div className="absolute bottom-2 left-2 flex flex-row items-center gap-1">
        {/* Model selector */}
        <ComboBoxResponsive
          className="group flex h-6 w-[initial] items-center justify-between gap-2 border-none px-2 text-xs"
          popoverContentClassName="w-[300px]"
          groupedItems={[...providerModelsMap.entries()].map(([provider, models]) => ({
            name: provider,
            items: models,
          }))}
          renderLabel={(item) => (
            <span className="flex w-full items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {}
                <SvgIcon id={item.provider as ModelProvider} />
                <span className="font-mono">{item.name}</span>
              </div>
              {item.details.parameterSize ? (
                <Badge variant="outline" className="bg-background">
                  {item.details.parameterSize}
                </Badge>
              ) : null}
            </span>
          )}
          renderButtonContents={(item) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex max-w-24 shrink-0 flex-row items-center gap-2 group-data-[state=open]:text-primary @md:max-w-fit">
                  <span className="hidden truncate text-xs @xs:block">{item.name}</span>
                  <span className="relative flex size-4 items-center justify-center">
                    <ChevronDown className="absolute scale-0 transition-transform duration-200 ease-in-out group-hover:scale-0 @xs:scale-100" />
                    <CircuitBoard className="absolute scale-100 transition-transform duration-200 ease-in-out group-hover:scale-100 @xs:scale-0" />
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  <span>Select model{` `}</span>
                  <span>({item.name})</span>
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          getValue={(item) => item.id}
          placeholder="Select a model"
          defaultValue={models.find((model) => model.id === selectedModel)}
          onSelect={(model) => {
            setSelectedModel(model);
            focusInput();
          }}
          onClose={() => {
            focusInput();
          }}
        />

        {/* Search button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-state={isSearching ? 'active' : 'inactive'}
              size="xs"
              variant="ghost"
              className="group transition-transform duration-200 ease-in-out data-[state=active]:bg-neutral/20 data-[state=active]:text-primary data-[state=active]:shadow"
              onMouseDown={(event) => {
                // Prevent the button from being focused
                event.stopPropagation();
                event.preventDefault();
              }}
              onClick={() => {
                setIsSearching((previous) => !previous);
              }}
            >
              <span className="hidden text-xs @xs:block">Search</span>
              <Globe className="transition-transform duration-200 ease-in-out group-hover:rotate-180" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isSearching ? 'Stop searching' : 'Search the web'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Upload button */}
        <div className="flex flex-row items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="xs" title="Add image" type="button" onClick={handleFileSelect}>
                <span className="hidden text-xs @xs:block">Upload</span>
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
      </div>

      <div className="absolute right-2 bottom-2 flex flex-row items-center gap-1">
        {/* Voice input */}
        {/* <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" variant="ghost" className="h-6">
              <AudioLines />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Speak to Tau <ComingSoon variant="tooltip" className="ml-1" />
          </TooltipContent>
        </Tooltip> */}
        {/* Submit button */}
        {status === 'streaming' ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" className="size-6 rounded-full" onClick={handleCancelClick}>
                <Square className="size-3 fill-primary-foreground" />
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
                className="size-6 rounded-full"
                disabled={inputText.length === 0}
                onClick={handleSubmit}
              >
                <ArrowUp className="size-4" />
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
}
