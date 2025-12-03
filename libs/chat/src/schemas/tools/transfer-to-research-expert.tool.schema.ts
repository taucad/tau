import type { z } from 'zod';
import { transferToolInputSchema, transferToolOutputSchema } from '#schemas/tools/transfer-tool.schema.js';

export const transferToResearchExpertInputSchema = transferToolInputSchema;
export const transferToResearchExpertOutputSchema = transferToolOutputSchema;

export type TransferToResearchExpertInput = z.infer<typeof transferToResearchExpertInputSchema>;
export type TransferToResearchExpertOutput = z.infer<typeof transferToResearchExpertOutputSchema>;
