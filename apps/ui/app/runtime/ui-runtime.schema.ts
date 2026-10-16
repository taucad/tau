import { z } from 'zod';

export const uiRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
  /**
   * The managed acquisition profile (`TAU_ACQUISITION`, X43). `locked` makes the in-browser bundler request nothing:
   * a bare import without `package-lock.json`, or a URL import, is refused with `package-not-locked`.
   */
  acquisition: z.enum(['open', 'locked']).default('open'),
});

export type UiRuntimeConfig = z.output<typeof uiRuntimeConfigSchema>;
