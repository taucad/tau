import { z } from 'zod';
import { defaultPicogkRecycleHeapBytes } from '#picogk-browser-memory.js';

/** Options for PicoGK's isolated browser runtime. @public */
export const picogkBrowserOptionsSchema = z.strictObject({
  /** Select an available execution mode; multi requires cross-origin isolation. */
  wasm: z.enum(['auto', 'single', 'multi']).default('auto'),
  /** Recycle the worker after delivery when its WASM heap exceeds this many bytes. */
  recycleHeapBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(defaultPicogkRecycleHeapBytes),
  /** A host-prepared immutable manifest. Preparation is separate from model execution. */
  assets: z
    .strictObject({
      url: z.string().min(1),
      sha256: z.string().regex(/^[a-f\d]{64}$/u),
    })
    .optional(),
});

/** Browser registration inputs; omitted fields use their schema defaults. @public */
export type PicogkBrowserOptions = z.input<typeof picogkBrowserOptionsSchema>;
