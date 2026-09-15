import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Brain, Paperclip, Wrench, AtSign, SlidersHorizontal } from 'lucide-react';
import type { AcpSessionData, Chat, ToolSelection } from '@taucad/chat';
import type { FileEntry } from '@taucad/types';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { ChatModelSelector, openModelSelectorKeyCombination } from '#components/chat/chat-model-selector.js';
import { ChatAgentModelSelector, useChatAgentModel } from '#components/chat/chat-agent-model-selector.js';
import { ChatBranchPicker } from '#components/chat/chat-branch-picker.js';
import {
  ChatExecutionSelector,
  formatChatAgentActivity,
  useChatAgentSelection,
} from '#components/chat/chat-execution-selector.js';
import { CreditBalanceChip } from '#components/billing/credit-estimate.js';
import { ChatKernelSelector } from '#components/chat/chat-kernel-selector.js';
import { ChatToolSelector } from '#components/chat/chat-tool-selector.js';
import { ChatAgentSelector, toggleModeKeyCombination } from '#components/chat/chat-mode-selector.js';
import { Button } from '@taucad/ui/components/button';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { cn } from '@taucad/ui/utils/cn';
import { ChatContextIndicator } from '#components/chat/chat-context-indicator.js';
import { ChatTextareaBorderBeam } from '#components/chat/chat-textarea-border-beam.js';
import { ChatTextareaDesktopImages } from '#components/chat/chat-textarea-desktop-images.js';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';
import { focusTrapAttribute } from '#components/chat/chat-textarea-types.js';
import type { ChatTextareaDragKind } from '#components/chat/chat-textarea-types.js';
import { useSelector } from '@xstate/react';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useDraftActions } from '#hooks/use-chat.js';
import type { DraftImageOptions } from '#hooks/use-chat.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { useFeature } from '#flags/use-feature.js';
import { ChatEditor } from '#components/chat/tiptap/chat-editor.js';
import { useChatEditor, buildEditorContentJson } from '#components/chat/tiptap/use-chat-editor.js';
import type { ContextSuggestionItem, SlashCommandItem } from '#components/chat/tiptap/suggestion-types.js';
import type { ClipboardPasteEvent } from '#components/chat/chat-paste-handler.js';
import { createScreenshotContextHandler } from '#components/chat/screenshot-actions.utils.js';
import { buildPastedContent } from '#utils/at-reference.utils.js';
import { skillMetadataToSlashCommand, useSkillsCatalog } from '#hooks/use-skills-catalog.js';
import type { ChatContextReference } from '#components/chat/chat-context-insertion.js';

const dragOverlayCopy: Record<ChatTextareaDragKind, string> = {
  image: 'Add image(s)',
  viewer: 'Add screenshot',
  reference: 'Add reference',
};

type ChatTextareaDesktopProperties = {
  readonly className?: string;
  readonly enableAutoFocus?: boolean;
  readonly enableContextActions?: boolean;
  readonly enableKernelSelector?: boolean;
  readonly creationLocationControl?: React.ReactNode;
  readonly isSubmitDisabled?: boolean;

  // State
  readonly dragKind: ChatTextareaDragKind | undefined;
  readonly isSubmitting: boolean;
  readonly inputText: string;
  readonly images: string[];
  readonly selectedToolChoice: ToolSelection;
  readonly status: string;
  readonly selectedModel: ResolvedModel;
  readonly imageInputSupported: boolean;
  readonly formattedCancelKeyCombination: string;

  // Context data for Tiptap editor
  readonly treeService: FileTreeService | undefined;
  readonly chats: Chat[];
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
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancelClick: () => void;
  readonly handleDragOver: (event: React.DragEvent) => void;
  readonly handleDragLeave: () => void;
  readonly handleDrop: (event: React.DragEvent) => Promise<void>;
  readonly handlePaste: (event: ClipboardPasteEvent) => boolean;
  readonly handleFileSelect: () => void;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleAddImage: (image: string, options?: DraftImageOptions) => void;
  readonly onScreenshotAction: (item: ContextSuggestionItem) => void;
  readonly onEscapePressed?: () => void;
  readonly handleTextareaBlur: () => void;
  readonly removeImage: (index: number) => void;
  readonly setDraftToolChoice: (choice: ToolSelection) => void;
};

