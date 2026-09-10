import type { ConverterRuntimeClient } from '#routes/convert/converter-runtime.definition.js';

export type ConverterOperationGeneration = { current: number };

export const beginConverterOperation = (generation: ConverterOperationGeneration): (() => boolean) => {
  const operation = ++generation.current;
  return () => generation.current === operation;
};

/** Keep an asynchronously created converter client only while its owning effect is active. */
export const createActiveConverterClient = async (
  createClient: () => Promise<ConverterRuntimeClient>,
  isActive: () => boolean,
): Promise<ConverterRuntimeClient | undefined> => {
  const client = await createClient();
  if (isActive()) {
    return client;
  }
  client.terminate();
  return undefined;
};
