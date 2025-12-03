import type z from 'zod';
import type { dataPartSchema } from '#schemas/message-data.schema.js';

export type MyDataPart = z.infer<typeof dataPartSchema>;
