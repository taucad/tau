import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
