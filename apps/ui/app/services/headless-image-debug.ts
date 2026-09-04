import { ENV } from '#environment.config.js';

export type HeadlessImageDebugRecord = Readonly<{
  name: string;
  startTime: number;
  duration: number;
  detail: Readonly<Record<string, unknown>>;
}>;

type HeadlessImageDebugBridge = {
  readonly records: HeadlessImageDebugRecord[];
  reset(): void;
};

const maximumRecords = 512;

/**
 * The bridge is a document-host surface: only a page carries the injected
 * `window.ENV` the flag lives in, and only a page can be read back for it
 * (`headless-chat-image-capture.spec.ts` evaluates
 * `__TAU_HEADLESS_IMAGE_DEBUG__` in the document). A worker has neither, and
 * `ENV` throws there — its facade treats "no `window`" as "node", so it
 * dereferences `process.env`. The capture path runs in the agent-host worker
 * since W3-CUT, so this gate is what keeps a diagnostic from failing the work
 * it measures.
 */
// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- globalThis.window is absent in workers and during SSR.
const isDebugEnabled = (): boolean => Boolean(globalThis.window) && ENV.TAU_DEBUG;

const getBridge = (): HeadlessImageDebugBridge => {
  const state = globalThis as typeof globalThis & {
    __TAU_HEADLESS_IMAGE_DEBUG__?: HeadlessImageDebugBridge;
  };
  state.__TAU_HEADLESS_IMAGE_DEBUG__ ??= {
    records: [],
    reset() {
      this.records.splice(0);
    },
  };
  return state.__TAU_HEADLESS_IMAGE_DEBUG__;
};

/** Add one bounded capture timing record only in TAU_DEBUG builds. */
export const recordHeadlessImageTiming = (
  name: string,
  startTime: number,
  detail: Readonly<Record<string, unknown>> = {},
): void => {
  if (!isDebugEnabled()) {
    return;
  }
  const bridge = getBridge();
  bridge.records.push({ name, startTime, duration: performance.now() - startTime, detail });
  if (bridge.records.length > maximumRecords) {
    bridge.records.splice(0, bridge.records.length - maximumRecords);
  }
};
