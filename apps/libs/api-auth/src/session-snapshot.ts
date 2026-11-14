import type { Auth } from 'better-auth';

const unprefixed = (name: string): string => name.replace(/^__(?:secure|host)-/iu, '').toLowerCase();

/**
 * The `Cookie` header without the session snapshot or any of its chunks, re-serialized canonically.
 *
 * Every piece is parsed with the wider of Better Auth's two cookie parsers' rules (`String.prototype.trim`), and the
 * snapshot name is matched with any `__Secure-`/`__Host-` prefix and in any ASCII case, so this only over-matches.
 * Pieces without `=` or with an empty name are dropped; every other pair survives in order. Callers write the result
 * back even when it is empty: Better Auth's origin check runs only when a `cookie` header is present.
 *
 * @param cookieHeader - The request's `Cookie` header, attacker-controlled.
 * @param sessionDataName - Better Auth's snapshot cookie name (`authCookies.sessionData.name`).
 * @returns The canonical header, possibly `''`.
 */
export const stripSessionSnapshot = (cookieHeader: string, sessionDataName: string): string => {
  const target = unprefixed(sessionDataName);
  const kept: string[] = [];
  for (const piece of cookieHeader.split(';')) {
    const equals = piece.indexOf('=');
    if (equals === -1) {
      continue;
    }
    const name = piece.slice(0, equals).trim();
    if (name === '') {
      continue;
    }
    const base = unprefixed(name);
    if (base === target || base.startsWith(`${target}.`)) {
      continue;
    }
    kept.push(`${name}=${piece.slice(equals + 1).trim()}`);
  }
  return kept.join('; ');
};

/**
 * The name Better Auth gives the session snapshot cookie for this instance (`__Secure-` prefixed over HTTPS).
 *
 * @param auth - The Better Auth instance.
 * @returns The snapshot cookie name.
 */
export const sessionDataNameOf = async (auth: Pick<Auth, '$context'>): Promise<string> => {
  const context = await auth.$context;
  return context.authCookies.sessionData.name;
};
