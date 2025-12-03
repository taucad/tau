import { z } from 'zod';

/**
 * Shared schema for transfer tools (handoff between agents).
 * Transfer tools have no input parameters and return a string result.
 * Using strict() to ensure the partial type is correctly narrowed.
 */
export const transferToolInputSchema = z.object({}).strict();
export const transferToolOutputSchema = z.string();

export type TransferToolInput = z.infer<typeof transferToolInputSchema>;
export type TransferToolOutput = z.infer<typeof transferToolOutputSchema>;
