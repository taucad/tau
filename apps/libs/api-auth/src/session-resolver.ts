/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { createHash } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Auth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import { MetricsService } from '@taucad/api-observability/metrics';
import type { AuthSessionResolutionAttributes } from '@taucad/api-observability/metrics';
import { authInstanceKey } from '#auth.constant.js';
import type { AuthSession, AuthUser } from '#auth.type.js';

/** One request's credentials, as the resolver sees them. */
export type SessionLookup = {
  /** `FastifyRequest.headers` or `IncomingMessage.headers`. */
  readonly headers: IncomingHttpHeaders;
  /** Upper case; `'GET'` for a WebSocket upgrade. */
  readonly method: string;
  /** The caller demands a store read: gateways, `@AuthoritativeSession()`. */
  readonly authoritative?: boolean;
};

/** How a session was read. `cached` honours a session snapshot; `authoritative` reads the store. */
export type SessionReadMode = 'cached' | 'authoritative';

/** The outcome of one {@link SessionResolver.resolve} call. Deep-frozen. */
export type SessionResolution = Readonly<{
  /** `null` means unauthenticated. */
  // oxlint-disable-next-line typescript/no-restricted-types -- the blueprint's contract: null is unauthenticated, as Better Auth returns it.
  session: AuthSession | null;
  // oxlint-disable-next-line typescript/no-restricted-types -- as above.
  user: AuthUser | null;
  /** Better Auth's `Set-Cookie` entries, in order, unfiltered. */
  setCookies: readonly string[];
  mode: SessionReadMode;
  coalesced: boolean;
}>;

/** The one definition of "has Authorization", used by the resolver, the cookie policy and forwardToAuth. */
export const hasAuthorizationHeader = (headers: IncomingHttpHeaders): boolean => headers.authorization !== undefined;

const safe = (method: string): boolean => method === 'GET' || method === 'HEAD';

/**
 * The read mode of a lookup, from the method, the presence of `Authorization` and the caller's
 * demand only. No cookie is parsed to decide it.
 *
 * @param lookup - The request's credentials.
 * @returns `cached` for a safe method without `Authorization` the caller did not mark authoritative.
 */
export const modeOf = (lookup: SessionLookup): SessionReadMode =>
  lookup.authoritative !== true && !hasAuthorizationHeader(lookup.headers) && safe(lookup.method)
    ? 'cached'
    : 'authoritative';

/** Whether a lookup may start or join a shared in-flight lookup: header presence only, no parse. */
const sharable = (lookup: SessionLookup): boolean =>
  lookup.authoritative !== true &&
  safe(lookup.method) &&
  (lookup.headers.cookie !== undefined || lookup.headers.authorization !== undefined);

/** SHA-256 of a length-prefixed tuple, so the raw credential is never a map key. */
const flightKey = (mode: SessionReadMode, cookie: string | undefined, authorization: string | undefined): string => {
  const hash = createHash('sha256').update(mode);
  for (const value of [cookie ?? '', authorization ?? '']) {
    hash.update(`${Buffer.byteLength(value)}:`).update(value);
  }
  return hash.digest('hex');
};

const credentialOf = (lookup: SessionLookup): AuthSessionResolutionAttributes['credential'] => {
  if (hasAuthorizationHeader(lookup.headers)) {
    return 'authorization';
  }
  return lookup.headers.cookie === undefined ? 'none' : 'cookie';
};

/**
 * Freezes a resolution and the objects it carries, so callers that share one cannot change it for another.
 *
 * @param resolution - The resolution to freeze.
 * @returns The same values, frozen.
 */
export const freezeResolution = (resolution: SessionResolution): SessionResolution =>
  Object.freeze({
    ...resolution,
    session: resolution.session === null ? null : Object.freeze(resolution.session),
    user: resolution.user === null ? null : Object.freeze(resolution.user),
    setCookies: Object.freeze([...resolution.setCookies]),
  });

