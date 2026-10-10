/** Upper bounds a reader may ask for: rows per batch, and serialized bytes per batch. @public */
export const agentWireLimits = { batchRows: 16, batchBytes: 1_048_576 } as const;
