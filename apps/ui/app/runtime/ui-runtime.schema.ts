import { z } from 'zod';

export const uiRuntimeConfigSchema = z.object({
  tauApiUrl: z.url(),
  tauWebSocketUrl: z.url(),
});

export type UiRuntimeConfig = z.output<typeof uiRuntimeConfigSchema>;
