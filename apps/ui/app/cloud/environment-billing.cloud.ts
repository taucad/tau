import { z } from 'zod';

export const cloudEnvironmentShape = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variable name
  TAU_BILLING_ENVIRONMENT: z.enum(['development', 'staging', 'prod-us', 'prod-eu']).optional(),
};
export const cloudClientEnvironmentKeys = ['TAU_BILLING_ENVIRONMENT'] as const;
