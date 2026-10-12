import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { useChatTextareaLogic } from '#components/chat/chat-textarea-types.js';
import { ChatTextareaDesktop } from '#components/chat/chat-textarea-desktop.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';
import { ChatTextareaSkeleton } from '#components/chat/chat-textarea-skeleton.js';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useDraftActions } from '#hooks/use-chat.js';
import { toast } from '#components/ui/sonner.js';
import { randomUuid } from '@taucad/utils/id';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import { takeScreenshotGroup } from '#components/chat/tiptap/context-suggestion.utils.js';
import { useChatContextInsertion } from '#components/chat/chat-context-insertion.js';
import type { ChatContextReference } from '#components/chat/chat-context-insertion.js';
import { ChatApprovalBanner } from '#components/chat/chat-approval-banner.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import { latestAcpSessionData } from '#services/agent-host-event-projection.js';
import { findEntryGraphics, listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';

/**
 * Main chat textarea: one composer on every device (C11) — a phone gets the
 * same editor, menus, meter and bar, and its pickers open as drawers.
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
  creationLocationControl,
  isSubmitDisabled = false,
  mode = 'main',
}: ChatTextareaProperties): React.JSX.Element {
  // Mutable refs populated by ChatTextareaDesktop so that drops anywhere on the
  // outer container can route file/editor chips into Tiptap nodes.
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
  const { chats } = useChatRecords(projectContext?.projectId ?? '');
  const {
    session,
    execution: { execution },
  } = useChatComposer();
  const acpAgentId = execution.kind === 'acp' ? execution.agentId : undefined;
  const acpSessionData = useChatSessionSnapshot(session?.activeChatId ?? '', (active) =>
    acpAgentId === undefined ? undefined : latestAcpSessionData(active?.messages ?? [], acpAgentId),
  );
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
  const mainEntryPath = projectContext?.mainEntryPath;
  const viewRecords = projectContext?.viewRecords;
  const mainGeometryFormat = useSelector(mainEntryPath ? geometryUnits?.get(mainEntryPath) : undefined, (state) =>
    state?.context.rendering?.success ? state.context.rendering.artifact.mimeType : undefined,
  );
  const screenshotActionItems = useMemo((): ContextSuggestionItem[] => {
    if (!geometryUnits || !viewRecords || !logic.imageInputSupported) {
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
    if (mainGeometryFormat === 'model/gltf-binary') {
      items.push({
        id: 'screenshot-orthographic',
        label: 'Orthographic views x 6',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'orthographic' },
      });
    }

    for (const entryPath of listGeometryEntryPaths(geometryUnits, viewRecords, mainEntryPath ?? '')) {
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
  }, [geometryUnits, viewRecords, mainEntryPath, mainGeometryFormat, logic.imageInputSupported]);

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
  useEffect(() => {
    projectContextRef.current = projectContext;
    handleAddImageRef.current = logic.handleAddImage;
    imageInputSupportedRef.current = logic.imageInputSupported;
    rejectUnsupportedImageInputRef.current = logic.rejectUnsupportedImageInput;
  }, [logic.handleAddImage, logic.imageInputSupported, logic.rejectUnsupportedImageInput, projectContext]);

  /**
   * Resolve the per-view graphics actor whose pane currently shows `entryPath`.
   * Falls back to the main entry's pane when no specific entry is requested,
   */
  const resolveGraphicsRefForEntry = useCallback(
    (entryPath: string | undefined): ActorRefFrom<typeof graphicsMachine> | undefined => {
      const currentProjectContext = projectContextRef.current;
      if (!currentProjectContext) {
        return undefined;
      }
      const { viewGraphics, viewEntryPaths, mainEntryPath: mainEntry } = currentProjectContext;
      return findEntryGraphics(viewGraphics, viewEntryPaths, entryPath ?? mainEntry);
    },
    [],
  );

  const captureEntry = useCallback(
    async (entryPath: string | undefined, captureMode: 'current' | 'orthographic', successToast = false) => {
      const currentProjectContext = projectContextRef.current;
      const target = [
        entryPath,
        currentProjectContext?.mainEntryPath,
        currentProjectContext?.geometryUnits.keys().next().value,
      ].find((candidate) => candidate !== undefined && candidate !== '');
      if (!currentProjectContext || !target) {
        toast.error('No CAD view available for image capture');
        return;
      }
      const claimId = randomUuid();
      const { projectRef } = currentProjectContext;
      projectRef.send({ type: 'claimGeometryUnit', claimId, entryPath: target });
      try {
        const unit = await waitFor(projectRef, (state) => state.context.geometryUnits.has(target), { timeout: 30_000 });
        const cadRef = unit.context.geometryUnits.get(target);
        if (!cadRef) {
          throw new Error('No CAD view available for image capture');
        }
        const { captureCadImages, captureFilesToDataUrls, omittedSectionCutsNotice } =
          await import('#services/headless-capture.js');
        const graphicsRef = resolveGraphicsRefForEntry(entryPath);
        const { files, omittedSectionCutIds } = await captureCadImages({
          cadRef,
          graphicsRef,
          imageService,
          recipe:
            captureMode === 'current' && !graphicsRef
              ? { purpose: 'chat', mode: 'isometric' }
              : { purpose: 'chat', mode: captureMode },
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
        if (omittedSectionCutIds.length > 0) {
          toast.warning(omittedSectionCutsNotice);
        }
      } catch (error) {
        if (mounted.current) {
          toast.error(error instanceof Error ? error.message : 'Image capture failed');
        }
      } finally {
        projectRef.send({ type: 'releaseGeometryUnit', claimId });
      }
    },
    [imageService, resolveGraphicsRefForEntry],
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

  const skeleton = <ChatTextareaSkeleton className={className} />;
  /* A paused run is answered from the composer, not the transcript. Only the
   * main composer, and only under a real session: the new-project composer runs
   * on `ChatComposerProvider`, which has no chat to be paused. */
  const approvalBanner = mode === 'main' && projectContext && session ? <ChatApprovalBanner /> : undefined;

  return (
    <ClientOnly fallback={skeleton}>
      {approvalBanner}
      <ChatTextareaDesktop
        className={className}
        enableAutoFocus={enableAutoFocus}
        enableContextActions={enableContextActions}
        enableKernelSelector={enableKernelSelector}
        creationLocationControl={creationLocationControl}
        isSubmitDisabled={logic.isSubmitDisabled}
        mode={mode}
        // State
        dragKind={logic.dragKind}
        isSubmitting={logic.isSubmitting}
        canResume={logic.canResume}
        isAttaching={logic.isAttaching}
        inputText={logic.inputText}
        attachments={logic.attachments}
        attachmentDirectory={logic.attachmentDirectory}
        sendBlockReason={logic.sendBlockReason}
        attachmentAccept={logic.attachmentAccept}
        attachmentInputSupported={logic.attachmentInputSupported}
        status={logic.status}
        formattedCancelKeyCombination={logic.formattedCancelKeyCombination}
        // Context data for Tiptap
        treeService={treeService}
        chats={chats}
        actionItems={screenshotActionItems}
        setDraftText={setDraftText}
        acpAgentId={acpAgentId}
        acpSessionData={acpSessionData}
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
        removeAttachment={logic.removeAttachment}
      />
    </ClientOnly>
  );
});
