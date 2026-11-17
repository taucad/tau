import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { ChatTextareaProperties } from '#components/chat/chat-textarea-types.js';
import { useChatTextareaLogic } from '#components/chat/chat-textarea-types.js';
import { ChatTextareaDesktop } from '#components/chat/chat-textarea-desktop.js';
import type { PaintedSendVerdict } from '#components/chat/chat-textarea-desktop.js';
import { ChatEarlyInput } from '#components/chat/chat-early-input.js';
import type { EarlyChatInput } from '#components/chat/chat-early-input.js';
import { useHandOffAdoption } from '#components/hand-off/hand-off-store.js';
import type { HandOffTarget } from '#components/hand-off/hand-off-store.js';
import type { HandOffSnapshot } from '#components/hand-off/hand-off.js';
import { draftHintScopeOf, writeDraftHint } from '#lib/frame-hint-draft.js';
import { ClientOnly } from '@taucad/ui/components/client-only';
import { ChatTextareaSkeleton } from '@taucad/chat-ui/components/chat-textarea-skeleton';
import { useProject } from '#hooks/use-project.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useDraftActions } from '#hooks/use-chat.js';
import { toast } from '@taucad/ui/components/sonner';
import { randomUuid } from '@taucad/utils/id';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { ContextSuggestionItem } from '@taucad/chat-ui/components/tiptap/suggestion-types';
import { takeScreenshotGroup } from '@taucad/chat-ui/components/tiptap/context-suggestion.utils';
import { useChatContextInsertion } from '@taucad/chat-ui/components/chat-context-insertion';
import type { ChatContextReference } from '@taucad/chat-ui/components/chat-context-insertion';
import { ChatApprovalBanner } from '#components/chat/chat-approval-banner.js';
import { ChatPlacementNotice } from '#components/chat/chat-placement-notice.js';
import { ChatRunElsewhereNotice } from '#components/chat/chat-run-elsewhere-notice.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { buildDraftMessage } from '#hooks/draft.machine.js';
import type { ComposerRecord } from '@taucad/chat-ui/db/composer-record-store';
import { useTauCloudIntent } from '#hooks/use-cloud-projects.js';
import type { CadAgentExecution } from '@taucad/chat';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { useHeadlessImageService } from '#providers/headless-image-provider.js';
import { useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import { prewarmChatSdk } from '#services/chat-sdk-loader.js';
import { latestAcpSessionData } from '@taucad/chat-ui/services/agent-host-event-projection';
import { findEntryGraphics, listGeometryEntryPaths } from '#routes/w.$workspace.$project/geometry-unit.utils.js';

/** The surface to adopt: none when a host above already owns the native input (`adoptedEarlyInput`, `enableEarlyInput`). */
const handOffTarget = (
  target: HandOffTarget | undefined,
  adoptedEarlyInput: EarlyChatInput | undefined,
  enableEarlyInput: boolean,
): HandOffTarget | undefined => (adoptedEarlyInput === undefined && !enableEarlyInput ? target : undefined);

/** Whether a read record's draft holds anything besides text (an attachment), which a painted draft never shows. */
const recordedDraftHasMore = (record: ComposerRecord | undefined): boolean =>
  record?.draft?.parts.some((part) => part.type !== 'text') ?? false;

/** The text a read record's draft shows (its first text), empty for a record with no draft or none at all. */
const recordedDraftText = (record: ComposerRecord | undefined): string =>
  record?.draft?.parts.map((part) => (part.type === 'text' ? part.text : '')).find((text) => text !== '') ?? '';

/**
 * What becomes of an Enter pressed on a painted draft nobody edited (ruling 2026-11-17T03:28Z): it waits while the
 * composer's record (the chat's, or Home's own) is unread, is sent when the record holds the painted text for this chat and nothing more, and is
 * cancelled otherwise (another chat's draft, another text, an attachment the box never showed, or no record to confirm
 * it).
 *
 * @param paintedSend - The painted text the Enter queued, and the chat it was painted for.
 * @param record - Whether there is a record, its draft's text once read, and the chat on screen.
 * @returns The verdict, or undefined when no such Enter is queued.
 */
const paintedSendVerdictOf = (
  paintedSend: { readonly text: string; readonly chatId?: string } | undefined,
  record: {
    readonly hasRecord: boolean;
    readonly recordDraftText: string | undefined;
    readonly recordDraftHasMore: boolean;
    readonly activeChatId?: string;
  },
): PaintedSendVerdict | undefined => {
  if (paintedSend === undefined) {
    return undefined;
  }
  if (record.hasRecord && record.recordDraftText === undefined) {
    return { kind: 'wait' };
  }
  const recordText = record.recordDraftText ?? '';
  const isSameChat = paintedSend.chatId === undefined || paintedSend.chatId === record.activeChatId;
  return isSameChat && recordText === paintedSend.text && !record.recordDraftHasMore
    ? { kind: 'send' }
    : { kind: 'cancel', recordText };
};

/**
 * Main chat textarea: one composer on every device (C11) — a phone gets the
 * same editor, menus, meter and bar, and its pickers open as drawers.
 *
 * All logic is shared via the `useChatTextareaLogic` hook.
 * Project context data (treeService, chats) is fetched here and passed
 * as props to keep the memo'd desktop component free of internal subscription hooks,
 * preventing re-render cascades through Radix UI's composeRefs.
 */
/**
 * Whether a turn this composer sends would run in a checkout a Tau Cloud open is still writing (SP2h): the chats open
 * before the files land, and such a turn waits for them, as its admission refuses it. A daemon runs on its own tree.
 *
 * @param projectId - The composer's project, if any.
 * @param execution - The execution the send would run.
 * @returns `true` while the send must wait.
 */
const useTurnFilesArriving = (projectId: string | undefined, execution: CadAgentExecution): boolean =>
  useTauCloudIntent(projectId ?? '') === 'open' && daemonPlacementOf(execution) === undefined;

export const ChatTextarea = memo(function ({
  ref,
  onSubmit,
  enableAutoFocus = true,
  enableEarlyInput = false,
  adoptedEarlyInput,
  handOff: handOffTargetProperty,
  onEscapePressed,
  onBlur,
  className,
  enableContextActions = true,
  enableKernelSelector = true,
  creationLocationControl,
  isSubmitDisabled = false,
  mode = 'main',
  enableMobileCollapse = false,
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

  /* Focus inside the composer or its portalled menus; a collapsible composer unfolds while it holds. */
  const [isFocused, setIsFocused] = useState(false);
  const handleFocus = useCallback((): void => {
    setIsFocused(true);
    /* PL1: the AI SDK loads on demand; focus starts its fetch so the first send is not slowed by it. */
    prewarmChatSdk();
  }, []);
  const handleBlur = useCallback((): void => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  /* Another device is running this chat (XD3): its host would refuse the send, so the composer holds it. */
  const {
    runElsewhere,
    draftActorRef,
    execution: { execution: composerExecution },
  } = useChatComposer();
  const projectContext = useProject({ enableNoContext: true });
  const filesArriving = useTurnFilesArriving(projectContext?.projectId, composerExecution);

  /* P4: a placeholder served a native input for this composer; its edit enters the draft before the editor renders
   * it, so the draft's own text never overwrites what the person typed. A15d: a painted draft nobody edited is the
   * hint's copy of this chat's draft. While the chat's record is not read yet and the draft holds nothing, it is the
   * draft (`hydrateDraft`, which leaves an untouched draft open to the record, so the record still wins when it lands),
   * so the text does not leave the box and come back. A record already read is the draft as it stands, empty or not
   * (the hint may be older: sent on another device), and a draft of another chat is not this one's. */
  const { session: composerSession, homeRecordRef } = useChatComposer();
  /* The record this composer's draft persists to: the chat's, or Home's own. */
  const composerRecordRef = composerSession?.composerRecordRef ?? homeRecordRef;
  /* Set in the adoption's own commit, so the editor reads it at its handover. */
  const [isPaintedDraftTaken, setIsPaintedDraftTaken] = useState(false);
  const isRecordLoading = useSelector(composerRecordRef, (state) =>
    state ? state.matches({ lifecycle: 'loading' }) : false,
  );
  /* The text of the draft the composer's record held when it was read, or undefined while it is unread (or there is no
   * record to read). */
  const recordDraftText = useSelector(composerRecordRef, (state) =>
    state === undefined || state.matches({ lifecycle: 'loading' })
      ? undefined
      : recordedDraftText(state.context.record),
  );
  const recordDraftHasMore = useSelector(composerRecordRef, (state) =>
    state === undefined ? false : recordedDraftHasMore(state.context.record),
  );
  /* An Enter pressed on a painted draft nobody edited (ruling 2026-11-17T03:28Z): it queued visibly as any Enter, and
   * is replayed only if the chat's record holds that very text; otherwise it is cancelled, the record's text shows and
   * the status says why. Undefined for any other early input. */
  const [paintedSend, setPaintedSend] = useState<{ readonly text: string; readonly chatId?: string }>();
  const handleHandOffAdopted = useCallback(
    (snapshot: HandOffSnapshot): void => {
      if (snapshot.edited) {
        draftActorRef.send({ type: 'setDraftText', text: snapshot.text, adoptedEdit: true });
        return;
      }
      if (snapshot.prefilled === true && snapshot.submitQueued) {
        setPaintedSend({
          text: snapshot.text,
          ...(snapshot.prefilledChatId === undefined ? {} : { chatId: snapshot.prefilledChatId }),
        });
      }
      const isPaintedDraftTakenNow =
        snapshot.prefilled === true &&
        (snapshot.prefilledChatId === undefined || snapshot.prefilledChatId === composerSession?.activeChatId) &&
        /* Record-wins: only while the record is unread; `hydrateDraft` itself skips a touched draft. */
        isRecordLoading;
      if (isPaintedDraftTakenNow) {
        setIsPaintedDraftTaken(true);
        draftActorRef.send({ type: 'hydrateDraft', draft: buildDraftMessage(snapshot.text, []) });
      }
    },
    [composerSession, draftActorRef, isRecordLoading],
  );
  /* Whether the adopted snapshot's painted draft became the draft, for the editor to keep it (read once, at its
   * handover). */
  const takePaintedDraft = useCallback((): boolean => isPaintedDraftTaken, [isPaintedDraftTaken]);
  const paintedSendVerdict = useMemo(
    () =>
      paintedSendVerdictOf(paintedSend, {
        hasRecord: composerRecordRef !== undefined,
        recordDraftText,
        recordDraftHasMore,
        activeChatId: composerSession?.activeChatId,
      }),
    [paintedSend, composerRecordRef, composerSession, recordDraftText, recordDraftHasMore],
  );
  const handOff = useHandOffAdoption(
    handOffTarget(handOffTargetProperty, adoptedEarlyInput, enableEarlyInput),
    handleHandOffAdopted,
  );
  const logic = useChatTextareaLogic({
    ref,
    onSubmit,
    enableAutoFocus,
    onEscapePressed,
    onBlur: handleBlur,
    mode,
    isSubmitDisabled: isSubmitDisabled || runElsewhere !== undefined || filesArriving,
    onViewerScreenshotDrop: handleViewerScreenshotDrop,
    onAddContextChips: handleAddContextChips,
  });

  const { treeService } = useFileManager();
  const imageService = useHeadlessImageService();
  const { chats } = useChatRecords(projectContext?.projectId ?? '');
  const {
    session,
    execution: { execution },
  } = useChatComposer();
  const acpAgentId = execution.kind === 'acp' ? execution.agentId : undefined;
  const acpSessionData = useChatSessionSnapshot(session?.activeChatId ?? '', (active) =>
    acpAgentId === undefined
      ? undefined
      : latestAcpSessionData(
          active?.messages ?? [],
          acpAgentId,
          execution.kind === 'acp' ? execution.hostId : undefined,
        ),
  );
  const { setDraftText: setMainDraftText, setEditDraftText } = useDraftActions();

  /* The draft hint mirrors the main composer's draft, so the next load paints it in its first frame (A15d, H-e): Home's
   * on `/`, a project's under its URL key with the chat it belongs to. */
  const draftHintChatId = session?.activeChatId;
  const isProjectComposer = projectContext !== undefined;
  useEffect(() => {
    if (mode !== 'main') {
      return;
    }
    const scope = draftHintScopeOf(globalThis.location.pathname, isProjectComposer);
    if (scope !== undefined) {
      writeDraftHint(scope, {
        text: logic.inputText,
        ...(scope.kind === 'project' && draftHintChatId !== undefined ? { chatId: draftHintChatId } : {}),
      });
    }
  }, [mode, logic.inputText, draftHintChatId, isProjectComposer]);

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

  const skeleton = <ChatTextareaSkeleton className={className} enableMobileCollapse={enableMobileCollapse} />;
  /* A paused run is answered from the composer, not the transcript. Only the
   * main composer, and only under a real session: the new-project composer runs
   * on `ChatComposerProvider`, which has no chat to be paused. An agent this
   * device cannot reach is explained in the same place, beside its choice. */
  const composerNotices =
    mode === 'main' && projectContext && session ? (
      <>
        <ChatPlacementNotice />
        <ChatRunElsewhereNotice />
        <ChatApprovalBanner />
      </>
    ) : undefined;

  /* Home's painted draft (its host hands the early input over): an Enter on it nobody edited is decided from Home's
   * record as the project route's is from the chat's (ruling 2026-11-17T03:43Z), waiting while it is unread, so one
   * read with no draft (an older hint) cancels it rather than sending text the record does not hold. */
  const homePaintedSendVerdictOf = (earlyInput: EarlyChatInput | undefined): PaintedSendVerdict | undefined =>
    paintedSendVerdictOf(
      earlyInput?.prefilled === true && earlyInput.submitQueued && !earlyInput.edited
        ? { text: earlyInput.text }
        : undefined,
      { hasRecord: composerRecordRef !== undefined, recordDraftText, recordDraftHasMore },
    );
  const content = (earlyInput?: EarlyChatInput, onEarlyInputAdopted?: () => boolean): React.ReactNode => (
    <>
      {composerNotices}
      <ChatTextareaDesktop
        earlyInput={earlyInput}
        onEarlyInputAdopted={onEarlyInputAdopted}
        paintedSendVerdict={
          onEarlyInputAdopted === undefined ? homePaintedSendVerdictOf(earlyInput) : paintedSendVerdict
        }
        className={className}
        enableAutoFocus={enableAutoFocus}
        enableContextActions={enableContextActions}
        enableKernelSelector={enableKernelSelector}
        creationLocationControl={creationLocationControl}
        isSubmitDisabled={logic.isSubmitDisabled}
        mode={mode}
        enableMobileCollapse={enableMobileCollapse}
        isFocused={isFocused}
        // State
        dragKind={logic.dragKind}
        isSubmitting={logic.isSubmitting}
        canResume={logic.canResume}
        isAttaching={logic.isAttaching}
        pendingImages={logic.pendingImages}
        inputText={logic.inputText}
        attachments={logic.attachments}
        attachmentDirectory={logic.attachmentDirectory}
        sendBlockReason={logic.sendBlockReason}
        attachmentAccept={logic.attachmentAccept}
        attachmentInputSupported={logic.attachmentInputSupported}
        status={logic.status}
        canStop={logic.canStop}
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
        handleTextareaFocus={handleFocus}
        handleTextareaBlur={logic.handleTextareaBlur}
        removeAttachment={logic.removeAttachment}
      />
    </>
  );
  /* Three arrangements, and the host picks one. `adoptedEarlyInput` means a host above this
   * component owns the native input and has already handed its edit over, which is how a route can
   * accept text without this module in its bundle; `enableEarlyInput` means this component owns it,
   * which needs the module first; neither means there is no early input to carry. */
  /* A fourth: a placeholder above served the native input (`handOff`) and this composer adopted it. Until the
   * adoption attempt has run, or while a composition in it is open, the native input is still the thing to type in. */
  if (adoptedEarlyInput) {
    return <>{content(adoptedEarlyInput)}</>;
  }
  if (handOff.kind === 'done' && handOff.snapshot !== undefined) {
    return <>{content(handOff.snapshot, takePaintedDraft)}</>;
  }
  if (handOff.kind === 'waiting') {
    return skeleton;
  }
  return enableEarlyInput ? (
    <ChatEarlyInput className={className}>{content}</ChatEarlyInput>
  ) : (
    <ClientOnly fallback={skeleton}>{content()}</ClientOnly>
  );
});
