import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Globe, ArrowRight, ChevronDown, CircuitBoard, AudioLines, Image, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive';
import { Model } from '@/hooks/use-models';
import { SvgIcon } from '@/components/icons/svg-icon';
import { ModelProvider } from '@/types/cad';
import { ComingSoon } from '../ui/coming-soon';
import { useChat } from '@/contexts/use-chat';
import { cn } from '@/utils/ui';
import { HoverCard, HoverCardContent, HoverCardPortal, HoverCardTrigger } from '../ui/hover-card';
import { MessageContent } from '@/types/chat';

export interface ChatTextareaProperties {
  onSubmit: ({
    content,
    model,
    metadata,
    imageUrls,
  }: {
    content: string;
    model: string;
    metadata?: { systemHints?: string[] };
    imageUrls?: string[];
  }) => Promise<void>;
  onEscapePressed?: () => void;
  models: Model[];
  defaultModel?: string;
  autoFocus?: boolean;
  initialContent?: MessageContent[];
}

export function ChatTextarea({
  onSubmit,
  models,
  autoFocus = true,
  initialContent = [],
  onEscapePressed: onFocusLost,
}: ChatTextareaProperties) {
  const { initialInputText, initialImageUrls } = useMemo(() => {
    // eslint-disable-next-line unicorn/no-array-reduce
    return initialContent.reduce<{ initialInputText: string; initialImageUrls: string[] }>(
      (accumulator, content) => {
        if (content.type === 'text') {
          accumulator.initialInputText = content.text;
        }
        if (content.type === 'image_url') {
          accumulator.initialImageUrls.push(content.image_url.url);
        }
        return accumulator;
      },
      { initialInputText: '', initialImageUrls: [] },
    );
  }, [initialContent]);
  const [inputText, setInputText] = useState(initialInputText);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [images, setImages] = useState(initialImageUrls);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const textareaReference = useRef<HTMLTextAreaElement | null>(null);
  const { selectedModel, setSelectedModel } = useChat();

  const handleSubmit = async () => {
    // If there is no text or images, do not submit
    if (inputText.trim().length === 0) return;

    setInputText('');
    setImages([]);
    await onSubmit({
      content: inputText,
      model: selectedModel,
      metadata: { systemHints: [...(isSearching ? ['search'] : [])] },
      imageUrls: images,
    });
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
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
      onFocusLost?.();
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
    <div className="relative h-full @container">
      {/* Textarea */}
      <div
        data-state={isFocused ? 'active' : 'inactive'}
        onClick={() => {
          focusInput();
        }}
        className={cn(
          'flex flex-col h-full border shadow-md rounded-lg data-[state=active]:border-primary w-full resize-none overflow-auto cursor-text',
          images.length > 0 && 'pt-10',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Textarea
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          ref={textareaReference}
          className="border-none shadow-none ring-0 p-4 pr-10 pb-0 mb-8 focus-visible:ring-0 focus-visible:outline-none w-full resize-none h-full"
          rows={3}
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder="Ask Tau a question..."
        />
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="absolute top-0 left-0 flex flex-wrap gap-2 m-4">
          {images.map((image, index) => (
            <div key={index} className="relative">
              <HoverCard openDelay={100} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <img
                    src={image}
                    alt="Uploaded"
                    className="h-8 w-8 object-cover rounded-md border bg-muted cursor-zoom-in"
                  />
                </HoverCardTrigger>
                <HoverCardPortal>
                  <HoverCardContent side="top" align="start" className="p-0 size-auto max-w-screen overflow-hidden">
                    <img src={image} alt="Uploaded" className="object-cover h-48 md:h-96" />
                  </HoverCardContent>
                </HoverCardPortal>
              </HoverCard>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeImage(index)}
                className="absolute -top-2 -right-2 text-foreground bg-background border-[1px] rounded-full size-4"
                aria-label="Remove image"
                type="button"
              >
                <X className="!size-3 stroke-2" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Drag and drop feedback */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 pointer-events-none rounded-md backdrop-blur-xs z-10">
          <p className="text-primary font-medium bg-background/50 px-2 rounded-md">Drop images here</p>
        </div>
      )}

      {/* Submit button */}
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2"
        onClick={handleSubmit}
        disabled={inputText.length === 0}
      >
        <ArrowRight className="size-4" />
      </Button>

      {/* Main input controls */}
      <div className="absolute left-2 bottom-2 flex flex-row items-center gap-1">
        {/* Model selector */}
        <ComboBoxResponsive
          className="group text-xs w-[initial] px-2 h-6 border-none flex items-center justify-between gap-2"
          popoverContentClassName="w-[300px]"
          groupedItems={[...providerModelsMap.entries()].map(([provider, models]) => ({
            name: provider,
            items: models,
          }))}
          renderLabel={(item) => (
            <span className="text-xs flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {/* item.provider is not typed as ModelProvider, but it is */}
                {/* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */}
                <SvgIcon id={item.provider as ModelProvider} />
                <span className="font-mono">{item.name}</span>
              </div>
              {item.details.parameterSize && (
                <Badge variant="outline" className="bg-background">
                  {item.details.parameterSize}
                </Badge>
              )}
            </span>
          )}
          renderButtonContents={(item) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex flex-row items-center gap-2 group-data-[state=open]:text-primary max-w-24 @md:max-w-fit shrink-0">
                  <span className="text-xs truncate hidden @xs:block">{item.name}</span>
                  <span className="relative flex size-4 items-center justify-center">
                    <ChevronDown className="scale-0 @xs:scale-100 absolute group-hover:scale-0 transition-transform duration-200 ease-in-out" />
                    <CircuitBoard className="absolute scale-100 @xs:scale-0 group-hover:scale-100 transition-transform duration-200 ease-in-out" />
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
          onSelect={(model) => {
            setSelectedModel(model);
            focusInput();
          }}
          placeholder="Select a model"
          defaultValue={models.find((model) => model.id === selectedModel)}
        />

        {/* Search button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-state={isSearching ? 'active' : 'inactive'}
              size="xs"
              variant="ghost"
              className="group data-[state=active]:bg-neutral/20 data-[state=active]:text-primary data-[state=active]:shadow transition-transform duration-200 ease-in-out"
              onClick={() => {
                setIsSearching((previous) => !previous);
                focusInput();
              }}
            >
              <span className="text-xs hidden @xs:block">Search</span>
              <Globe className="group-hover:rotate-180 transition-transform duration-200 ease-in-out" />
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
              <Button variant="ghost" size="xs" onClick={handleFileSelect} title="Add image" type="button">
                <span className="text-xs hidden @xs:block">Upload</span>
                <Image />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Upload an image</p>
            </TooltipContent>
          </Tooltip>

          <input
            type="file"
            ref={fileInputReference}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
            multiple
          />
        </div>
      </div>

      {/* Voice input */}
      <div className="absolute right-2 bottom-2 flex flex-row items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="xs" variant="ghost" className="h-6">
              <AudioLines />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Speak to Tau <ComingSoon variant="tooltip" className="ml-1" />
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
