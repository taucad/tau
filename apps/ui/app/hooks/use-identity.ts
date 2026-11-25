/**
 * The one identity owner (W9 D1, research `w9-desktop-acceptance-defects` R1).
 *
 * The session query answers who is signed in only while the API answers. Offline, an offline-first session query stays
 * pending, and a failed check is not a sign-out: the person who was signed in still is, as far as this device knows.
 * The owner keeps a last-known-good record per API origin (user id, name, email and image, never a token) and reads
 * it before first paint, so an offline launch shows the person instead of "Account" and "Sign in".
 *
 * - `verified`: the session query answered with a user. The record is rewritten.
 * - `signed-out`: the session query answered with no user, or the API answered `401`. The record is cleared.
 * - `unverified`: no answer (pending, paused offline, or failed for a network reason) and a record is held.
 * - `unknown`: no answer and no record.
 *
 * `useResolvedAuth`, the user menu and the billing session read this owner instead of `useSession`.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from '@better-auth-ui/react';
import { z } from 'zod';
import { Topic } from '@taucad/events';
import { authClient } from '#lib/auth-client.js';
import { ENV } from '#environment.config.js';

const identityUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  image: z.string().nullable().optional(),
});

/** The identity fields the owner keeps: never a token. @public */
export type IdentityUser = Readonly<z.infer<typeof identityUserSchema>>;

/** The identity owner's answer. @public */
export type Identity =
  | Readonly<{ state: 'verified'; user: IdentityUser }>
  | Readonly<{ state: 'unverified'; user: IdentityUser }>
  | Readonly<{ state: 'signed-out'; user: undefined }>
  | Readonly<{ state: 'unknown'; user: undefined }>;

/** The storage key prefix of the per-origin identity record. @public */
export const identityRecordPrefix = 'tau:identity:';

const recordKey = (): string | undefined => {
  try {
    return `${identityRecordPrefix}${new URL(ENV.TAU_API_URL).origin}`;
  } catch {
    return undefined;
  }
};

const recordTopic = new Topic<void>({ name: 'tau-identity-record' });
/* The parsed record, by its raw text, so a snapshot read returns the same object until the record changes. */
let cached: Readonly<{
  raw: string | undefined;
  user: IdentityUser | undefined;
}> = { raw: undefined, user: undefined };

const parseRecord = (raw: string | undefined): IdentityUser | undefined => {
  if (raw === undefined) {
    return undefined;
  }
  try {
    const parsed = identityUserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    /* A corrupt record reads as none (brick recovery). */
    return undefined;
  }
};

/**
 * The identity record this device holds for the page's API origin. A corrupt or unreadable record reads as none.
 *
 * @returns The recorded user, or `undefined`.
 * @public
 */
export const readIdentityRecord = (): IdentityUser | undefined => {
  const key = recordKey();
  let raw: string | undefined;
  try {
    raw = key === undefined ? undefined : (globalThis.localStorage.getItem(key) ?? undefined);
  } catch {
    raw = undefined;
  }
  if (raw !== cached.raw) {
    cached = { raw, user: parseRecord(raw) };
  }
  return cached.user;
};

/**
 * Write or clear the identity record. Only the fields the owner keeps are written.
 *
 * @param user - The verified user, or `undefined` to clear the record.
 * @public
 */
export const writeIdentityRecord = (user: IdentityUser | undefined): void => {
  const key = recordKey();
  if (key === undefined) {
    return;
  }
  try {
    if (user === undefined) {
      globalThis.localStorage.removeItem(key);
    } else {
      const { id, name, email, image } = user;
      const next = JSON.stringify({ id, name, email, image: image ?? null });
      if (globalThis.localStorage.getItem(key) === next) {
        return;
      }
      globalThis.localStorage.setItem(key, next);
    }
  } catch {
    /* Storage refused: the owner still answers from the session for this page's life. */
  }
  recordTopic.emit();
};

const subscribe = (listener: () => void): (() => void) => {
  const unsubscribe = recordTopic.subscribe(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === recordKey()) {
      listener();
    }
  };
  globalThis.addEventListener('storage', onStorage);
  return () => {
    unsubscribe();
    globalThis.removeEventListener('storage', onStorage);
  };
};

const noRecord = (): undefined => undefined;

/** What the owner reads from the session query. @public */
export type SessionAnswer = Readonly<{
  data: unknown;
  isSuccess: boolean;
  error: unknown;
}>;

const sessionUserSchema = z.object({ user: identityUserSchema });

const isUnauthorized = (error: unknown): boolean =>
  error !== null && typeof error === 'object' && 'status' in error && error.status === 401;

/**
 * The identity a session answer and a record give.
 *
 * @param session - The session query's data, success and error.
 * @param record - The identity record this device holds.
 * @returns The identity.
 * @public
 */
export const resolveIdentity = (session: SessionAnswer, record: IdentityUser | undefined): Identity => {
  const live = sessionUserSchema.safeParse(session.data);
  if (live.success) {
    return { state: 'verified', user: live.data.user };
  }
  if ((session.isSuccess && (session.data === null || session.data === undefined)) || isUnauthorized(session.error)) {
    return { state: 'signed-out', user: undefined };
  }
  return record === undefined ? { state: 'unknown', user: undefined } : { state: 'unverified', user: record };
};

/**
 * The identity owner: who is signed in, as far as this device knows, before the API answers and while it does not.
 *
 * @returns The identity.
 * @public
 */
export function useIdentity(): Identity {
  const { data, isSuccess, error } = useSession(authClient);
  /* The server and the hydrating render hold no record, so they agree; the record arrives in the next commit. */
  const record = useSyncExternalStore(subscribe, readIdentityRecord, noRecord);
  const identity = resolveIdentity({ data, isSuccess, error }, record);

  /* The record follows the session's answer: rewritten when verified, cleared when signed out, kept otherwise. */
  const verified = identity.state === 'verified' ? JSON.stringify(identity.user) : undefined;
  const isSignedOut = identity.state === 'signed-out';
  useEffect(() => {
    if (verified !== undefined) {
      writeIdentityRecord(identityUserSchema.parse(JSON.parse(verified)));
    } else if (isSignedOut) {
      writeIdentityRecord(undefined);
    }
  }, [isSignedOut, verified]);

  return identity;
}
