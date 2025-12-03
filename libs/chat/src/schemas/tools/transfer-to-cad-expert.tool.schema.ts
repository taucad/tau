import type { z } from 'zod';
import { transferToolInputSchema, transferToolOutputSchema } from '#schemas/tools/transfer-tool.schema.js';

export const transferToCadExpertInputSchema = transferToolInputSchema;
export const transferToCadExpertOutputSchema = transferToolOutputSchema;

export type TransferToCadExpertInput = z.infer<typeof transferToCadExpertInputSchema>;
export type TransferToCadExpertOutput = z.infer<typeof transferToCadExpertOutputSchema>;
