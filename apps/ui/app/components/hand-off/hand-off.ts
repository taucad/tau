import { pageProjectOpenPerformance } from '@taucad/ui-core/lib/project-open-performance';

/**
 * The hand-off contract (progressive loading architecture P4), as DOM: a native input in the document accepts text
 * from first paint, and the rich surface that replaces it adopts its state in one commit.
 *
 * What is handed over is a {@link HandOffSnapshot}: the value, the selection and its direction, focus, the scroll
 * position and a queued submit. An open IME composition is not handed over; adoption waits until it closes
 * ({@link isHandOffComposing}). Keys typed before any bundle runs reach no listener, so the record of them is kept on
 * the element itself ({@link HandOffState}), by the inline script ({@link handOffScript}) that is served right after
 * the input, or by {@link installHandOffTracker} for an input the bundle created. The two are one recorder in two
 * spellings, and a parity test holds them to the same state over every event sequence.
 *
 * This module imports only the timing recorder, so a route can serve the native input without the rich surface.
 *
 * @module
 */

/** What the element records about itself before and after any bundle is here. */
export type HandOffState = {
  /** Any input, including type-then-delete back to the served value. */
  edited: boolean;
  /** A composition is open. */
  composing: boolean;
  /** Plain Enter was pressed with text in the input and nothing has changed it since: a send waits for the adopter. */
  submitQueued: boolean;
  /** `performance.now()` of the first frame the input was drawn and could take text, once that frame has run. */
  acceptedAt: number | undefined;
};

/** A native input that carries its own record. */
export type HandOffElement = HTMLTextAreaElement & { tauHandOff?: HandOffState };

/** Per-surface choices the recorder makes. */
export type HandOffOptions = {
  /**
   * Take plain Enter as a send that waits for the adopter, as the rich surface does with a fine pointer. A surface
   * whose adopter cannot send yet leaves Enter as a line break.
   */
  readonly queueSubmit: boolean;
};

/** Everything the adopter takes over, read in one go. */
export type HandOffSnapshot = {
  readonly text: string;
  readonly edited: boolean;
  readonly focused: boolean;
  /** Nothing held focus: the adopter may take it if it would have on mount. */
  readonly focusUnclaimed: boolean;
  readonly start: number;
  readonly end: number;
  readonly direction: 'forward' | 'backward' | 'none';
  readonly scrollTop: number;
  readonly submitQueued: boolean;
};

/** The User Timing mark the recorder leaves at the first frame a native input could take text; the harness reads it. */
export const inputAcceptedMarkName = 'tau.input.accepted';

/** Where the served script finds its input: the element just before it, or the one textarea inside that element. */
export type HandOffScriptTarget = 'previous-sibling' | 'within-previous-sibling';

/*
 * The served spelling of `installHandOffTracker`. Keep the two in step: the parity test plays every sequence through
 * both. It runs before error reporting, so every access that could throw is guarded and it never throws.
 */
const scriptBody = (target: string, queueSubmit: boolean): string =>
  `(()=>{try{const input=${target};if(!input||input.tauHandOff)return;const state=input.tauHandOff={edited:false,composing:false,submitQueued:false,acceptedAt:undefined};` +
  `input.addEventListener('input',()=>{state.edited=true;state.submitQueued=false});` +
  `input.addEventListener('compositionstart',()=>{state.composing=true});` +
  `input.addEventListener('compositionend',()=>{state.composing=false});` +
  (queueSubmit
    ? `input.addEventListener('keydown',(event)=>{if(event.key!=='Enter'||event.shiftKey||event.altKey||event.ctrlKey||event.metaKey||event.isComposing||event.keyCode===229||(typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches))return;event.preventDefault();state.submitQueued=input.value.trim()!==''});`
    : '') +
  `const mark=()=>{if(input.getClientRects().length===0)return false;const time=performance.now();state.acceptedAt=time;try{if(performance.getEntriesByName('${inputAcceptedMarkName}','mark').length===0)performance.mark('${inputAcceptedMarkName}',{startTime:time})}catch{}return true};` +
  `requestAnimationFrame(()=>{try{if(mark()||typeof ResizeObserver!=='function')return;const observer=new ResizeObserver(()=>{if(mark())observer.disconnect()});observer.observe(input)}catch{}})}catch{}})()`;

/**
 * The inline script served right after a native input. It has no interpolated input: its source is fixed per target
 * and option, and each served spelling's CSP hash is listed in `#lib/inline-script-hashes`.
 *
 * @param target - Where the input is, relative to the script.
 * @param options - The surface's recorder choices.
 * @returns The script's source.
 */
export const handOffScript = (target: HandOffScriptTarget, options: HandOffOptions): string =>
  scriptBody(
    target === 'previous-sibling'
      ? 'document.currentScript.previousElementSibling'
      : `document.currentScript.previousElementSibling.querySelector('textarea')`,
    options.queueSubmit,
  );

/** Q15: under a coarse pointer return is a line break and only Send sends, in the rich surface and here alike. */
const isCoarsePointer = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;

/**
 * Keep the time the input can take text, and leave the first-input mark then unless a native input already left it
 * this document. An input the layout does not draw (a lane hidden at this width) takes no text: it marks nothing.
 *
 * @param element - The native input.
 * @param state - The input's record, which keeps the time too.
 * @returns Whether the input was drawn.
 */
