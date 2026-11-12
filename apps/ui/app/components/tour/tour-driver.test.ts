import { StepClock } from '@taucad/xstate-testing/clock';
import { Topic } from '@taucad/events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyUIMessage } from '@taucad/chat';
import type { TourStepId } from '@taucad/preferences';
import { startTourDriver } from '#components/tour/tour-driver.js';
import type { TourDriverPorts } from '#components/tour/tour-driver.js';
import { tourSession } from '#components/tour/tour-session.js';
import type { Observed, ObservedGraphics, ObservedUnit, TourSignalSources } from '#components/tour/tour-signals.js';
import { createTourActor, selectTourTip } from '#machines/tour.machine.js';
import type { StoredTour } from '#machines/tour.machine.js';

/** A stand-in for an actor: a snapshot that the test replaces, and its subscribers. */
const observed = <Snapshot>(initial: Snapshot): Observed<Snapshot> & { set: (next: Snapshot) => void } => {
  let snapshot = initial;
  const topic = new Topic<Snapshot>({ name: 'test.observed' });
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => ({ unsubscribe: topic.subscribe(listener) }),
    set: (next) => {
      snapshot = next;
      topic.emit(next);
    },
  };
};

type CameraInput = 'idle' | 'dragging' | 'settling';
const cameraState = (input: CameraInput) => ({ matches: (value: { input: 'idle' }) => value.input === input });

const userMessage = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'A bracket' }] } as MyUIMessage;

/** One view, one geometry unit and one chat, each changed by the test as the editor would change it. */
const editorFakes = () => {
  const camera = observed(cameraState('idle'));
  const graphics = observed<ObservedGraphics extends Observed<infer S> ? S : never>({
    context: { artifact: undefined, cameraRef: camera },
  });
  const unit = observed<ObservedUnit extends Observed<infer S> ? S : never>({ context: {} });
  const project = observed({
    context: {
      viewGraphics: new Map([['view-1', graphics as ObservedGraphics]]),
      geometryUnits: new Map([['main.ts', unit as ObservedUnit]]),
      mainEntryPath: 'main.ts',
    },
  });
  const editor = observed<{ context: { focusedChatId?: string } }>({ context: { focusedChatId: 'chat-1' } });
  let chat: { status: string; messages: readonly MyUIMessage[] } = { status: 'ready', messages: [] };
  const chatTopic = new Topic<void>({ name: 'test.chat' });
  const actions = new Topic<TourStepId>({ name: 'test.actions' });
  const storedTopic = new Topic<void>({ name: 'test.stored' });
  let stored: { stored: StoredTour; wanted: boolean; paused: boolean } = {
    stored: { seen: [] },
    wanted: true,
    paused: false,
  };
  const sources: TourSignalSources = {
    project,
    editor,
    chats: {
      subscribeChat: (_, listener) => chatTopic.subscribe(listener),
      read: () => chat,
    },
    actions: (listener) => actions.subscribe(listener),
    stored: { read: () => stored, subscribe: (listener) => storedTopic.subscribe(listener) },
  };
  return {
    sources,
    camera,
    setChat: (next: typeof chat) => {
      chat = next;
      chatTopic.emit();
    },
    showModel: (defaults: Record<string, unknown>) => {
      graphics.set({ context: { artifact: {}, cameraRef: camera } });
      unit.set({ context: { parameterManifest: { defaults } } });
    },
    act: (step: TourStepId) => {
      actions.emit(step);
    },
    store: (next: typeof stored) => {
      stored = next;
      storedTopic.emit();
    },
    listeners: () => [chatTopic.size, actions.size, storedTopic.size],
  };
};

const ports = () => {
  const telemetry = {
    tourStarted: vi.fn(),
    tourStepShown: vi.fn(),
    tourStepSeen: vi.fn(),
    tourPaused: vi.fn(),
    tourResumed: vi.fn(),
    tourDismissed: vi.fn(),
    tourCompleted: vi.fn(),
  };
  const value = {
    writeOnboarding: vi.fn(),
    writeDevice: vi.fn(),
    telemetry,
    session: tourSession,
  } satisfies TourDriverPorts;
  return value;
};

const drive = (input: { stored: StoredTour; wanted: boolean; paused: boolean; replay?: boolean }) => {
  const clock = new StepClock();
  const tour = createTourActor(input, { clock });
  tour.start();
  const editor = editorFakes();
  editor.store(input);
  const host = ports();
  const stop = startTourDriver({ tour, sources: editor.sources, ports: host });
  return { tour, clock, editor, host, stop, tip: () => selectTourTip(tour.getSnapshot())?.step };
};

afterEach(() => {
  tourSession.reset();
});

