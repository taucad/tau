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
  if (!ENV.TAU_DEBUG) {
    return;
  }
  const bridge = getBridge();
  bridge.records.push({ name, startTime, duration: performance.now() - startTime, detail });
  if (bridge.records.length > maximumRecords) {
    bridge.records.splice(0, bridge.records.length - maximumRecords);
  }
};
