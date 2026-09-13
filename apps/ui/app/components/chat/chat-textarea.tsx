import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { useChatTextareaLogic } from '#components/chat/chat-textarea-types.js';
import { ChatTextareaDesktop } from '#components/chat/chat-textarea-desktop.js';
import { ChatTextareaMobile } from '#components/chat/chat-textarea-mobile.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { ChatTextareaSkeleton } from '#components/chat/chat-textarea-skeleton.js';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChats } from '#hooks/use-chats.js';
import { useDraftActions } from '#hooks/use-chat.js';
import { useImageQuality } from '#hooks/use-image-quality.js';
import { toast } from '#components/ui/sonner.js';
import { orthographicViews, screenshotRequestMachine } from '#machines/screenshot-request.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import { takeScreenshotGroup } from '#components/chat/tiptap/context-suggestion.utils.js';
import { captureViewScreenshot } from '#components/chat/capture-view-screenshot.utils.js';
import { buildScreenshotOverlayForPath, resolveScreenshotOverlay } from '#machines/resolve-screenshot-overlay.js';

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
  mode = 'main',
}: ChatTextareaProperties): React.JSX.Element {
  const isMobile = useIsMobile();

  // Mutable ref populated by ChatTextareaDesktop (or, on mobile, by an effect
  // below) so that drops anywhere on the outer container can route file/editor
  // chips into the platform-appropriate sink (Tiptap node insert vs `@<path>`
  // text append).
  const addContextChipsRef = useRef<((paths: string[]) => void) | undefined>(undefined);

  const handleAddContextChips = useCallback((paths: string[]): void => {
    addContextChipsRef.current?.(paths);
  }, []);

  // Forward declaration — the actual screenshot-on-drop callback is defined
  // below (it depends on `projectContextRef`, `screenshotQualityRef` and the
  // active-actor set wired into the existing single-view branch).
  const handleViewerScreenshotDropRef = useRef<(entryFile: string) => void>(() => undefined);
  const handleViewerScreenshotDrop = useCallback((entryFile: string): void => {
    handleViewerScreenshotDropRef.current(entryFile);
  }, []);

  const logic = useChatTextareaLogic({
    ref,
    onSubmit,
    enableAutoFocus,
    onEscapePressed,
    onBlur,
    mode,
    onViewerScreenshotDrop: handleViewerScreenshotDrop,
    onAddContextChips: handleAddContextChips,
  });

  const projectContext = useProject({ enableNoContext: true });
  const { treeService } = useFileManager();
  const { chats } = useChats(projectContext?.projectId ?? '');
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
    }),
    [logic.focusInput],
  );

  const geometryUnits = projectContext?.geometryUnits;
  const mainEntryFile = projectContext?.mainEntryFile;
  const screenshotActionItems = useMemo((): ContextSuggestionItem[] => {
    if (!geometryUnits) {
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
      {
        id: 'screenshot-orthographic',
        label: 'Orthographic views x 6',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'composite' },
      },
    ];

    for (const [entryFile] of geometryUnits) {
      if (entryFile === mainEntryFile) {
        continue;
      }
      const fileName = entryFile.split('/').pop() ?? 'Untitled';
      items.push({
        id: `screenshot-view:${entryFile}`,
        label: fileName,
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'view', entryFile },
      });
    }

    return items;
  }, [geometryUnits, mainEntryFile]);

  const { quality: screenshotQuality } = useImageQuality();

  // Track active screenshot actors for lifecycle cleanup
  const activeScreenshotActorsRef = useRef(new Set<{ stop: () => void }>());
  useEffect(() => {
    const actors = activeScreenshotActorsRef;
    return () => {
      for (const actor of actors.current) {
        actor.stop();
      }
      actors.current.clear();
    };
  }, []);

  // Refs for stable callback — avoids recreating handleScreenshotAction on every render
  const projectContextRef = useRef(projectContext);
  projectContextRef.current = projectContext;
  const handleAddImageRef = useRef(logic.handleAddImage);
  handleAddImageRef.current = logic.handleAddImage;
  const screenshotQualityRef = useRef(screenshotQuality);
  screenshotQualityRef.current = screenshotQuality;

  /**
   * Resolve the per-view graphics actor whose pane currently shows `entryFile`.
   * Falls back to the main entry's pane when no specific entry is requested,
   * and finally to the first registered view as a last resort.
   */
  const resolveGraphicsRefForEntry = useCallback(
    (entryFile: string | undefined): ActorRefFrom<typeof graphicsMachine> | undefined => {
      const currentProjectContext = projectContextRef.current;
      if (!currentProjectContext) {
        return undefined;
      }
      const { viewGraphics, editorRef, mainEntryFile: mainEntry } = currentProjectContext;
      const { viewSettings } = editorRef.getSnapshot().context;
      const target = entryFile ?? mainEntry;

      for (const [viewId, gRef] of viewGraphics) {
        if (viewSettings[viewId]?.entryFile === target) {
          return gRef;
        }
      }

      if (entryFile === undefined) {
        return viewGraphics.values().next().value;
      }
      return undefined;
    },
    [],
  );

  /**
   * Resolve the per-view CAD actor whose geometry unit corresponds to
   * `entryFile`. Used to thread the screenshot overlay's file path + icon
   * key through to the screenshot pipeline (see
   * `docs/research/screenshot-overlay-watermark-architecture.md` Finding 3).
   *
   * Falls back to the main entry when omitted, mirroring the graphics-ref
   * resolution above so chip + capture stay in lock-step.
   */
  const resolveCadRefForEntry = useCallback(
    (entryFile: string | undefined): ActorRefFrom<typeof cadMachine> | undefined => {
      const currentProjectContext = projectContextRef.current;
      if (!currentProjectContext) {
        return undefined;
      }
      const { geometryUnits, mainEntryFile: mainEntry } = currentProjectContext;
      const target = entryFile ?? mainEntry;
      if (target && geometryUnits.has(target)) {
        return geometryUnits.get(target);
      }
      if (entryFile === undefined) {
        return geometryUnits.values().next().value;
      }
      return undefined;
    },
    [],
  );

  // Wire viewer-drop screenshots into the same active-actors set used by the
  // existing single-view + composite branches so unmount cleanup stays uniform.
  useEffect(() => {
    handleViewerScreenshotDropRef.current = (entryFile: string): void => {
      const graphicsRef = resolveGraphicsRefForEntry(entryFile);
      if (!graphicsRef) {
        toast.error('No graphics view available for screenshot');
        return;
      }
      const overlay =
        resolveScreenshotOverlay(resolveCadRefForEntry(entryFile)) ?? buildScreenshotOverlayForPath(entryFile);
      captureViewScreenshot({
        graphicsRef,
        quality: screenshotQualityRef.current,
        activeActors: activeScreenshotActorsRef.current,
        overlay,
        onImage: (dataUrl) => {
          handleAddImageRef.current(dataUrl);
          toast.success('Added screenshot to chat');
        },
        onError: (message) => {
          toast.error(message);
        },
      });
    };
  }, [resolveGraphicsRefForEntry, resolveCadRefForEntry]);

  const handleScreenshotAction = useCallback(
    (item: ContextSuggestionItem) => {
      const { screenshotAction } = item;
      if (!screenshotAction) {
        return;
      }

      const targetEntry = screenshotAction.type === 'view' ? screenshotAction.entryFile : undefined;
      const graphicsRef = resolveGraphicsRefForEntry(targetEntry);
      if (!graphicsRef) {
        toast.error('No graphics view available for screenshot');
        return;
      }

      const quality = screenshotQualityRef.current;
      const overlay =
        resolveScreenshotOverlay(resolveCadRefForEntry(targetEntry)) ??
        (targetEntry ? buildScreenshotOverlayForPath(targetEntry) : undefined);

      if (screenshotAction.type === 'composite') {
        const actor = createActor(screenshotRequestMachine, {
          input: { graphicsRef },
        });
        const actors = activeScreenshotActorsRef.current;
        actors.add(actor);
        actor.start();

        const cleanup = (): void => {
          actor.stop();
          actors.delete(actor);
        };

        actor.send({
          type: 'requestCompositeScreenshot',
          options: {
            output: {
              format: 'image/webp',
              quality,
              isPreview: true,
            },
            cameraAngles: orthographicViews.slice(0, 6),
            aspectRatio: 1,
            maxResolution: 800,
            zoomLevel: 1.2,
            overlay,
            composite: {
              enabled: true,
              preferredRatio: { columns: 3, rows: 2 },
              showLabels: true,
              padding: 12,
              labelHeight: 24,
              backgroundColor: 'transparent',
              dividerColor: 'var(--border)',
              dividerWidth: 1,
            },
          },
          onSuccess(dataUrls) {
            cleanup();
            const dataUrl = dataUrls[0];
            if (dataUrl) {
              handleAddImageRef.current(dataUrl);
            } else {
              toast.error('Failed to capture composite screenshot');
            }
          },
          onError(error) {
            cleanup();
            toast.error(`Screenshot failed: ${error}`);
          },
        });
        return;
      }

      // Single-view (`'single'` or `'view'`) — delegated to the shared helper.
      captureViewScreenshot({
        graphicsRef,
        quality,
        activeActors: activeScreenshotActorsRef.current,
        overlay,
        onImage: (dataUrl) => {
          handleAddImageRef.current(dataUrl);
        },
        onError: (message) => {
          toast.error(message);
        },
      });
    },
    [resolveGraphicsRefForEntry, resolveCadRefForEntry],
  );

  // Mobile drag-drop chip insertion: append `@<path>` segments and lean on the
  // existing draft-text rehydration to render them as chips.
  const handleAddTextRef = useRef(logic.handleAddText);
  handleAddTextRef.current = logic.handleAddText;
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
    return () => {
      addContextChipsRef.current = undefined;
    };
  }, [isMobile]);

  // Track the current input text for the mobile chip-insertion leading-space
  // heuristic without re-running the registration effect on every keystroke.
  const inputTextRefForChips = useRef(logic.inputText);
  inputTextRefForChips.current = logic.inputText;

  const skeleton = <ChatTextareaSkeleton className={className} />;

  if (isMobile) {
    return (
      <ClientOnly fallback={skeleton}>
        <ChatTextareaMobile
          className={className}
          enableAutoFocus={enableAutoFocus}
          enableContextActions={enableContextActions}
          enableKernelSelector={enableKernelSelector}
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
          formattedCancelKeyCombination={logic.formattedCancelKeyCombination}
          // Refs
          textareaReference={logic.textareaReference}
          fileInputReference={logic.fileInputReference}
          containerReference={logic.containerReference}
          // Handlers
          handleSubmit={logic.handleSubmit}
          handleCancelClick={logic.handleCancelClick}
          handleTextareaKeyDown={logic.handleTextareaKeyDown}
          handleDragOver={logic.handleDragOver}
          handleDragLeave={logic.handleDragLeave}
          handleDrop={logic.handleDrop}
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
      <ChatTextareaDesktop
        className={className}
        enableAutoFocus={enableAutoFocus}
        enableContextActions={enableContextActions}
        enableKernelSelector={enableKernelSelector}
        // State
        dragKind={logic.dragKind}
        isSubmitting={logic.isSubmitting}
        inputText={logic.inputText}
        images={logic.images}
        selectedToolChoice={logic.selectedToolChoice}
        status={logic.status}
        selectedModel={logic.selectedModel}
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
        // Handlers
        handleSubmit={logic.handleSubmit}
        handleCancelClick={logic.handleCancelClick}
        handleDragOver={logic.handleDragOver}
        handleDragLeave={logic.handleDragLeave}
        handleDrop={logic.handleDrop}
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
