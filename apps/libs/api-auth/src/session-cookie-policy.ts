/** One `Set-Cookie` list to filter, and where it is going. */
export type SessionCookiePolicyInput = {
  readonly setCookies: readonly string[];
  /** A guard on a Tau route, or `forwardToAuth`. */
  readonly surface: 'tau' | 'auth';
  /** `hasAuthorizationHeader(request.headers)`. */
  readonly hasAuthorization: boolean;
  readonly sessionDataName: string;
  /** The flag; 0 = cache disabled. */
  readonly maxAgeSeconds: number;
};

/** Bytes. A forwarded snapshot stays below one cookie; Better Auth starts chunking near 4,050. */
export const snapshotByteBudget = 3072;

const nameOf = (entry: string): string => {
  const equals = entry.indexOf('=');
  return equals === -1 ? entry : entry.slice(0, equals);
};

const maxAgeOf = (entry: string): number | undefined => {
  for (const attribute of entry.split(';').slice(1)) {
    const match = /^\s*max-age\s*=\s*(-?\d+)\s*$/iu.exec(attribute);
    if (match?.[1] !== undefined) {
      return Number.parseInt(match[1], 10);
    }
  }
  return undefined;
};

/**
 * Filters Better Auth's `Set-Cookie` entries for one response. It only drops entries; it never reorders.
 *
 * A Tau route forwards one thing at most: an unchunked `session_data` with exactly the configured `Max-Age`
 * (or its expiry), never to a request that carried `Authorization`, and nothing at all while the flag is 0.
 * It never sets or clears `session_token`. On `/v1/auth/*` every entry outside the snapshot family passes
 * unchanged, and the snapshot family obeys the same rule.
 *
 * @param input - The entries, the surface and the configuration.
 * @returns The entries to send, in Better Auth's order.
 */
export const sessionCookiePolicy = (input: SessionCookiePolicyInput): readonly string[] => {
  const { setCookies, surface, hasAuthorization, sessionDataName, maxAgeSeconds } = input;
  if (surface === 'tau' && maxAgeSeconds === 0) {
    return [];
  }
  const inFamily = (name: string): boolean => name === sessionDataName || name.startsWith(`${sessionDataName}.`);
  const admissible = (entry: string): boolean => {
    if (nameOf(entry) !== sessionDataName || hasAuthorization) {
      return false;
    }
    const maxAge = maxAgeOf(entry);
    return (
      maxAge === 0 || (maxAgeSeconds > 0 && maxAge === maxAgeSeconds && Buffer.byteLength(entry) <= snapshotByteBudget)
    );
  };
  return setCookies.filter((entry) => {
    if (inFamily(nameOf(entry))) {
      return admissible(entry);
    }
    return surface === 'auth';
  });
};

/**
 * Whether Better Auth issued a snapshot the policy drops for size alone, so the caller can log it.
 *
 * @param setCookies - Better Auth's entries.
 * @param sessionDataName - The snapshot cookie name.
 * @returns True when an unchunked snapshot over the budget, or a chunked one, was issued.
 */
export const issuedOversizeSnapshot = (setCookies: readonly string[], sessionDataName: string): boolean =>
  setCookies.some((entry) => {
    const name = nameOf(entry);
    const issued = maxAgeOf(entry) !== 0;
    return (
      issued &&
      (name.startsWith(`${sessionDataName}.`) ||
        (name === sessionDataName && Buffer.byteLength(entry) > snapshotByteBudget))
    );
  });
