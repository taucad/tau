import { z } from 'zod';

export const uiRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
  /**
   * The managed acquisition profile (`TAU_ACQUISITION`, X43). `locked` makes the in-browser bundler request nothing:
   * a bare import without `package-lock.json`, or a URL import, is refused with `package-not-locked`.
   */
  acquisition: z.enum(['open', 'locked']).default('open'),
  /**
   * Whether the page runs on a coarse-pointer or low-memory device (`isMemoryConstrainedDevice`). Read on the page,
   * because a worker has no `matchMedia`; the runtime worker budgets its kernels for a phone from it.
   */
  memoryConstrained: z.boolean().default(false),
});

export type UiRuntimeConfig = z.output<typeof uiRuntimeConfigSchema>;
