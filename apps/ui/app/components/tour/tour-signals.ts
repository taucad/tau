/**
 * How the editor's own state reaches the tour: one subscription per owner, opened when the tour starts and closed
 * when it stops. Nothing here is a React effect, and none of those owners import the tour.
 *
 * - The chat open in the chat lane: whether a message was sent, whether a turn is running, and whether the transcript
 *   holds a test run (an activity row whose families include `test`).
 * - Each view's graphics owner: whether a model is on screen, and its camera's input coming back to rest after a move.
 * - The main entry's geometry unit: whether the model has parameters.
 * - The controls that report a tip's real action (`tour-actions.ts`).
 * - The stored tour and the device's pause, which another tab may change.
 */

import type { MyUIMessage } from '@taucad/chat';
import { activityFamily } from '@taucad/chat-ui/utils/assistant-message-activity';
import type { TourStepId } from '@taucad/preferences';
import type { StoredTour, TourFacts, TourMachineEvent } from '#machines/tour.machine.js';

/** The part of an actor the signals read: its snapshot and its changes. */
export type Observed<Snapshot> = Readonly<{
  getSnapshot: () => Snapshot;
  subscribe: (listener: (snapshot: Snapshot) => void) => Readonly<{ unsubscribe: () => void }>;
}>;

/** A view's camera: whether its input is idle, dragging or settling. */
export type ObservedCamera = Observed<Readonly<{ matches: (value: { input: 'idle' }) => boolean }>>;

/** A view's graphics owner. */
export type ObservedGraphics = Observed<
  Readonly<{ context: Readonly<{ artifact?: unknown; cameraRef: ObservedCamera }> }>
>;

/** A geometry unit: its parameter manifest, once parsed. */
export type ObservedUnit = Observed<
  Readonly<{ context: Readonly<{ parameterManifest?: Readonly<{ defaults: Readonly<Record<string, unknown>> }> }> }>
>;

/** Everything the signals subscribe to. */
export type TourSignalSources = Readonly<{
  project: Observed<
    Readonly<{
      context: Readonly<{
        viewGraphics: ReadonlyMap<string, ObservedGraphics>;
        geometryUnits: ReadonlyMap<string, ObservedUnit>;
        mainEntryPath: string;
      }>;
    }>
  >;
  editor: Observed<Readonly<{ context: Readonly<{ focusedChatId?: string }> }>>;
  chats: Readonly<{
    subscribeChat: (chatId: string, listener: () => void) => () => void;
    read: (chatId: string) => Readonly<{ status: string; messages: readonly MyUIMessage[] }> | undefined;
  }>;
  /** The tip actions controls report. */
  actions: (listener: (step: TourStepId) => void) => () => void;
  /** The stored tour and the device's pause, as stored now, and their changes. */
  stored: Readonly<{
    read: () => Readonly<{ stored: StoredTour; wanted: boolean; paused: boolean }>;
    subscribe: (listener: () => void) => () => void;
  }>;
}>;

const isTurnRunning = (status: string): boolean => status === 'submitted' || status === 'streaming';

/** The project's views, geometry units and main entry, as they are now. */
const selectProjectContext = (
  project: TourSignalSources['project'],
): ReturnType<TourSignalSources['project']['getSnapshot']>['context'] => project.getSnapshot().context;

/**
 * The chat open in the chat lane, as it is now.
 *
 * @param editor - The editor actor.
 * @returns Its id, or `undefined` while none is open.
 */
export const selectFocusedChatId = (editor: TourSignalSources['editor']): string | undefined =>
  editor.getSnapshot().context.focusedChatId;

const selectParameterDefaults = (unit: ObservedUnit | undefined): Readonly<Record<string, unknown>> | undefined =>
  unit?.getSnapshot().context.parameterManifest?.defaults;

const selectHasModel = (graphics: ObservedGraphics): boolean => graphics.getSnapshot().context.artifact !== undefined;

const selectCamera = (graphics: ObservedGraphics): ObservedCamera => graphics.getSnapshot().context.cameraRef;

const selectIsCameraMoving = (camera: ObservedCamera): boolean => !camera.getSnapshot().matches({ input: 'idle' });

const hasTestRun = (messages: readonly MyUIMessage[]): boolean =>
  messages.some(
    (message) => message.role === 'assistant' && message.parts.some((part) => activityFamily(part) === 'test'),
  );

const sameFacts = (left: TourFacts, right: TourFacts): boolean =>
  left.messageSent === right.messageSent &&
  left.modelOnScreen === right.modelOnScreen &&
  left.turnRunning === right.turnRunning &&
  left.hasParameters === right.hasParameters &&
  left.hasTestRun === right.hasTestRun;

