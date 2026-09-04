import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { useChatTextareaLogic } from '#components/chat/chat-textarea-types.js';
import { ChatTextareaDesktop } from '#components/chat/chat-textarea-desktop.js';
import { ChatTextareaMobile } from '#components/chat/chat-textarea-mobile.js';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { ChatTextareaSkeleton } from '#components/chat/chat-textarea-skeleton.js';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChats } from '#hooks/use-chats.js';
import { useDraftActions } from '#hooks/use-chat.js';
import { toast } from '#components/ui/sonner.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import { takeScreenshotGroup } from '#components/chat/tiptap/context-suggestion.utils.js';
import { useChatContextInsertion } from '#components/chat/chat-context-insertion.js';
import type { ChatContextReference } from '#components/chat/chat-context-insertion.js';
import { ChatApprovalBanner } from '#components/chat/chat-approval-banner.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { captureCadImages, captureFilesToDataUrls } from '#services/headless-capture.js';

/**
 * Main chat textarea component that conditionally renders either the
 * desktop or mobile version based on the `useIsMobile()` hook.
 *
 * All logic is shared via the `useChatTextareaLogic` hook.
 * Project context data (treeService, chats) is fetched here and passed
 * as props to keep the memo'd desktop component free of internal subscription hooks,
 * preventing re-render cascades through Radix UI's composeRefs.
 */
