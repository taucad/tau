import type { getSession } from 'better-auth/api';

export type UserSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getSession>>>>;