type Flight = { readonly startedAt: number; readonly promise: Promise<SessionResolution> };

/** Milliseconds. A request does not join a flight older than this; it starts a new one. */
const joinWindow = 250;

/**
 * The only caller of Better Auth's `getSession` for Tau routes and WebSocket upgrades.
 *
 * Concurrent `GET`/`HEAD` lookups that present the same credentials share one store read
 * (single-flight). Nothing is kept after a lookup settles, so this is not a cache.
 */
@Injectable()
export class SessionResolver {
  private readonly flights = new Map<string, Flight>();

  public constructor(
    @Inject(authInstanceKey) private readonly auth: Auth,
    @Optional() @Inject(MetricsService) private readonly metrics: MetricsService = new MetricsService(),
  ) {}

  /**
   * Resolves the session a request presents.
   *
   * @param l - The request's credentials.
   * @returns The frozen resolution; unauthenticated when the session is missing or was deleted mid-refresh.
   */
  public async resolve(l: SessionLookup): Promise<SessionResolution> {
    const mode = modeOf(l);
    try {
      if (!sharable(l)) {
        return this.count(l, await this.lookup(l, mode));
      }
      const key = flightKey(mode, l.headers.cookie, l.headers.authorization);
      const current = this.flights.get(key);
      if (current !== undefined && Date.now() - current.startedAt <= joinWindow) {
        try {
          return this.count(l, freezeResolution({ ...(await current.promise), coalesced: true }));
        } catch {
          // A joiner retries once by itself, so one refused connection does not fail every joiner.
          return this.count(l, await this.lookup(l, mode));
        }
      }
      const flight: Flight = { startedAt: Date.now(), promise: this.lookup(l, mode) };
      this.flights.set(key, flight);
      const remove = (): void => {
        // Compare-and-delete: a newer flight that replaced this one stays.
        if (this.flights.get(key) === flight) {
          this.flights.delete(key);
        }
      };
      // Not `.finally()`: that would derive a promise whose rejection nobody handles. The
      // leader awaits the flight below, so its settlement is observed there.
      // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- compare-and-delete on settlement, with no derived rejection.
      void flight.promise.then(remove, remove);
      return this.count(l, await flight.promise);
    } catch (error) {
      this.record(l, { mode, outcome: 'error', coalesced: false });
      throw error;
    }
  }

  private async lookup(l: SessionLookup, mode: SessionReadMode): Promise<SessionResolution> {
    try {
      const { response, headers } = await this.auth.api.getSession({
        headers: fromNodeHeaders(l.headers),
        query: mode === 'authoritative' ? { disableCookieCache: true } : undefined,
        returnHeaders: true,
      });
      return freezeResolution({
        session: response?.session ?? null,
        user: response?.user ?? null,
        setCookies: headers.getSetCookie(),
        mode,
        coalesced: false,
      });
    } catch (error) {
      // A concurrent delete during the 24 h refresh: unauthenticated, not a failure.
      if (error instanceof APIError && error.status === 'UNAUTHORIZED') {
        return freezeResolution({ session: null, user: null, setCookies: [], mode, coalesced: false });
      }
      throw error;
    }
  }

  private count(l: SessionLookup, resolution: SessionResolution): SessionResolution {
    this.record(l, {
      mode: resolution.mode,
      outcome: resolution.session === null ? 'unauthenticated' : 'authenticated',
      coalesced: resolution.coalesced,
    });
    return resolution;
  }

  private record(
    l: SessionLookup,
    {
      mode,
      outcome,
      coalesced,
    }: { mode: SessionReadMode; outcome: AuthSessionResolutionAttributes['outcome']; coalesced: boolean },
  ): void {
    this.metrics.authSessionResolutions.add(1, {
      mode,
      credential: credentialOf(l),
      outcome,
      coalesced: coalesced ? 'true' : 'false',
    } satisfies AuthSessionResolutionAttributes);
  }
}
