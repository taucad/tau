import { memo } from 'react';
import { ChevronDown, Paperclip, CircuitBoard, Wrench } from 'lucide-react';
import type { ToolSelection } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { ChatKernelSelector } from '#components/chat/chat-kernel-selector.js';
import { ChatToolSelector } from '#components/chat/chat-tool-selector.js';
import { ChatModeSelector } from '#components/chat/chat-mode-selector.js';
import { Button } from '#components/ui/button.js';
import { Textarea } from '#components/ui/textarea.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { cn } from '#utils/ui.utils.js';
import { ChatContextActions } from '#components/chat/chat-context-actions.js';
import { ChatTextareaContextMenu } from '#components/chat/chat-textarea-context-menu.js';
import { ChatTextareaDesktopImages } from '#components/chat/chat-textarea-desktop-images.js';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';
import { focusTrapAttribute } from '#components/chat/chat-textarea-types.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import type { useModels } from '#hooks/use-models.js';
import { useFeature } from '#flags/use-feature.js';

type ChatTextareaDesktopProperties = {
  readonly className?: string;
  readonly enableAutoFocus?: boolean;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;

  // State from hook
  readonly isDragging: boolean;
  readonly showContextMenu: boolean;
  readonly contextSearchQuery: string;
  readonly selectedMenuIndex: number;
  readonly isSubmitting: boolean;
  readonly inputText: string;
  readonly images: string[];
  readonly selectedToolChoice: ToolSelection;
  readonly status: string;
  readonly selectedModel: ReturnType<typeof useModels>['selectedModel'];
  readonly formattedCancelKeyCombination: string;

  // Refs
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly textareaReference: React.RefObject<HTMLTextAreaElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly fileInputReference: React.RefObject<HTMLInputElement | null>;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly containerReference: React.RefObject<HTMLDivElement | null>;

  // Handlers
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancelClick: () => void;
  readonly handleTextareaKeyDown: (event: React.KeyboardEvent) => void;
  readonly handleDragOver: (event: React.DragEvent) => void;
  readonly handleDragLeave: () => void;
  readonly handleDrop: (event: React.DragEvent) => void;
  readonly handleFileSelect: () => void;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleTextChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  readonly handleContextMenuSelect: (text: string) => void;
  readonly handleContextImageAdd: (image: string) => void;
  readonly handleAddText: (text: string) => void;
  readonly handleAddImage: (image: string) => void;
  readonly handleTextareaBlur: () => void;
  readonly handlePointerDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly focusInput: () => void;
  readonly removeImage: (index: number) => void;
  readonly setDraftToolChoice: (choice: ToolSelection) => void;
  readonly setShowContextMenu: (show: boolean) => void;
  readonly setAtSymbolPosition: (position: number) => void;
  readonly setContextSearchQuery: (query: string) => void;
  readonly setSelectedMenuIndex: (index: number) => void;
};

/**
 * Desktop version of the chat textarea with full controls visible.
 * Shows model selector, kernel selector, context actions, and file upload button.
 */
export const ChatTextareaDesktop = memo(function ({
  className,
  enableAutoFocus = true,
  enableContextActions = true,
  enableKernelSelector = true,

  // State
  isDragging,
  showContextMenu,
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
}: ChatTextareaDesktopProperties): React.JSX.Element {
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
        onClick={(event) => {
          // Only focus if clicking outside the textarea (e.g., on padding)
          if (event.target !== textareaReference.current) {
            focusInput();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPointerDown={handlePointerDown}
      >
        {/* Input */}
        <Textarea
          ref={textareaReference}
          className={cn(
            'mb-10 size-full max-h-48 min-h-6 resize-none border-none bg-transparent dark:bg-transparent',
            'px-3 pb-3',
            'shadow-none ring-0 focus-visible:ring-0 focus-visible:outline-none',
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

      {/* Images overlay */}
      <ChatTextareaDesktopImages images={images} onRemoveImage={removeImage} />

      {/* Context Menu */}
      {showContextMenu ? (
        <ChatTextareaContextMenu
          searchQuery={contextSearchQuery}
          selectedIndex={selectedMenuIndex}
          onSelectedIndexChange={setSelectedMenuIndex}
          onAddImage={handleContextImageAdd}
          onAddText={handleContextMenuSelect}
          onClose={() => {
            setShowContextMenu(false);
            setAtSymbolPosition(-1);
            setContextSearchQuery('');
            setSelectedMenuIndex(0);
          }}
        />
      ) : null}

      {/* Drag and drop feedback */}
      {isDragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs">
          <p className="rounded-md bg-background/50 px-2 font-medium text-primary">Add image(s)</p>
        </div>
      ) : null}

      {/* Main input controls */}
      <div className="absolute bottom-2 left-2 flex flex-row items-center gap-1 text-muted-foreground">
        {/* Mode selector (behind feature flag) */}
        <ChatTextareaModeControl />
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
            {(_properties) => (
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 cursor-pointer! rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2"
                >
                  <span className="hidden truncate text-xs @[22rem]:block">{selectedModel?.name ?? 'Offline'}</span>
                  <span className="relative flex size-4 items-center justify-center">
                    <ChevronDown className="absolute scale-0 transition-transform duration-200 ease-in-out group-hover:scale-0 @[22rem]:scale-100" />
                    <CircuitBoard className="absolute scale-100 transition-transform duration-200 ease-in-out group-hover:scale-100 @[22rem]:scale-0" />
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
                    variant="outline"
                    size="sm"
                    className="h-7 cursor-pointer! rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2"
                  >
                    <span className="hidden truncate text-xs @[22rem]:block">{selectedKernel?.name ?? 'OpenSCAD'}</span>
                    <span className="relative flex size-4 items-center justify-center">
                      <ChevronDown className="absolute scale-0 transition-transform duration-200 ease-in-out group-hover:scale-0 @[22rem]:scale-100" />
                      <SvgIcon
                        id={selectedKernel?.id ?? 'openscad'}
                        className="absolute scale-100 transition-transform duration-200 ease-in-out group-hover:scale-100 @[22rem]:scale-0"
                      />
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
                  data-chat-textarea-focustrap={focusTrapAttribute}
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 rounded-full pr-2 text-muted-foreground hover:text-foreground @max-[22rem]:w-7',
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
                        const Icon = toolMetadata[tool]?.icon;
                        if (!Icon) {
                          return null;
                        }

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
        <ChatTextareaSubmitButton
          status={status}
          isSubmitting={isSubmitting}
          isDisabled={inputText.trim().length === 0 && images.length === 0}
          formattedCancelKeyCombination={formattedCancelKeyCombination}
          onSubmit={handleSubmit}
          onCancel={handleCancelClick}
        />
      </div>
    </div>
  );
});

ChatTextareaDesktop.displayName = 'ChatTextareaDesktop';

function ChatTextareaModeControl(): React.JSX.Element | undefined {
  const planModeEnabled = useFeature('planMode');
  const mode = useChatSelector((state) => (state.draftMode as ChatMode) ?? 'agent');
  const { setDraftMode } = useChatActions();

  if (!planModeEnabled) {
    return undefined;
  }

  return <ChatModeSelector mode={mode} onModeChange={setDraftMode} />;
}
