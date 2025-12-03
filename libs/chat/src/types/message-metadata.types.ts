import type z from 'zod';
import type { messageMetadataSchema } from '#schemas/metadata.schema.js';

export type MyMetadata = z.infer<typeof messageMetadataSchema>;