export const ChatTextarea = memo(function ({
  ref,
  onSubmit,
  enableAutoFocus = true,
  onEscapePressed,
  onBlur,
  className,
  enableContextActions = true,
  enableKernelSelector = true,
  creationLocationControls,
  isSubmitDisabled = false,
  mode = 'main',
}: ChatTextareaProperties): React.JSX.Element {
  const isMobile = useIsMobile();

  // Mutable ref populated by ChatTextareaDesktop (or, on mobile, by an effect
  // below) so that drops anywhere on the outer container can route file/editor
  // chips into the platform-appropriate sink (Tiptap node insert vs `@<path>`
  // text append).
  const addContextChipsRef = useRef<((paths: string[]) => void) | undefined>(undefined);
  const addContextReferencesRef = useRef<((references: ChatContextReference[]) => void) | undefined>(undefined);
  const { registerContextReferenceInserter } = useChatContextInsertion();

  const handleAddContextChips = useCallback((paths: string[]): void => {
    addContextChipsRef.current?.(paths);
  }, []);

  useEffect(() => {
    registerContextReferenceInserter((references) => {
      addContextReferencesRef.current?.(references);
    });
    return () => {
      registerContextReferenceInserter(undefined);
    };
  }, [registerContextReferenceInserter]);

  // Forward declaration — the actual screenshot-on-drop callback is defined
  // below (it depends on `projectContextRef` and the
  // active-actor set wired into the existing single-view branch).
  const handleViewerScreenshotDropRef = useRef<(entryPath: string) => void>(() => undefined);
  const handleViewerScreenshotDrop = useCallback((entryPath: string): void => {
    handleViewerScreenshotDropRef.current(entryPath);
  }, []);

  const logic = useChatTextareaLogic({
    ref,
    onSubmit,
    enableAutoFocus,
    onEscapePressed,
    onBlur,
    mode,
    isSubmitDisabled,
    onViewerScreenshotDrop: handleViewerScreenshotDrop,
    onAddContextChips: handleAddContextChips,
  });

  const projectContext = useProject({ enableNoContext: true });
  const { treeService } = useFileManager();
  const imageService = useHeadlessImageService();
  const { chats } = useChats(projectContext?.projectId ?? '');
  const { session } = useChatComposer();
  const { setDraftText: setMainDraftText, setEditDraftText } = useDraftActions();

  const setDraftText = useCallback(
    (text: string) => {
      if (mode === 'main') {
        setMainDraftText(text);
      } else {
        setEditDraftText(text);
      }
    },
    [mode, setMainDraftText, setEditDraftText],
  );

  // Mutable ref populated by ChatTextareaDesktop so the imperative handle
  // can focus the Tiptap editor instead of the (non-existent) <textarea>
  const focusEditorRef = useRef<(() => void) | undefined>(undefined);
  const closeOptionsRef = useRef<(() => void) | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        if (focusEditorRef.current) {
          focusEditorRef.current();
        } else {
          logic.focusInput();
        }
      },
      closeOptions: () => {
        closeOptionsRef.current?.();
      },
    }),
    [logic.focusInput],
  );

  const geometryUnits = projectContext?.geometryUnits;
  const mainEntryPath = projectContext?.mainEntryPath;
  const mainGeometryFormat = useSelector(
    mainEntryPath ? geometryUnits?.get(mainEntryPath) : undefined,
    (state) => state?.context.geometry?.format,
  );
  const screenshotActionItems = useMemo((): ContextSuggestionItem[] => {
    if (!geometryUnits || !logic.imageInputSupported) {
      return [];
    }

    const items: ContextSuggestionItem[] = [
      {
        id: 'screenshot-current-view',
        label: 'Current view',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'single' },
      },
    ];
    if (mainGeometryFormat === 'gltf') {
      items.push({
        id: 'screenshot-orthographic',
        label: 'Orthographic views x 6',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'orthographic' },
      });
    }

    for (const [entryPath] of geometryUnits) {
      if (entryPath === mainEntryPath) {
        continue;
      }
      const fileName = entryPath.split('/').pop() ?? 'Untitled';
      items.push({
        id: `screenshot-view:${entryPath}`,
        label: fileName,
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'view', entryPath },
      });
    }

    return items;
  }, [geometryUnits, mainEntryPath, mainGeometryFormat, logic.imageInputSupported]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Refs for stable callback — avoids recreating handleScreenshotAction on every render
  const projectContextRef = useRef(projectContext);
  const handleAddImageRef = useRef(logic.handleAddImage);
  const imageInputSupportedRef = useRef(logic.imageInputSupported);
  const rejectUnsupportedImageInputRef = useRef(logic.rejectUnsupportedImageInput);
  const handleAddTextRef = useRef(logic.handleAddText);
  const inputTextRefForChips = useRef(logic.inputText);
  useEffect(() => {
    projectContextRef.current = projectContext;
    handleAddImageRef.current = logic.handleAddImage;
    imageInputSupportedRef.current = logic.imageInputSupported;
    rejectUnsupportedImageInputRef.current = logic.rejectUnsupportedImageInput;
    handleAddTextRef.current = logic.handleAddText;
    inputTextRefForChips.current = logic.inputText;
  }, [
    logic.handleAddImage,
    logic.handleAddText,
    logic.imageInputSupported,
    logic.inputText,
    logic.rejectUnsupportedImageInput,
    projectContext,
  ]);

  /**
   * Resolve the per-view graphics actor whose pane currently shows `entryPath`.
   * Falls back to the main entry's pane when no specific entry is requested,
   * and finally to the first registered view as a last resort.
   */
  const resolveGraphicsRefForEntry = useCallback(
    (entryPath: string | undefined): ActorRefFrom<typeof graphicsMachine> | undefined => {
      const currentProjectContext = projectContextRef.current;
      if (!currentProjectContext) {
        return undefined;
      }
      const { viewGraphics, editorRef, mainEntryPath: mainEntry } = currentProjectContext;
      const { viewSettings } = editorRef.getSnapshot().context;
      const target = entryPath ?? mainEntry;

      for (const [viewId, gRef] of viewGraphics) {
        if (viewSettings[viewId]?.entryPath === target) {
          return gRef;
        }
      }

      if (entryPath === undefined) {
        return viewGraphics.values().next().value;
      }
      return undefined;
    },
    [],
  );

  /** Resolve the CAD actor matching a viewer entry path. */
  const resolveCadRefForEntry = useCallback(
    (entryPath: string | undefined): ActorRefFrom<typeof cadMachine> | undefined => {
      const currentProjectContext = projectContextRef.current;
      if (!currentProjectContext) {
        return undefined;
      }
      const { geometryUnits, mainEntryPath: mainEntry } = currentProjectContext;
      const target = entryPath ?? mainEntry;
      if (target && geometryUnits.has(target)) {
        return geometryUnits.get(target);
      }
      if (entryPath === undefined) {
        return geometryUnits.values().next().value;
      }
      return undefined;
    },
    [],
  );

  const captureEntry = useCallback(
    async (entryPath: string | undefined, captureMode: 'current' | 'orthographic', successToast = false) => {
      const cadRef = resolveCadRefForEntry(entryPath);
      if (!cadRef) {
        toast.error('No CAD view available for image capture');
        return;
      }
      try {
        const files = await captureCadImages({
          cadRef,
          graphicsRef: resolveGraphicsRefForEntry(entryPath),
          imageService,
          recipe: { purpose: 'chat', mode: captureMode },
        });
        if (!mounted.current) {
          return;
        }
        for (const dataUrl of captureFilesToDataUrls(files)) {
          handleAddImageRef.current(dataUrl, { preserveOriginal: true });
        }
        if (successToast) {
          toast.success('Added screenshot to chat');
        }
      } catch (error) {
        if (mounted.current) {
          toast.error(error instanceof Error ? error.message : 'Image capture failed');
        }
      }
    },
    [imageService, resolveCadRefForEntry, resolveGraphicsRefForEntry],
  );

  // Viewer-drop screenshots use the same settled-geometry adapter as menu actions.
  useEffect(() => {
    handleViewerScreenshotDropRef.current = (entryPath: string): void => {
      if (!imageInputSupportedRef.current) {
        rejectUnsupportedImageInputRef.current();
        return;
      }

      void captureEntry(entryPath, 'current', true);
    };
  }, [captureEntry]);

  const handleScreenshotAction = useCallback(
    (item: ContextSuggestionItem) => {
      if (!imageInputSupportedRef.current) {
        rejectUnsupportedImageInputRef.current();
        return;
      }

      const { screenshotAction } = item;
      if (!screenshotAction) {
        return;
      }

      const targetEntry = screenshotAction.type === 'view' ? screenshotAction.entryPath : undefined;
      void captureEntry(targetEntry, screenshotAction.type === 'orthographic' ? 'orthographic' : 'current');
    },
    [captureEntry],
  );

  // Mobile drag-drop chip insertion: append `@<path>` segments and lean on the
  // existing draft-text rehydration to render them as chips.
  useEffect(() => {
    if (!isMobile) {
      return;
    }
    addContextChipsRef.current = (paths: string[]): void => {
      if (paths.length === 0) {
        return;
      }
      const segment = paths.map((path) => `@${path}`).join(' ');
      const needsLeadingSpace = inputTextRefForChips.current.length > 0 && !inputTextRefForChips.current.endsWith(' ');
      handleAddTextRef.current(`${needsLeadingSpace ? ' ' : ''}${segment} `);
    };
    addContextReferencesRef.current = (references: ChatContextReference[]): void => {
      if (references.length === 0) {
        return;
      }
      const segment = references
        .map((reference) => reference.referenceToken ?? `@${reference.path ?? reference.label}`)
        .join(' ');
      const needsLeadingSpace = inputTextRefForChips.current.length > 0 && !inputTextRefForChips.current.endsWith(' ');
      handleAddTextRef.current(`${needsLeadingSpace ? ' ' : ''}${segment} `);
    };
    return () => {
      addContextChipsRef.current = undefined;
      addContextReferencesRef.current = undefined;
    };
  }, [isMobile]);

  const skeleton = <ChatTextareaSkeleton className={className} />;
  /* A paused run is answered from the composer, not the transcript. Only the
   * main composer, and only under a real session: the new-project composer runs
   * on `ChatComposerProvider`, which has no chat to be paused. */
  const approvalBanner = mode === 'main' && projectContext && session ? <ChatApprovalBanner /> : undefined;

  if (isMobile) {
    return (
      <ClientOnly fallback={skeleton}>
        {approvalBanner}
        <ChatTextareaMobile
          className={className}
          enableAutoFocus={enableAutoFocus}
          enableContextActions={enableContextActions}
          enableKernelSelector={enableKernelSelector}
          creationLocationControl={creationLocationControls?.field}
          isSubmitDisabled={isSubmitDisabled}
          // State
          dragKind={logic.dragKind}
          showContextMenu={logic.showContextMenu}
          contextSearchQuery={logic.contextSearchQuery}
          selectedMenuIndex={logic.selectedMenuIndex}
          isSubmitting={logic.isSubmitting}
          inputText={logic.inputText}
          images={logic.images}
          selectedToolChoice={logic.selectedToolChoice}
          status={logic.status}
          selectedModel={logic.selectedModel}
          imageInputSupported={logic.imageInputSupported}
          formattedCancelKeyCombination={logic.formattedCancelKeyCombination}
          // Refs
          textareaReference={logic.textareaReference}
          fileInputReference={logic.fileInputReference}
          containerReference={logic.containerReference}
          closeOptionsRef={closeOptionsRef}
          // Handlers
          handleSubmit={logic.handleSubmit}
          handleCancelClick={logic.handleCancelClick}
          handleTextareaKeyDown={logic.handleTextareaKeyDown}
          handleDragOver={logic.handleDragOver}
          handleDragLeave={logic.handleDragLeave}
          handleDrop={logic.handleDrop}
          handlePaste={logic.handlePaste}
          handleFileSelect={logic.handleFileSelect}
          handleFileChange={logic.handleFileChange}
          handleTextChange={logic.handleTextChange}
          handleContextMenuSelect={logic.handleContextMenuSelect}
          handleContextImageAdd={logic.handleContextImageAdd}
          handleAddText={logic.handleAddText}
          handleAddImage={logic.handleAddImage}
          handleTextareaBlur={logic.handleTextareaBlur}
          handlePointerDown={logic.handlePointerDown}
          focusInput={logic.focusInput}
          removeImage={logic.removeImage}
          setShowContextMenu={logic.setShowContextMenu}
          setAtSymbolPosition={logic.setAtSymbolPosition}
          setContextSearchQuery={logic.setContextSearchQuery}
          setSelectedMenuIndex={logic.setSelectedMenuIndex}
          setDraftToolChoice={logic.setDraftToolChoice}
        />
      </ClientOnly>
    );
  }

  return (
    <ClientOnly fallback={skeleton}>
      {approvalBanner}
      <ChatTextareaDesktop
        className={className}
        enableAutoFocus={enableAutoFocus}
        enableContextActions={enableContextActions}
        enableKernelSelector={enableKernelSelector}
        creationLocationControl={creationLocationControls?.toolbar}
        isSubmitDisabled={isSubmitDisabled}
        // State
        dragKind={logic.dragKind}
        isSubmitting={logic.isSubmitting}
        inputText={logic.inputText}
        images={logic.images}
        selectedToolChoice={logic.selectedToolChoice}
        status={logic.status}
        selectedModel={logic.selectedModel}
        imageInputSupported={logic.imageInputSupported}
        formattedCancelKeyCombination={logic.formattedCancelKeyCombination}
        // Context data for Tiptap
        treeService={treeService}
        chats={chats}
        actionItems={screenshotActionItems}
        setDraftText={setDraftText}
        // Refs
        fileInputReference={logic.fileInputReference}
        containerReference={logic.containerReference}
        focusEditorRef={focusEditorRef}
        addContextChipsRef={addContextChipsRef}
        addContextReferencesRef={addContextReferencesRef}
        // Handlers
        handleSubmit={logic.handleSubmit}
        handleCancelClick={logic.handleCancelClick}
        handleDragOver={logic.handleDragOver}
        handleDragLeave={logic.handleDragLeave}
        handleDrop={logic.handleDrop}
        handlePaste={logic.handlePaste}
        handleFileSelect={logic.handleFileSelect}
        handleFileChange={logic.handleFileChange}
        handleAddImage={logic.handleAddImage}
        onScreenshotAction={handleScreenshotAction}
        onEscapePressed={onEscapePressed}
        handleTextareaBlur={logic.handleTextareaBlur}
        removeImage={logic.removeImage}
        setDraftToolChoice={logic.setDraftToolChoice}
      />
    </ClientOnly>
  );
});
