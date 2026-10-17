/**
 * The loopback hand-off (charter S32, ruling X54): how a page on another origin is admitted to this daemon.
 *
 * A browser cannot present the daemon's token across origins: it cannot set `Authorization` on a WebSocket, and the
 * `HttpOnly` cookie the served UI is handed belongs to the daemon's own origin. So the token holder (`tau open`, with
 * the token it minted) asks for a **code**: single-use, short-lived, and good for nothing but one redemption. The
 * code travels in a link (`tau://host/<origin>?code=…` to Tau Desktop, or a fragment on a listed website), and the
 * page redeems it from a listed origin for a **session**, bound to that origin, which the page presents on its
 * `/agent` upgrade as a WebSocket subprotocol. A URL never carries the session, and a redeemed or expired code admits
 * nothing.
 *
 * @module
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a minted code may wait to be redeemed, in milliseconds. */
export const handOffCodeLifetime = 60_000;

/** At most this many codes wait unredeemed; minting another drops the oldest. */
const outstandingCodeLimit = 16;

/** At most this many redeemed sessions are admitted; redeeming another drops the oldest. */
const sessionLimit = 64;

/** The subprotocol an admitted page asks for; the server always answers with this one. @internal */
export const agentSubprotocol = 'tau-agent';

/** The prefix of the subprotocol that carries a redeemed session on the `/agent` upgrade. @internal */
export const sessionSubprotocolPrefix = 'tau-session.';

/** A minted code and when it stops being redeemable (epoch milliseconds). @internal */
export type HandOffCode = Readonly<{ code: string; expiresAt: number }>;

/** The daemon's codes and the sessions they were redeemed for. @internal */
export type LoopbackHandOff = {
  /** Mint one code. */
  mint(): HandOffCode;
  /**
   * Redeem a code from a page origin, once.
   *
   * @param code - The code the page was handed.
   * @param origin - The redeeming page's `Origin`, which the session is bound to.
   * @returns The session, or `undefined` when the code is unknown, already redeemed or expired.
   */
  redeem(code: string, origin: string): string | undefined;
  /**
   * Whether a session admits an upgrade from this origin.
   *
   * @param session - The session the page presented.
   * @param origin - The upgrade's `Origin`.
   * @returns `true` only for a redeemed session presented from the origin that redeemed it.
   */
  admits(session: string, origin: string | undefined): boolean;
};

/* Codes and sessions are looked up by digest, so a lookup's timing says nothing about the secret's bytes. */
const digestOf = (secret: string): string => createHash('sha256').update(secret).digest('base64url');

/**
 * Create the daemon's hand-off book.
 *
 * @param options - The clock and code lifetime, for tests.
 * @returns The {@link LoopbackHandOff}.
 * @internal
 */
export const createLoopbackHandOff = (
  options: { readonly now?: () => number; readonly codeLifetime?: number } = {},
): LoopbackHandOff => {
  const now = options.now ?? Date.now;
  const codeLifetime = options.codeLifetime ?? handOffCodeLifetime;
  /* Insertion order is age order, so the first key is the oldest. */
  const codes = new Map<string, number>();
  const sessions = new Map<string, string>();

  const evictOldest = (book: Map<string, unknown>, limit: number): void => {
    while (book.size > limit) {
      const [oldest] = book.keys();
      book.delete(oldest!);
    }
  };

  return {
    mint: () => {
      const issued = now();
      for (const [digest, expiresAt] of codes) {
        if (expiresAt <= issued) {
          codes.delete(digest);
        }
      }
      const code = randomBytes(32).toString('base64url');
      const expiresAt = issued + codeLifetime;
      codes.set(digestOf(code), expiresAt);
      evictOldest(codes, outstandingCodeLimit);
      return { code, expiresAt };
    },
    redeem: (code, origin) => {
      const digest = digestOf(code);
      const expiresAt = codes.get(digest);
      /* Spent on the first attempt, valid or late: a code is never redeemable twice. */
      codes.delete(digest);
      if (expiresAt === undefined || expiresAt <= now()) {
        return undefined;
      }
      const session = randomBytes(32).toString('base64url');
      sessions.set(digestOf(session), origin);
      evictOldest(sessions, sessionLimit);
      return session;
    },
    admits: (session, origin) => {
      const bound = sessions.get(digestOf(session));
      if (bound === undefined || origin === undefined) {
        return false;
      }
      const boundBytes = Buffer.from(bound);
      const originBytes = Buffer.from(origin);
      return boundBytes.byteLength === originBytes.byteLength && timingSafeEqual(boundBytes, originBytes);
    },
  };
};

/**
 * The session a page offered on its upgrade, from `Sec-WebSocket-Protocol`.
 *
 * @param header - The request's `sec-websocket-protocol` header.
 * @returns The session, or `''` when none was offered.
 * @internal
 */
export const sessionOfSubprotocols = (header: string | undefined): string => {
  for (const offered of header?.split(',') ?? []) {
    const value = offered.trim();
    if (value.startsWith(sessionSubprotocolPrefix)) {
      return value.slice(sessionSubprotocolPrefix.length);
    }
  }
  return '';
};
