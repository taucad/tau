import type { getSession } from 'better-auth/api';

type UserSession = NonNullable<Awaited<ReturnType<ReturnType<typeof getSession>>>>;

export type AuthUser = UserSession['user'];