describe('the tour driver', () => {
  it('runs a guided tour from the editor’s own signals, and stores and reports each tip', () => {
    const { tour, clock, editor, host, stop, tip } = drive({ stored: { seen: [] }, wanted: true, paused: false });

    expect(tip()).toBe('ask');
    expect(host.telemetry.tourStarted).toHaveBeenCalledWith({ mode: 'guided' });
    expect(host.telemetry.tourStepShown).toHaveBeenCalledWith({ mode: 'guided', step: 'ask' });
    expect(tourSession.read().announcement).toBe(
      'Tip 1 of 5: Describe what you want. To go to it, open the command palette and choose Go to tour tip.',
    );

    editor.setChat({ status: 'streaming', messages: [userMessage] });
    expect(host.writeOnboarding).toHaveBeenCalledWith({ seenAdd: ['ask'] });
    expect(host.telemetry.tourStepSeen).toHaveBeenCalledWith({ mode: 'guided', step: 'ask', by: 'action' });

    editor.showModel({});
    expect(tip()).toBe('look');
    editor.camera.set(cameraState('dragging'));
    editor.camera.set(cameraState('idle'));
    clock.increment(1000);
    expect(host.writeOnboarding).toHaveBeenCalledWith({ seenAdd: ['look'] });

    /* The turn ends with a model that has no parameters: Parameters is passed over, stored but not reported. */
    editor.setChat({ status: 'ready', messages: [userMessage] });
    expect(host.writeOnboarding).toHaveBeenCalledWith({ seenAdd: ['adjust'] });
    expect(host.telemetry.tourStepSeen).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'adjust' }));
    expect(tip()).toBe('verify');

    editor.act('verify');
    tour.send({ type: 'next' });
    expect(host.writeOnboarding).toHaveBeenCalledWith({ ended: 'completed' });
    expect(host.telemetry.tourCompleted).toHaveBeenCalledWith({ mode: 'guided' });
    expect(tourSession.read().announcement).toBe('Tour finished. Take it again from Help.');

    stop();
    expect(editor.listeners()).toEqual([0, 0, 0]);
  });

  it('titles tip 1 by how the project was reached', () => {
    const editor = editorFakes();
    editor.setChat({ status: 'streaming', messages: [userMessage] });
    const tour = createTourActor({ stored: { seen: [] }, wanted: true, paused: false });
    tour.start();
    const stop = startTourDriver({ tour, sources: editor.sources, ports: ports() });

    expect(tourSession.read().announcement).toMatch(/^Tip 1 of 5: Tau is building your part\./u);
    stop();
  });

  it('writes the pause to the device and announces it', () => {
    const { tour, host, stop } = drive({ stored: { seen: ['ask'] }, wanted: true, paused: false });

    tour.send({ type: 'pause' });

    expect(host.writeDevice).toHaveBeenCalledWith({ tourPaused: true });
    expect(host.telemetry.tourPaused).toHaveBeenCalledWith({ mode: 'guided', step: 'look' });
    expect(tourSession.read().announcement).toBe('Tour paused at tip 2. Resume it from Help.');
    stop();
  });

  it('follows a pause made from Help, which writes the device record, without reporting it twice', () => {
    const { editor, host, stop, tip } = drive({ stored: { seen: [] }, wanted: true, paused: false });

    editor.store({ stored: { seen: [] }, wanted: true, paused: true });

    expect(tip()).toBeUndefined();
    expect(host.writeDevice).not.toHaveBeenCalled();
    expect(host.telemetry.tourPaused).not.toHaveBeenCalled();
    stop();
  });

  it('starts and closes a replay with the page’s session, leaving what is stored unchanged', () => {
    const { tour, host, stop, tip } = drive({ stored: { seen: ['ask'] }, wanted: true, paused: false });
    host.writeOnboarding.mockClear();

    tourSession.requestReplay();
    expect(tip()).toBe('ask');
    expect(selectTourTip(tour.getSnapshot())?.mode).toBe('replay');
    expect(host.telemetry.tourStarted).toHaveBeenCalledWith({ mode: 'replay' });

    tour.send({ type: 'next' });
    tourSession.endReplay();

    expect(tour.getSnapshot().matches('running')).toBe(true);
    expect(host.telemetry.tourDismissed).toHaveBeenCalledWith({ mode: 'replay', step: 'look' });
    expect(tourSession.read().announcement).toBe('Tour closed. Take it any time from Help.');
    expect(host.writeOnboarding).not.toHaveBeenCalled();
    expect(tour.getSnapshot().context.stored).toEqual({ seen: ['ask'] });
    stop();
  });

  it('ends the session’s replay when the replay steps past its last tip', () => {
    const { tour, host, stop } = drive({
      stored: { seen: ['ask', 'look', 'adjust', 'verify', 'build'], ended: 'completed' },
      wanted: true,
      paused: false,
      replay: true,
    });
    tourSession.requestReplay();

    for (let step = 0; step < 5; step++) {
      tour.send({ type: 'next' });
    }

    expect(tourSession.read().isReplay).toBe(false);
    expect(host.telemetry.tourCompleted).toHaveBeenCalledWith({ mode: 'replay' });
    expect(host.writeOnboarding).not.toHaveBeenCalled();
    stop();
  });
});
