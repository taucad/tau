import { QueryClient } from '@tanstack/react-query';

/** Dedicated client shared by billing hooks and settlement invalidation. */
export const billingQueryClient = new QueryClient();