/** Map one ACP command to the existing slash menu without changing its native invocation. @public */
export const acpCommandToSlashCommand = (
  command: AcpSessionData['commands'][number],
  agentId: string,
): SlashCommandItem => {
  const invocation = command.name.startsWith('$') || command.name.startsWith('/') ? command.name : `/${command.name}`;
  return {
    id: invocation,
    label: invocation,
    title: command.name,
    description: command.description,
    ...(command.input === null || command.input === undefined ? {} : { fullDescription: command.input.hint }),
    group: 'Commands',
    source: agentId,
    commandText: `${invocation} `,
  };
};

/**
 * Desktop version of the chat textarea with Tiptap rich text editor.
 * Supports inline context chips via @-mentions, slash commands, and drag-drop from dockview tabs.
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
  className,
  enableAutoFocus = true,
  enableContextActions = true,
  enableKernelSelector = true,
  creationLocationControl,
  isSubmitDisabled = false,

  // State
  dragKind,
  isSubmitting,
  inputText,
  images,
  selectedToolChoice,
  status,
  selectedModel,
  imageInputSupported,
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
  handleTextareaBlur,
  removeImage,
  setDraftToolChoice,
}: ChatTextareaDesktopProperties): React.JSX.Element {
  const skillsCatalog = useSkillsCatalog();

  const commands = acpSessionData?.commands;
  const slashCommandItems = useMemo(
    () =>
      acpAgentId === undefined
        ? skillsCatalog.map((skillMetadata) => skillMetadataToSlashCommand(skillMetadata))
        : (commands ?? []).map((command) => acpCommandToSlashCommand(command, acpAgentId)),
    [acpAgentId, commands, skillsCatalog],
  );
  const knownSkillIds = useMemo(
    () => new Set(slashCommandItems.filter((item) => item.group !== 'Commands').map((item) => item.id)),
    [slashCommandItems],
  );

  const handleEditorUpdate = useCallback(
    (content: { text: string }) => {
      setDraftText(content.text);
    },
    [setDraftText],
  );

  const chatEditor = useChatEditor({
    onSubmit: handleSubmit,
    onEscape: onEscapePressed,
    onUpdate: handleEditorUpdate,
    treeService,
    chats,
    actionItems,
    slashCommandItems,
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
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    if (inputText === '' && !editor.isEmpty) {
      editor.commands.clearContent(false);
    } else if (inputText !== '' && editor.isEmpty) {
      const lazyTree: Map<string, FileEntry> = treeService?.getTreeSnapshot() ?? new Map<string, FileEntry>();
      const segments = buildPastedContent(inputText, { fileTree: lazyTree, chats, knownSkills: knownSkillIds });
      const json = buildEditorContentJson(segments);
      editor.commands.setContent(json ?? inputText, { emitUpdate: false });
    }
  }, [inputText, editor, treeService, chats, knownSkillIds]);

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
          return { id: path, label, chipType: isFolder ? 'folder' : 'file', path };
        }),
      );
    };
    addContextReferencesRef.current = insertContextReferences;
    return () => {
      addContextChipsRef.current = undefined;
      addContextReferencesRef.current = undefined;
    };
  }, [addContextChipsRef, addContextReferencesRef, insertContextReferences]);

  useEffect(() => {
    if (enableAutoFocus && editor) {
      editor.commands.focus('end');
    }
  }, [enableAutoFocus, editor]);

  // Lock Tiptap while `await onSubmit(...)` is in-flight inside the textarea
  // hook (homepage create-project + `await navigate`, vs fire-and-forget
  // `sendMessage` on the project route). Only long submits flip `true`,
  // so the tracer beam + shimmer indicate CDN-heavy navigation without
  // flashing during normal chat sends on `/projects/:id`.
  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!isSubmitting);
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

  const isDisabled = isSubmitDisabled || (inputText.trim().length === 0 && images.length === 0);

  return (
    // Outer wrapper is purely a positioning context for the beam overlay
    // and intentionally takes NO `className` passthrough — see
    // ChatTextareaBorderBeam's docs for why. All layout / styling
    // overrides live on the inner border container below.
    <div className='relative size-full'>
      <ChatTextareaBorderBeam isActive={isSubmitting} />

      <div
        ref={containerReference}
        className={cn(
          'group/chat-textarea @container',
          'relative flex size-full flex-col rounded-2xl border bg-background',
          'cursor-text overflow-hidden',
          'shadow-md',
          'has-[.tiptap:focus-visible]:ring-2 has-[.tiptap:focus-visible]:ring-ring',
          className,
        )}
        onBlur={handleTextareaBlur}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Images */}
        <ChatTextareaDesktopImages images={images} onRemoveImage={removeImage} />

        {/* Editor */}
        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-auto')} onClick={handleEditorAreaClick}>
          <ChatEditor
            editor={editor}
            className='pt-2'
            contextSuggestionState={chatEditor.contextSuggestionState}
            slashCommandState={chatEditor.slashCommandState}
            contextKeydownRef={chatEditor.contextKeydownRef}
            slashKeydownRef={chatEditor.slashKeydownRef}
            isLoading={isSubmitting}
          />
        </div>

        {/* Drag and drop feedback */}
        {dragKind ? (
          <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-primary/10 backdrop-blur-xs'>
            <p className='rounded-md border bg-background/50 px-2 font-medium text-primary'>
              {dragOverlayCopy[dragKind]}
            </p>
          </div>
        ) : null}

        {/* Bottom-left controls — wrapped in memo'd component to isolate Radix tooltip re-renders */}
        <ChatTextareaLeftControls
          selectedModel={selectedModel}
          enableKernelSelector={enableKernelSelector}
          selectedToolChoice={selectedToolChoice}
          focusEditor={focusEditor}
          setDraftToolChoice={setDraftToolChoice}
          fileInputReference={fileInputReference}
          handleFileChange={handleFileChange}
          creationLocationControl={creationLocationControl}
          acpSessionData={acpSessionData}
          status={status}
        />

        {/* Bottom-right controls */}
        <ChatTextareaRightControls
          enableContextActions={enableContextActions}
          handleAtButtonClick={handleAtButtonClick}
          handleFileSelect={handleFileSelect}
          imageInputSupported={imageInputSupported}
          status={status}
          isSubmitting={isSubmitting}
          isDisabled={isDisabled}
          formattedCancelKeyCombination={formattedCancelKeyCombination}
          handleSubmit={handleSubmit}
          handleCancelClick={handleCancelClick}
        />
      </div>
    </div>
  );
});