const markAccepted = (element: HTMLElement, state: HandOffState): boolean => {
  if (element.getClientRects().length === 0) {
    return false;
  }
  const time = performance.now();
  state.acceptedAt = time;
  try {
    if (performance.getEntriesByName(inputAcceptedMarkName, 'mark').length === 0) {
      performance.mark(inputAcceptedMarkName, { startTime: time });
    }
  } catch {
    // A timeline that refuses the mark leaves the input working.
  }
  return true;
};

/**
 * Mark at the frame after now, or, for an input not drawn then, at the first layout that draws it (a hidden lane
 * shown later takes text from then).
 *
 * @param element - The native input.
 * @param state - The input's record.
 */
const markAcceptedNextFrame = (element: HTMLElement, state: HandOffState): void => {
  requestAnimationFrame(() => {
    if (markAccepted(element, state) || typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (markAccepted(element, state)) {
        observer.disconnect();
      }
    });
    observer.observe(element);
  });
};

/**
 * Record an input the bundle created, as the served script records a served one. Idempotent: an input that already
 * carries a record, from the script or an earlier call, keeps it.
 *
 * @param element - The native input.
 * @param options - The surface's recorder choices.
 * @returns The input's record.
 */
export const installHandOffTracker = (element: HandOffElement, options: HandOffOptions): HandOffState => {
  if (element.tauHandOff) {
    return element.tauHandOff;
  }
  const state: HandOffState = { edited: false, composing: false, submitQueued: false, acceptedAt: undefined };
  element.tauHandOff = state;
  element.addEventListener('input', () => {
    state.edited = true;
    state.submitQueued = false;
  });
  element.addEventListener('compositionstart', () => {
    state.composing = true;
  });
  element.addEventListener('compositionend', () => {
    state.composing = false;
  });
  if (options.queueSubmit) {
    element.addEventListener('keydown', (event) => {
      if (
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        /* Safari sends the Enter that commits a composition after compositionend, with isComposing false; the legacy
         * key code 229 is the only IME signal that keydown carries there. */
        Reflect.get(event, 'keyCode') === 229 ||
        isCoarsePointer()
      ) {
        return;
      }
      event.preventDefault();
      state.submitQueued = element.value.trim() !== '';
    });
  }
  markAcceptedNextFrame(element, state);
  return state;
};

/**
 * Whether a composition is open that the browser can still deliver to: the input holds focus in the document. A
 * composition the input lost with its focus or its place is not waited for.
 *
 * @param element - The native input.
 * @returns Whether adoption must wait.
 */
export const isHandOffComposing = (element: HandOffElement): boolean =>
  element.tauHandOff?.composing === true && element.isConnected && document.activeElement === element;

/**
 * Read everything the adopter takes over.
 *
 * @param element - The native input.
 * @param focusedHint - Whether it held focus, for an input no longer in the document (moving it out drops focus).
 * @returns The snapshot.
 */
export const captureHandOff = (element: HandOffElement, focusedHint?: boolean): HandOffSnapshot => {
  const focused = element.isConnected ? document.activeElement === element : focusedHint === true;
  const active = document.activeElement;
  return {
    text: element.value,
    edited: element.tauHandOff?.edited === true || element.value !== element.defaultValue,
    focused,
    focusUnclaimed: !focused && (active === null || active === document.body),
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection,
    scrollTop: element.scrollTop,
    submitQueued: element.tauHandOff?.submitQueued === true && element.value.trim() !== '',
  };
};

let inputAcceptedRecorded = false;
/** A wait for the mark is under way: an observer of the timeline, or one look two frames on. */
let inputAcceptedWaiting = false;

const tryRecordInputAccepted = (): boolean => {
  if (inputAcceptedRecorded) {
    return true;
  }
  try {
    const [mark] = performance.getEntriesByName(inputAcceptedMarkName, 'mark');
    if (mark === undefined) {
      return false;
    }
    inputAcceptedRecorded = true;
    pageProjectOpenPerformance().record('input.accepted', { start: 0, end: mark.startTime, outcome: 'ok' });
  } catch {
    // Diagnostic measurement never affects the input.
  }
  return true;
};

/**
 * Record once the mark is left: observe the timeline for it, where the browser lets marks be observed.
 *
 * @returns Whether the timeline is being observed.
 */
const recordWhenMarked = (): boolean => {
  try {
    if (typeof PerformanceObserver !== 'function' || !PerformanceObserver.supportedEntryTypes.includes('mark')) {
      return false;
    }
    const observer = new PerformanceObserver((entries) => {
      if (entries.getEntriesByName(inputAcceptedMarkName).length > 0 && tryRecordInputAccepted()) {
        observer.disconnect();
        inputAcceptedWaiting = false;
      }
    });
    observer.observe({ type: 'mark', buffered: true });
    return true;
  } catch {
    return false;
  }
};

/**
 * Record `tau.load.input.accepted` from navigation start to the first-input mark, once per document. Called by each
 * surface's bundle side when it first sees its native input. A bundle that runs before the mark exists — before the
 * input's first frame, or while the layout does not draw it — records when the mark is left; where the timeline
 * cannot be observed, it looks once more two frames later, and a later call looks again.
 */
export const recordInputAccepted = (): void => {
  if (tryRecordInputAccepted() || inputAcceptedWaiting) {
    return;
  }
  inputAcceptedWaiting = true;
  if (recordWhenMarked()) {
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      inputAcceptedWaiting = false;
      tryRecordInputAccepted();
    });
  });
};

/** Test seam: let the next {@link recordInputAccepted} record again. */
export const resetInputAcceptedForTest = (): void => {
  inputAcceptedRecorded = false;
  inputAcceptedWaiting = false;
};