/**
 * The facts the tour reads, from the owners as they are now.
 *
 * @param sources - The owners.
 * @returns The facts.
 */
export const readTourFacts = (sources: Pick<TourSignalSources, 'project' | 'editor' | 'chats'>): TourFacts => {
  const project = selectProjectContext(sources.project);
  const chatId = selectFocusedChatId(sources.editor);
  const chat = chatId === undefined ? undefined : sources.chats.read(chatId);
  const messages = chat?.messages ?? [];
  const unit = project.geometryUnits.get(project.mainEntryPath);
  const defaults = selectParameterDefaults(unit);
  return {
    messageSent: messages.some((message) => message.role === 'user'),
    modelOnScreen: [...project.viewGraphics.values()].some((graphics) => selectHasModel(graphics)),
    turnRunning: chat !== undefined && isTurnRunning(chat.status),
    hasParameters: defaults !== undefined && Object.keys(defaults).length > 0,
    hasTestRun: hasTestRun(messages),
  };
};

/**
 * Subscribe the tour to the editor. Facts are sent when they change, the camera's moves and rests as they happen,
 * actions as controls report them, and the stored tour whenever another tab writes it.
 *
 * @param sources - The owners.
 * @param send - Delivers an event to the tour.
 * @returns The cleanup, which closes every subscription.
 */
export const connectTourSignals = (
  sources: TourSignalSources,
  send: (event: TourMachineEvent) => void,
): (() => void) => {
  let facts: TourFacts | undefined;
  const report = (): void => {
    const next = readTourFacts(sources);
    if (facts === undefined || !sameFacts(facts, next)) {
      facts = next;
      send({ type: 'factsChanged', facts: next });
    }
  };

  /* One subscription per graphics owner and per camera, kept in step with the project's views. */
  const watched = new Map<ObservedGraphics, () => void>();
  const watchGraphics = (graphics: ObservedGraphics): void => {
    const camera = selectCamera(graphics);
    let isMoving = selectIsCameraMoving(camera);
    const cameraSubscription = camera.subscribe((snapshot) => {
      const isMovingNow = !snapshot.matches({ input: 'idle' });
      if (isMovingNow !== isMoving) {
        isMoving = isMovingNow;
        send({ type: isMovingNow ? 'cameraMoved' : 'cameraRested' });
      }
    });
    const graphicsSubscription = graphics.subscribe(report);
    watched.set(graphics, () => {
      cameraSubscription.unsubscribe();
      graphicsSubscription.unsubscribe();
    });
  };
  const watchedUnits = new Map<ObservedUnit, () => void>();
  const syncViews = (): void => {
    const { viewGraphics, geometryUnits } = selectProjectContext(sources.project);
    const live = new Set(viewGraphics.values());
    for (const [graphics, stop] of watched) {
      if (!live.has(graphics)) {
        stop();
        watched.delete(graphics);
      }
    }
    for (const graphics of live) {
      if (!watched.has(graphics)) {
        watchGraphics(graphics);
      }
    }
    const units = new Set(geometryUnits.values());
    for (const [unit, stop] of watchedUnits) {
      if (!units.has(unit)) {
        stop();
        watchedUnits.delete(unit);
      }
    }
    for (const unit of units) {
      if (!watchedUnits.has(unit)) {
        watchedUnits.set(unit, unit.subscribe(report).unsubscribe);
      }
    }
  };

  /* The chat open in the chat lane, followed as the lane switches chats. */
  let chatId: string | undefined;
  let stopChat: (() => void) | undefined;
  const syncChat = (): void => {
    const next = selectFocusedChatId(sources.editor);
    if (next === chatId) {
      return;
    }
    stopChat?.();
    chatId = next;
    stopChat = next === undefined ? undefined : sources.chats.subscribeChat(next, report);
  };

  const projectSubscription = sources.project.subscribe(() => {
    syncViews();
    report();
  });
  const editorSubscription = sources.editor.subscribe(() => {
    syncChat();
    report();
  });
  const stopActions = sources.actions((step) => {
    send({ type: 'actionDone', step });
  });
  const stopStored = sources.stored.subscribe(() => {
    send({ type: 'storedChanged', ...sources.stored.read() });
  });
  syncViews();
  syncChat();
  report();

  return () => {
    projectSubscription.unsubscribe();
    editorSubscription.unsubscribe();
    stopChat?.();
    stopActions();
    stopStored();
    for (const stop of watched.values()) {
      stop();
    }
    for (const stop of watchedUnits.values()) {
      stop();
    }
  };
};