ChatTextareaDesktop.displayName = 'ChatTextareaDesktop';

/**
 * Memo'd left control bar containing model/kernel/tool selectors.
 * Isolated to prevent Radix TooltipTrigger asChild composeRefs loops.
 *
 * Exported so the chat-scoped kernel label can be tested in isolation.
 * External consumers should keep using {@link ChatTextareaDesktop}.
 *
 * @internal
 */
export const ChatTextareaLeftControls = memo(function ({
  selectedModel,
  enableKernelSelector,
  selectedToolChoice,
  focusEditor,
  setDraftToolChoice,
  fileInputReference,
  handleFileChange,
  creationLocationControl,
  acpSessionData,
  status,
}: {
  readonly selectedModel: ResolvedModel;
  readonly enableKernelSelector: boolean;
  readonly selectedToolChoice: ToolSelection;
  readonly focusEditor: () => void;
  readonly setDraftToolChoice: (choice: ToolSelection) => void;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly fileInputReference: React.RefObject<HTMLInputElement | null>;
  readonly handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly creationLocationControl?: React.ReactNode;
  readonly acpSessionData?: AcpSessionData;
  readonly status: string;
}): React.JSX.Element {
  // Chat-scoped resolver — falls back to cookie kernel when no chat-local
  // selection exists. Display label follows the chat's active kernel so
  // cookie changes elsewhere can no longer flip the label mid-conversation.
  const {
    kernel: { kernel: selectedKernel },
    execution: { execution },
    agentActivity,
    canSelectExecution,
  } = useChatComposer();
  const { isOffered: isAgentSelectorOffered, label: selectedAgentLabel } = useChatAgentSelection();
  const { selectedModel: selectedAgentModel } = useChatAgentModel();

  return (
    <div className='absolute bottom-2 left-2 flex flex-row items-center gap-1 text-muted-foreground'>
      <ChatTextareaModeControl />
      {/* S23: present at one branch, because it is where the second is made. */}
      <ChatBranchPicker />
      {canSelectExecution && isAgentSelectorOffered ? (
        <Tooltip>
          <ChatExecutionSelector
            data-chat-textarea-focustrap
            popoverProperties={{ align: 'start' }}
            onSelect={focusEditor}
            onClose={focusEditor}
          >
            {({ label, activity }) => (
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  aria-label={`Select agent: ${label}`}
                  aria-description={`Agent status: ${formatChatAgentActivity(activity)}`}
                  className='h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7'
                >
                  <span className='hidden max-w-24 truncate text-xs @[22rem]:block'>{label}</span>
                  <Bot className='size-4 @[22rem]:hidden' aria-hidden='true' />
                </Button>
              </TooltipTrigger>
            )}
          </ChatExecutionSelector>
          {/* The dot is gone, so readiness reads out of the tooltip (Q12.5). */}
          <TooltipContent>
            Select agent ({selectedAgentLabel}) · {formatChatAgentActivity(agentActivity)}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {/* Model selector */}
      {execution.kind === 'tau' ? (
        <Tooltip>
          <ChatModelSelector
            data-chat-textarea-focustrap
            popoverProperties={{ align: 'start' }}
            onSelect={focusEditor}
            onClose={focusEditor}
          >
            {(_properties) => (
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  className='h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2'
                >
                  <span className='hidden truncate text-xs @[22rem]:block'>{selectedModel.name}</span>
                  <SvgIcon id={selectedModel.family} className='size-4 shrink-0 grayscale' />
                </Button>
              </TooltipTrigger>
            )}
          </ChatModelSelector>
          <TooltipContent>
            <span className='flex items-center gap-1.5'>
              Select model ({selectedModel.name})
              <KeyShortcut variant='tooltip'>{formatKeyCombination(openModelSelectorKeyCombination)}</KeyShortcut>
            </span>
          </TooltipContent>
        </Tooltip>
      ) : (
        /* The ACP sibling: same slot, the agent's own model namespace (V5).
         * It renders nothing when the host advertised no models. */
        <Tooltip>
          <ChatAgentModelSelector
            data-chat-textarea-focustrap
            popoverProperties={{ align: 'start' }}
            onSelect={focusEditor}
            onClose={focusEditor}
          >
            {({ selectedModel }) => (
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  /* Collapsed to an icon below the breakpoint like every other
                   * trigger in the row, so the name has to come from here. */
                  aria-label={`Select model (${selectedModel.name})`}
                  className='h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2'
                >
                  <span className='hidden max-w-24 truncate text-xs @[22rem]:block'>{selectedModel.name}</span>
                  {/* ponytail: the agent's model namespace carries no family, so
                   * there is no brand sprite to collapse to — one generic glyph,
                   * not an agentId-to-icon table. */}
                  <Brain className='size-4 shrink-0' aria-hidden='true' />
                </Button>
              </TooltipTrigger>
            )}
          </ChatAgentModelSelector>
          <TooltipContent>Select model ({selectedAgentModel.name})</TooltipContent>
        </Tooltip>
      )}
      {execution.kind === 'acp' ? <ChatAgentConfigControls sessionData={acpSessionData} status={status} /> : null}
      {creationLocationControl}
      {/* Available and reserved credits (P5/P6). Tau execution only — an
       * external agent's turns are not funded by this balance. Kept after the
       * creation-location control so that control stays adjacent to the model
       * selector, as its own test pins. */}
      {execution.kind === 'tau' ? <CreditBalanceChip /> : null}
      {/* Kernel selector */}
      {enableKernelSelector ? (
        <Tooltip>
          <ChatKernelSelector
            data-chat-textarea-focustrap
            popoverProperties={{ align: 'start', className: 'w-[360px]' }}
            onSelect={focusEditor}
            onClose={focusEditor}
          >
            {({ selectedKernel }) => (
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  size='sm'
                  aria-label={`Select kernel (${selectedKernel.name})`}
                  className='h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2'
                >
                  <span className='hidden items-center gap-1.5 truncate text-xs @[22rem]:inline-flex'>
                    {selectedKernel.name}
                  </span>
                  <SvgIcon id={selectedKernel.id} className='size-4 shrink-0 grayscale' />
                </Button>
              </TooltipTrigger>
            )}
          </ChatKernelSelector>
          <TooltipContent>
            <span>Select kernel{` `}</span>
            <span>({selectedKernel.name})</span>
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
                variant='outline'
                size='sm'
                className={cn(
                  'h-7 rounded-full pr-2 text-muted-foreground hover:text-foreground @max-[22rem]:w-7',
                  selectedTools.length > 0 && 'px-2 @max-[22rem]:w-auto',
                  // oxlint-disable-next-line no-warning-comments -- keeping this file clean.
                  'hidden', // TODO: add back when MCP is added.
                )}
              >
                <span className='hidden text-xs @[22rem]:block'>
                  {selectedMode === 'auto' && 'Auto'}
                  {selectedMode === 'none' && 'No tools'}
                  {selectedMode === 'any' && 'Any tool'}
                  {selectedMode === 'custom' && 'Custom'}
                </span>
                {selectedMode === 'custom' && selectedTools.length > 0 ? (
                  <span className='flex items-center gap-1'>
                    {selectedTools.map((tool) => {
                      const Icon = toolMetadata[tool]?.icon;
                      if (!Icon) {
                        return null;
                      }

                      return <Icon key={tool} className='size-4' />;
                    })}
                  </span>
                ) : (
                  <Wrench className='size-4' />
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
        type='file'
        accept='image/*'
        className='hidden'
        onChange={handleFileChange}
      />
    </div>
  );
});

function ChatAgentConfigControls({
  sessionData,
  status,
}: {
  readonly sessionData?: AcpSessionData;
  readonly status: string;
}): React.JSX.Element | undefined {
  const {
    execution: { execution, setActiveExecution },
  } = useChatComposer();
  const confirmed = JSON.stringify(sessionData?.configOptions.map((option) => [option.id, option.currentValue]) ?? []);
  const [pending, setPending] = useState<{
    readonly confirmed: string;
    readonly values: Readonly<Record<string, string | boolean>>;
    readonly submitted: Readonly<Record<string, string | boolean>>;
  }>({ confirmed, values: {}, submitted: {} });
  const previousStatus = useRef(status);
  const previousSession = useRef<AcpSessionData | undefined>(undefined);
  useEffect(() => {
    const started = previousStatus.current === 'ready' && status !== 'ready';
    const settled = previousStatus.current !== 'ready' && status === 'ready';
    const sessionUpdated = previousSession.current !== sessionData;
    previousStatus.current = status;
    previousSession.current = sessionData;
    if (started) {
      setPending((current) => ({ ...current, submitted: current.values }));
      return;
    }
    if ((!settled && !sessionUpdated) || execution.kind !== 'acp') {
      return;
    }
    const retained = Object.fromEntries(
      Object.entries(pending.values).filter(
        ([id, value]) => !Object.hasOwn(pending.submitted, id) || pending.submitted[id] !== value,
      ),
    );
    setPending({ confirmed, values: retained, submitted: {} });
    if (sessionData?.agentId === execution.agentId) {
      const actual = Object.fromEntries(
        sessionData.configOptions.flatMap((option) =>
          option.category !== 'model' &&
          (typeof option.currentValue === 'string' || typeof option.currentValue === 'boolean')
            ? [[option.id, option.currentValue]]
            : [],
        ),
      );
      const { config: _config, ...selection } = execution;
      const config = { ...actual, ...retained };
      setActiveExecution({ ...selection, ...(Object.keys(config).length === 0 ? {} : { config }) });
    }
  }, [confirmed, execution, pending, sessionData, setActiveExecution, status]);
  const pendingValues = pending.confirmed === confirmed ? pending.values : {};
  if (execution.kind !== 'acp') {
    return undefined;
  }
  const options = sessionData?.configOptions.filter((option) => option.category !== 'model') ?? [];
  if (options.length === 0) {
    return undefined;
  }
  const select = (id: string, value: string | boolean): void => {
    setPending((current) => ({
      ...current,
      confirmed,
      values: { ...(current.confirmed === confirmed ? current.values : {}), [id]: value },
    }));
    setActiveExecution({ ...execution, config: { ...execution.config, [id]: value } });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='sm'
          aria-label='Agent settings'
          className='h-7 w-7 rounded-full text-muted-foreground hover:text-foreground'
        >
          <SlidersHorizontal className='size-4' aria-hidden='true' />
        </Button>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-72 space-y-3 p-3'>
        <h3 className='text-sm font-medium'>Agent settings</h3>
        {options.map((option) => {
          const current = pendingValues[option.id] ?? option.currentValue;
          return option.type === 'select' ? (
            <label key={option.id} className='flex flex-col gap-1 text-xs'>
              <span>{option.name}</span>
              <select
                aria-label={option.name}
                className='h-8 rounded-md border bg-background px-2'
                value={String(current)}
                onChange={(event) => {
                  select(option.id, event.currentTarget.value);
                }}
              >
                {option.options.map((entry) =>
                  'options' in entry ? (
                    <optgroup key={entry.group} label={entry.name}>
                      {entry.options.map((value) => (
                        <option key={value.value} value={value.value}>
                          {value.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <option key={entry.value} value={entry.value}>
                      {entry.name}
                    </option>
                  ),
                )}
              </select>
            </label>
          ) : (
            <label key={option.id} className='flex items-center justify-between gap-3 text-xs'>
              <span>{option.name}</span>
              <input
                type='checkbox'
                aria-label={option.name}
                checked={Boolean(current)}
                onChange={(event) => {
                  select(option.id, event.currentTarget.checked);
                }}
              />
            </label>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Memo'd right control bar containing @-mention, upload, and submit buttons.
 * Isolated to prevent Radix TooltipTrigger asChild composeRefs loops.
 */
const ChatTextareaRightControls = memo(function ({
  enableContextActions,
  handleAtButtonClick,
  handleFileSelect,
  imageInputSupported,
  status,
  isSubmitting,
  isDisabled,
  formattedCancelKeyCombination,
  handleSubmit,
  handleCancelClick,
}: {
  readonly enableContextActions: boolean;
  readonly handleAtButtonClick: () => void;
  readonly handleFileSelect: () => void;
  readonly imageInputSupported: boolean;
  readonly status: string;
  readonly isSubmitting: boolean;
  readonly isDisabled: boolean;
  readonly formattedCancelKeyCombination: string;
  readonly handleSubmit: () => Promise<void>;
  readonly handleCancelClick: () => void;
}): React.JSX.Element {
  return (
    <div className='absolute right-2 bottom-2 flex flex-row items-center gap-1'>
      <ChatContextIndicator />

      {/* @ context button — hidden when no project/context to attach (e.g. homepage) */}
      {enableContextActions ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-chat-textarea-focustrap={focusTrapAttribute}
              variant='outline'
              size='icon'
              aria-label='Add context'
              className='size-6 rounded-full text-muted-foreground hover:text-foreground'
              onClick={handleAtButtonClick}
            >
              <AtSign className='size-3.5' />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add context</TooltipContent>
        </Tooltip>
      ) : null}

      {/* Upload button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='outline'
            size='icon'
            aria-disabled={!imageInputSupported}
            className={cn(
              'size-6 rounded-full text-muted-foreground hover:text-foreground',
              !imageInputSupported && 'opacity-50',
            )}
            title='Add image'
            onClick={handleFileSelect}
          >
            <Paperclip className='size-3.5' />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{imageInputSupported ? 'Upload an image' : 'Selected model cannot read images'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Submit button */}
      <ChatTextareaSubmitButton
        status={status}
        isSubmitting={isSubmitting}
        isDisabled={isDisabled}
        formattedCancelKeyCombination={formattedCancelKeyCombination}
        onSubmit={handleSubmit}
        onCancel={handleCancelClick}
      />
    </div>
  );
});

function ChatTextareaModeControl(): React.JSX.Element | undefined {
  const planModeEnabled = useFeature('planMode');
  const { draftActorRef } = useChatComposer();
  const mode = useSelector(draftActorRef, (state) => state.context.draftMode);
  const { setDraftMode } = useDraftActions();

  if (!planModeEnabled) {
    return undefined;
  }

  return (
    <Tooltip>
      <ChatAgentSelector
        data-chat-textarea-focustrap
        mode={mode}
        onModeChange={setDraftMode}
        popoverProperties={{ align: 'start' }}
      >
        {({ currentConfig }) => (
          <TooltipTrigger asChild>
            <Button
              variant='outline'
              size='sm'
              aria-label={`Select mode (${currentConfig.label})`}
              className={cn(
                'h-7 rounded-full text-muted-foreground hover:text-foreground @max-[22rem]:w-7 @xs:max-w-fit @[22rem]:pr-2',
                currentConfig.activeClass,
              )}
            >
              <currentConfig.icon className='size-4' />
              <span className='hidden text-xs @[22rem]:block'>{currentConfig.label}</span>
            </Button>
          </TooltipTrigger>
        )}
      </ChatAgentSelector>
      <TooltipContent>
        <span className='flex items-center gap-1.5'>
          Switch agent mode
          <KeyShortcut variant='tooltip'>{formatKeyCombination(toggleModeKeyCombination)}</KeyShortcut>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
