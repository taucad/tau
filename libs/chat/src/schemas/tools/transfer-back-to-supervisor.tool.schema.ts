import type { z } from 'zod';
import { transferToolInputSchema, transferToolOutputSchema } from '#schemas/tools/transfer-tool.schema.js';

export const transferBackToSupervisorInputSchema = transferToolInputSchema;
export const transferBackToSupervisorOutputSchema = transferToolOutputSchema;

export type TransferBackToSupervisorInput = z.infer<typeof transferBackToSupervisorInputSchema>;
export type TransferBackToSupervisorOutput = z.infer<typeof transferBackToSupervisorOutputSchema>;
