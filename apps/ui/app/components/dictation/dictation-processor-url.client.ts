import processorUrl from '#components/dictation/dictation-processor.js?worker&url';

/**
 * The dictation AudioWorklet module's URL. A `.client` module: React Router replaces its exports with `undefined` in
 * the server build, so the server graph never builds the worklet bundle (React Router 8 migration RR0, RD8). Only
 * `captureDictation` reads it, in the browser.
 */
export const dictationProcessorUrl: string = processorUrl;
