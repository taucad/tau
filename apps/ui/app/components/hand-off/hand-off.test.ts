import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  captureHandOff,
  handOffScript,
  inputAcceptedMarkName,
  installHandOffTracker,
  isHandOffComposing,
  recordInputAccepted,
  resetInputAcceptedForTest,
} from '#components/hand-off/hand-off.js';
import type { HandOffElement, HandOffOptions } from '#components/hand-off/hand-off.js';
import { projectComposerBox } from '#components/chat/project-composer-hand-off.js';

const record = vi.hoisted(() => vi.fn());
vi.mock('@taucad/ui-core/lib/project-open-performance', () => ({
  pageProjectOpenPerformance: () => ({ record, begin: vi.fn() }),
}));

/** Serve a textarea followed by the inline script, and run the script where it was served, as the parser does. */
const serveWithScript = (options: HandOffOptions): HandOffElement => {
  const host = document.createElement('div');
  document.body.append(host);
  const input = document.createElement('textarea');
  const script = document.createElement('script');
  script.textContent = handOffScript('previous-sibling', options);
  host.append(input, script);
  return input as HandOffElement;
};

const createTracked = (options: HandOffOptions): HandOffElement => {
  const input = document.createElement('textarea') as HandOffElement;
  document.body.append(input);
  installHandOffTracker(input, options);
  return input;
};

type Step =
  | { readonly kind: 'type'; readonly text: string }
  | { readonly kind: 'compose'; readonly phase: 'start' | 'end' }
  | { readonly kind: 'key'; readonly init: KeyboardEventInit };

/** Apply native-looking events; a key the page did not prevent inserts nothing here, which is all the tracker reads. */
const play = (input: HTMLTextAreaElement, steps: readonly Step[]): void => {
  for (const step of steps) {
    if (step.kind === 'type') {
      input.value += step.text;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: step.text }));
    } else if (step.kind === 'compose') {
      input.dispatchEvent(new CompositionEvent(step.phase === 'start' ? 'compositionstart' : 'compositionend'));
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...step.init }));
    }
  }
};

/* The served script runs in the document's window, so the stub goes there too. */
const stubPointer = (coarse: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: coarse && query === '(pointer: coarse)', media: query })),
  );
  Object.defineProperty(document.defaultView ?? globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: globalThis.matchMedia,
  });
};

/** One box: the layout draws the input. jsdom draws nothing, so a test that needs a drawn input says so. */
const drawn = (): DOMRectList => {
  const rects = [new DOMRect(0, 0, 10, 10)];
  return Object.assign(rects, { item: (index: number) => rects[index] ?? null });
};

