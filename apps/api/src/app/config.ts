import process from 'node:process';
import { z } from 'zod';

const environmentSchema = z.object({
  /* eslint-disable @typescript-eslint/naming-convention -- environment variables are UPPER_CASED */
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  /* eslint-enable @typescript-eslint/naming-convention -- renabling */
});

export const getEnvironment = () => {
  const result = environmentSchema.safeParse(process.env);

  if (!result.success) {
    const formattedError = result.error.flatten().fieldErrors;
    const errorMessage = `Invalid environment configuration: ${JSON.stringify(formattedError)}`;
    throw new Error(errorMessage);
  }

  return result.data;
};

export type Environment = z.infer<typeof environmentSchema>;