/* A resize observer the test fires by hand, standing in for the layout drawing an input it hid. */
const resizeObservers = new Set<{ readonly fire: () => void }>();
const stubResizeObserver = (): void => {
  class FakeResizeObserver implements ResizeObserver {
    readonly #callback: ResizeObserverCallback;
    readonly #entry = {
      fire: (): void => {
        this.#callback([], this);
      },
    };
    public constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
    }
    public observe(): void {
      resizeObservers.add(this.#entry);
    }
    public unobserve(): void {
      resizeObservers.delete(this.#entry);
    }
    public disconnect(): void {
      resizeObservers.delete(this.#entry);
    }
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  /* A served script runs in the document's own global, which has no resize observer of its own: give it the fake. */
  const realm = document.createElement('script');
  realm.textContent = 'document.tauScriptGlobal = globalThis';
  document.body.append(realm);
  const scriptGlobal = Reflect.get(document, 'tauScriptGlobal') as Record<string, unknown>;
  Reflect.set(scriptGlobal, 'ResizeObserver', FakeResizeObserver);
  onTestFinished(() => {
    Reflect.deleteProperty(scriptGlobal, 'ResizeObserver');
    Reflect.deleteProperty(document, 'tauScriptGlobal');
  });
};
const fireResize = (): void => {
  for (const observer of resizeObservers) {
    observer.fire();
  }
};

/* A performance observer the test feeds by hand, since the jsdom timeline keeps no marks to observe. */
const markObservers = new Set<(names: readonly string[]) => void>();
const stubPerformanceObserver = (): void => {
  class FakePerformanceObserver implements PerformanceObserver {
    public static readonly supportedEntryTypes = ['mark'];
    readonly #listener: (names: readonly string[]) => void;
    public constructor(callback: PerformanceObserverCallback) {
      this.#listener = (names) => {
        const entries = names.map(
          (name): PerformanceEntry => ({
            name,
            entryType: 'mark',
            startTime: 0,
            duration: 0,
            // eslint-disable-next-line @typescript-eslint/naming-convention -- The DOM's PerformanceEntry names it.
            toJSON: () => ({ name, entryType: 'mark' }),
          }),
        );
        const list: PerformanceObserverEntryList = {
          getEntries: () => entries,
          getEntriesByName: (name) => entries.filter((entry) => entry.name === name),
          getEntriesByType: (type) => entries.filter((entry) => entry.entryType === type),
        };
        callback(list, this);
      };
    }
    public takeRecords(): PerformanceEntryList {
      return [];
    }
    public observe(): void {
      markObservers.add(this.#listener);
    }
    public disconnect(): void {
      markObservers.delete(this.#listener);
    }
  }
  vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
};
const observeMark = (name: string): void => {
  for (const listener of markObservers) {
    listener([name]);
  }
};

const nextFrame = async (): Promise<void> =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

/* The jsdom timeline keeps no marks; a small one stands in, on the one `performance` the page and the test share. */
const stubTimeline = (): void => {
  const marks: PerformanceMark[] = [];
  vi.spyOn(performance, 'mark').mockImplementation((name, options) => {
    const mark: PerformanceMark = {
      name,
      entryType: 'mark',
      startTime: options?.startTime ?? performance.now(),
      duration: 0,
      detail: undefined,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- the DOM's own method name
      toJSON: () => ({}),
    };
    marks.push(mark);
    return mark;
  });
  vi.spyOn(performance, 'getEntriesByName').mockImplementation((name, type) =>
    marks.filter((mark) => mark.name === name && (type === undefined || mark.entryType === type)),
  );
};

describe('hand-off contract (P4)', () => {
  beforeEach(async () => {
    /* An earlier test's input marks at its next frame; let that frame pass before this test's timeline starts. */
    await nextFrame();
    stubPointer(false);
    stubTimeline();
    record.mockClear();
    resetInputAcceptedForTest();
    resizeObservers.clear();
    markObservers.clear();
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /* The served script and the bundle's tracker are two spellings of one recorder; they must agree on every sequence. */
  it.each<{ readonly name: string; readonly steps: readonly Step[]; readonly queueSubmit: boolean }>([
    { name: 'nothing', steps: [], queueSubmit: true },
    { name: 'typing', steps: [{ kind: 'type', text: 'a hinge' }], queueSubmit: true },
    {
      name: 'an open composition',
      steps: [
        { kind: 'compose', phase: 'start' },
        { kind: 'type', text: 'に' },
      ],
      queueSubmit: true,
    },
    {
      name: 'a finished composition',
      steps: [
        { kind: 'compose', phase: 'start' },
        { kind: 'type', text: 'に' },
        { kind: 'compose', phase: 'end' },
      ],
      queueSubmit: true,
    },
    {
      name: 'Enter after text',
      steps: [
        { kind: 'type', text: 'Make a bracket.' },
        { kind: 'key', init: { key: 'Enter' } },
      ],
      queueSubmit: true,
    },
    {
      name: 'an edit after Enter',
      steps: [
        { kind: 'type', text: 'Make a bracket.' },
        { kind: 'key', init: { key: 'Enter' } },
        { kind: 'type', text: ' Twice' },
      ],
      queueSubmit: true,
    },
    { name: 'Enter with nothing typed', steps: [{ kind: 'key', init: { key: 'Enter' } }], queueSubmit: true },
    {
      name: 'Shift+Enter',
      steps: [
        { kind: 'type', text: 'a' },
        { kind: 'key', init: { key: 'Enter', shiftKey: true } },
      ],
      queueSubmit: true,
    },
    {
      name: 'Enter that commits a composition',
      steps: [
        { kind: 'type', text: 'a' },
        { kind: 'key', init: { key: 'Enter', isComposing: true } },
      ],
      queueSubmit: true,
    },
    {
      name: 'Enter on a surface that does not queue',
      steps: [
        { kind: 'type', text: 'a' },
        { kind: 'key', init: { key: 'Enter' } },
      ],
      queueSubmit: false,
    },
  ])('should record the same state from the served script and the tracker for $name', ({ steps, queueSubmit }) => {
    const served = serveWithScript({ queueSubmit });
    const tracked = createTracked({ queueSubmit });

    play(served, steps);
    play(tracked, steps);

    expect(served.tauHandOff).toBeDefined();
    expect(tracked.tauHandOff).toEqual(served.tauHandOff);
  });

  it('should queue a submit on plain Enter and keep the line break out of the text', () => {
    const input = createTracked({ queueSubmit: true });
    play(input, [{ kind: 'type', text: 'Make a bracket.' }]);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

    input.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(true);
    expect(input.tauHandOff).toMatchObject({ edited: true, submitQueued: true });
    play(input, [{ kind: 'type', text: ' Twice' }]);
    expect(input.tauHandOff?.submitQueued).toBe(false);
  });

  /* Q15: on a touch keyboard return is a line break, and only Send sends; the native input does the same. */
  it('should leave Enter as a line break under a coarse pointer', () => {
    stubPointer(true);
    const input = createTracked({ queueSubmit: true });
    play(input, [{ kind: 'type', text: 'a' }]);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

    input.dispatchEvent(enter);

    expect(enter.defaultPrevented).toBe(false);
    expect(input.tauHandOff?.submitQueued).toBe(false);
  });

  it('should install once, keeping what the served script already recorded', () => {
    const input = serveWithScript({ queueSubmit: true });
    play(input, [{ kind: 'type', text: 'kept' }]);
    const state = input.tauHandOff;

    installHandOffTracker(input, { queueSubmit: true });
    play(input, [{ kind: 'compose', phase: 'start' }]);

    expect(input.tauHandOff).toBe(state);
    expect(state).toMatchObject({ edited: true, composing: true });
  });

  it('should capture value, selection, direction, focus, scroll and the queued submit', () => {
    const input = createTracked({ queueSubmit: true });
    input.value = 'line one\nline two';
    input.dispatchEvent(new InputEvent('input'));
    input.focus();
    input.setSelectionRange(2, 7, 'backward');
    input.scrollTop = 0;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

    expect(captureHandOff(input)).toEqual({
      text: 'line one\nline two',
      edited: true,
      focused: true,
      focusUnclaimed: false,
      start: 2,
      end: 7,
      direction: 'backward',
      scrollTop: 0,
      submitQueued: true,
    });
  });

  it('should read an untouched input as not edited, and focus left on the page as unclaimed', () => {
    const input = createTracked({ queueSubmit: false });

    expect(captureHandOff(input)).toMatchObject({ text: '', edited: false, focused: false, focusUnclaimed: true });
  });

  it('should count a type-then-delete as an edit', () => {
    const input = createTracked({ queueSubmit: false });
    play(input, [{ kind: 'type', text: 'a' }]);
    input.value = '';
    input.dispatchEvent(new InputEvent('input'));

    expect(captureHandOff(input)).toMatchObject({ text: '', edited: true });
  });

  it('should take a focus hint for an input no longer in the document', () => {
    const input = createTracked({ queueSubmit: false });
    input.remove();

    expect(captureHandOff(input, true)).toMatchObject({ focused: true, focusUnclaimed: false });
  });

  /* Adoption waits for an open composition; a composition the browser can no longer deliver is not open. */
  it('should treat a composition as open only while the input holds focus in the document', () => {
    const input = createTracked({ queueSubmit: false });
    play(input, [{ kind: 'compose', phase: 'start' }]);
    expect(isHandOffComposing(input)).toBe(false);
    input.focus();
    expect(isHandOffComposing(input)).toBe(true);
    play(input, [{ kind: 'compose', phase: 'end' }]);
    expect(isHandOffComposing(input)).toBe(false);
    play(input, [{ kind: 'compose', phase: 'start' }]);
    input.remove();
    expect(isHandOffComposing(input)).toBe(false);
  });

  it('should mark the first frame the input can take text, once per document', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(drawn());
    const first = createTracked({ queueSubmit: false });
    const second = createTracked({ queueSubmit: false });
    await nextFrame();
    await nextFrame();

    expect(first.tauHandOff?.acceptedAt).toEqual(expect.any(Number));
    expect(second.tauHandOff?.acceptedAt).toEqual(expect.any(Number));
    const marks = performance.getEntriesByName(inputAcceptedMarkName, 'mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.startTime).toBe(first.tauHandOff?.acceptedAt);
  });

  /* A served script runs against jsdom's own window timeline, so only the time it keeps on the input is read here. */
  it('should keep the first frame on a served input too', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(drawn());
    const served = serveWithScript({ queueSubmit: false });
    await nextFrame();
    await nextFrame();

    expect(served.tauHandOff?.acceptedAt).toEqual(expect.any(Number));
  });

  /* A phone's workspace placeholder keeps the chat lane undrawn: its input takes no text, so it is not the mark. */
  it('should mark nothing for an input the layout does not draw', async () => {
    const hidden = createTracked({ queueSubmit: false });
    await nextFrame();

    expect(hidden.tauHandOff?.acceptedAt).toBeUndefined();
    expect(performance.getEntriesByName(inputAcceptedMarkName, 'mark')).toHaveLength(0);
  });

  /* An input served hidden (a phone's chat lane) and shown later takes text from then: that frame is the mark. */
  it.each([
    ['created by the bundle', (): HandOffElement => createTracked({ queueSubmit: false })],
    ['served with its script', (): HandOffElement => serveWithScript({ queueSubmit: false })],
  ])('should mark the frame a hidden input %s is first drawn', async (_name, create) => {
    stubResizeObserver();
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects');
    const input = create();
    await nextFrame();
    expect(input.tauHandOff?.acceptedAt).toBeUndefined();

    rects.mockReturnValue(drawn());
    fireResize();

    expect(input.tauHandOff?.acceptedAt).toEqual(expect.any(Number));
    expect(resizeObservers.size).toBe(0);
  });

  /* The bundle can look before the mark exists, and the mark can come much later (an input shown later). */
  it('should record the measure when the mark is left after the bundle looked', () => {
    stubPerformanceObserver();
    recordInputAccepted();
    expect(record).not.toHaveBeenCalled();

    performance.mark(inputAcceptedMarkName, { startTime: 300 });
    observeMark(inputAcceptedMarkName);

    expect(record).toHaveBeenCalledExactlyOnceWith('input.accepted', { start: 0, end: 300, outcome: 'ok' });
    expect(markObservers.size).toBe(0);
  });

  /* Without an observable timeline, each call that finds no mark looks once more two frames later. */
  it('should look again after a later call when the timeline cannot be observed', async () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    recordInputAccepted();
    await nextFrame();
    await nextFrame();
    await nextFrame();
    expect(record).not.toHaveBeenCalled();

    recordInputAccepted();
    performance.mark(inputAcceptedMarkName, { startTime: 400 });
    await nextFrame();
    await nextFrame();
    await nextFrame();

    expect(record).toHaveBeenCalledExactlyOnceWith('input.accepted', { start: 0, end: 400, outcome: 'ok' });
  });

  it('should record tau.load.input.accepted once, from navigation start to the mark', () => {
    performance.mark(inputAcceptedMarkName, { startTime: 120 });

    recordInputAccepted();
    recordInputAccepted();

    expect(record).toHaveBeenCalledExactlyOnceWith('input.accepted', { start: 0, end: 120, outcome: 'ok' });
  });

  it('should record nothing before any input was marked', () => {
    recordInputAccepted();

    expect(record).not.toHaveBeenCalled();
  });
});

/*
 * A15d (C10; programme control's ruling of 2026-11-16T22:06Z, the operator's 2026-11-13T13:14Z item 5): a queuing
 * surface's box draws the queued send and Escape cancels it, and a box that asks for it has the served input paint the
 * stored draft as prefilled text, never as an edit. Literal attributes: the rows read the served DOM.
 */
describe('hand-off queued send and stored draft (A15d, C10)', () => {
  const status = 'Send queued. Press Escape to cancel.';

  beforeEach(async () => {
    await nextFrame();
    stubPointer(false);
    stubTimeline();
    localStorage.clear();
  });
  afterEach(() => {
    document.body.replaceChildren();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A box with its status slot around a served input and its script, as the served page has it. */
  const serveInBox = (attributes: readonly string[] = []): { box: HTMLElement; input: HandOffElement } => {
    const box = document.createElement('div');
    box.dataset['handOffBox'] = '';
    for (const attribute of attributes) {
      box.setAttribute(attribute, '');
    }
    const statusSlot = document.createElement('span');
    statusSlot.dataset['slot'] = 'queued-send-status';
    const host = document.createElement('div');
    const input = document.createElement('textarea');
    const script = document.createElement('script');
    script.textContent = handOffScript('previous-sibling', { queueSubmit: true });
    host.append(input, script);
    box.append(statusSlot, host);
    document.body.append(box);
    return { box, input: input as HandOffElement };
  };

  const trackInBox = (): { box: HTMLElement; input: HandOffElement } => {
    const box = document.createElement('div');
    box.dataset['handOffBox'] = '';
    const statusSlot = document.createElement('span');
    statusSlot.dataset['slot'] = 'queued-send-status';
    const input = document.createElement('textarea') as HandOffElement;
    box.append(statusSlot, input);
    document.body.append(box);
    installHandOffTracker(input, { queueSubmit: true });
    return { box, input };
  };

  const statusOf = (box: HTMLElement): string | undefined =>
    box.querySelector('[data-slot=queued-send-status]')?.textContent ?? undefined;

  it.each([
    { name: 'the served script', make: serveInBox },
    { name: 'the tracker', make: trackInBox },
  ])('should draw a queued send in its box, from $name, until an edit or Escape cancels it', ({ make }) => {
    const { box, input } = make();
    play(input, [{ kind: 'type', text: 'Make a bracket.' }]);
    expect(Object.hasOwn(box.dataset, 'earlyText')).toBe(true);
    play(input, [{ kind: 'key', init: { key: 'Enter' } }]);
    expect(Object.hasOwn(box.dataset, 'queuedSend')).toBe(true);
    expect(statusOf(box)).toBe(status);
    expect(captureHandOff(input).submitQueued).toBe(true);

    play(input, [{ kind: 'key', init: { key: 'Escape' } }]);
    expect(Object.hasOwn(box.dataset, 'queuedSend')).toBe(false);
    expect(statusOf(box)).toBe('');
    expect(captureHandOff(input).submitQueued).toBe(false);
    expect(input.value).toBe('Make a bracket.');

    play(input, [
      { kind: 'key', init: { key: 'Enter' } },
      { kind: 'type', text: ' Twice' },
    ]);
    expect(Object.hasOwn(box.dataset, 'queuedSend')).toBe(false);
    expect(captureHandOff(input).submitQueued).toBe(false);
  });

  /* The two spellings still agree, Escape included, inside a box and out of one. */
  it.each([
    { name: 'Escape after Enter', inBox: false },
    { name: 'Escape after Enter, in a box', inBox: true },
  ])('should record the same state from both spellings for $name', ({ inBox }) => {
    const served = inBox ? serveInBox().input : serveWithScript({ queueSubmit: true });
    const tracked = inBox ? trackInBox().input : createTracked({ queueSubmit: true });
    const steps: readonly Step[] = [
      { kind: 'type', text: 'Make a bracket.' },
      { kind: 'key', init: { key: 'Enter' } },
      { kind: 'key', init: { key: 'Escape' } },
    ];
    play(served, steps);
    play(tracked, steps);
    expect(served.tauHandOff?.submitQueued).toBe(false);
    expect(tracked.tauHandOff).toEqual(served.tauHandOff);
  });

  it('should paint the stored draft into an empty served input as prefilled text, not an edit', () => {
    history.replaceState(null, '', '/');
    localStorage.setItem(
      'tau-draft-hint',
      JSON.stringify({ v: 1, home: { usedAt: 1, text: 'A bracket for the shelf' }, projects: {} }),
    );
    const { box, input } = serveInBox(['data-draft-hint']);
    expect(input.value).toBe('A bracket for the shelf');
    expect(Object.hasOwn(box.dataset, 'earlyText')).toBe(true);
    expect(captureHandOff(input)).toMatchObject({ text: 'A bracket for the shelf', edited: false, prefilled: true });

    play(input, [{ kind: 'type', text: '!' }]);
    const edited = captureHandOff(input);
    expect(edited).toMatchObject({ edited: true });
    expect(edited.prefilled).toBeUndefined();
  });

  it("should paint a project chat's draft with its chat, and nothing outside a box that asks", () => {
    history.replaceState(null, '', '/w/acme/bracket?chat=chat-1');
    localStorage.setItem(
      'tau-draft-hint',
      JSON.stringify({ v: 1, projects: { 'acme/bracket': { usedAt: 1, text: 'Fillet it', chatId: 'chat-1' } } }),
    );
    try {
      expect(captureHandOff(serveInBox(['data-draft-hint']).input)).toMatchObject({
        text: 'Fillet it',
        prefilled: true,
        prefilledChatId: 'chat-1',
      });
      expect(serveInBox().input.value).toBe('');
      expect(serveWithScript({ queueSubmit: true }).value).toBe('');
      expect(serveWithScript({ queueSubmit: false }).value).toBe('');
    } finally {
      history.replaceState(null, '', '/');
    }
  });

  it('should queue an Enter on a painted draft nobody edited visibly, as any Enter, and cancel it on Escape', () => {
    history.replaceState(null, '', '/');
    localStorage.setItem(
      'tau-draft-hint',
      JSON.stringify({ v: 1, home: { usedAt: 1, text: 'Fillet it' }, projects: {} }),
    );
    /* The project composer's own box. */
    const { box, input } = serveInBox(Object.keys(projectComposerBox));
    expect(input.value).toBe('Fillet it');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(Object.hasOwn(box.dataset, 'queuedSend')).toBe(true);
    expect(statusOf(box)).toBe(status);
    expect(captureHandOff(input)).toMatchObject({ submitQueued: true, prefilled: true, edited: false });

    play(input, [{ kind: 'key', init: { key: 'Escape' } }]);
    expect(Object.hasOwn(box.dataset, 'queuedSend')).toBe(false);
    expect(captureHandOff(input).submitQueued).toBe(false);
  });
});
