/**
 * Test doubles for `@taucad/api-auth`. Test code only; a lint rule keeps this subpath out of
 * production source.
 */
import type { Auth } from 'better-auth';
import { authInstanceKey as instanceKey } from '#auth.constant.js';
import type { AuthSession, AuthUser } from '#auth.type.js';
import { modeOf, SessionResolver } from '#session-resolver.js';
import type { SessionLookup, SessionResolution } from '#session-resolver.js';

/** The Better Auth instance token, for tests that mount the real `AuthModule` with a supplied instance. */
export const authInstanceKey: typeof instanceKey = instanceKey;

/** What a fake resolver answers for one lookup: a session, or `null` for unauthenticated. */
// oxlint-disable-next-line typescript/no-restricted-types -- mirrors SessionResolution, where null means unauthenticated.
export type FakeSession = { readonly session: AuthSession; readonly user: AuthUser } | null;

/** How a test answers lookups; a `vi.fn<FakeSessionLookup>()` fits it. */
export type FakeSessionLookup = (lookup: SessionLookup) => Promise<FakeSession>;

/** Never reached: the fake overrides every member that would touch the instance. */
const unreachableInstance = Object.create(null) as Auth;

class FakeSessionResolver extends SessionResolver {
  public constructor(private readonly answer: (lookup: SessionLookup) => FakeSession | Promise<FakeSession>) {
    super(unreachableInstance);
  }

  public override async sessionDataName(): Promise<string> {
    return 'tau.session_data';
  }

  public override maxAgeSeconds(): number {
    return 0;
  }

  public override async resolve(lookup: SessionLookup): Promise<SessionResolution> {
    const found = await this.answer(lookup);
    // Frozen at the top only: test sessions are often mocks, which cannot be frozen.
    return Object.freeze({
      session: found?.session ?? null,
      user: found?.user ?? null,
      setCookies: Object.freeze([]),
      mode: modeOf(lookup),
      coalesced: false,
    });
  }
}

/**
 * A {@link SessionResolver} that answers from `find`, with no cookies, the real read mode and no sharing.
 *
 * @param find - Returns the session for a lookup, or `null`.
 * @returns A resolver to provide under `SessionResolver`.
 */
export const fakeSessionResolver = (
  find: (lookup: SessionLookup) => FakeSession | Promise<FakeSession>,
): SessionResolver => new FakeSessionResolver(find);

const rawShapes = (
  n: string,
  t: string,
): ReadonlyArray<{ readonly header: string; readonly survivors: readonly string[] }> => [
  { header: `a=1;${n}=J;${t}=t`, survivors: ['a=1', `${t}=t`] },
  { header: `a=1;\t${n}=J;   ${t}=t`, survivors: ['a=1', `${t}=t`] },
  { header: ` ${n}=J; ${t}=t`, survivors: [`${t}=t`] },
  { header: ` ${t}=t; ${n}=J`, survivors: [`${t}=t`] },
  { header: `${n}=J; ${n}=x; ${t}=t`, survivors: [`${t}=t`] },
  { header: `${n}=x; ${n}=J; ${t}=t`, survivors: [`${t}=t`] },
  { header: `${n}.0=J; ${n}.1=K; ${n}.99=L; ${t}=t`, survivors: [`${t}=t`] },
  {
    header: `tau.session_data=J; __Secure-tau.session_data=J; __Host-tau.session_data=J; ${t}=t`,
    survivors: [`${t}=t`],
  },
  { header: `__secure-TAU.SESSION_DATA=J; ${t}=t`, survivors: [`${t}=t`] },
  { header: `${n}="J"; ${t}=t`, survivors: [`${t}=t`] },
  { header: `junk; ${n}=J`, survivors: [] },
  { header: `=x; ${n}=J`, survivors: [] },
  { header: `${n}=J`, survivors: [] },
  { header: `a=1; \u00A0${n}=J; ${t}=t`, survivors: ['a=1', `${t}=t`] },
  // `String.prototype.trim` removes U+00A0, so the token survives under its own name.
  { header: `a=1; ${n}=J; \u00A0${t}=t`, survivors: ['a=1', `${t}=t`] },
];

/** WP2's adversarial header shapes, with `N` the snapshot and `T` the token, and the pairs that must survive. */
export const snapshotHeaderShapes = (
  n: string,
  t: string,
  values?: { readonly data: string; readonly token: string },
): ReadonlyArray<{ readonly header: string; readonly survivors: readonly string[] }> => {
  const { data, token } = values ?? { data: 'J', token: 't' };
  return rawShapes(n, t).map(({ header, survivors }) => ({
    header: header.replaceAll('=J', `=${data}`).replaceAll('="J"', `="${data}"`).replaceAll('=t', `=${token}`),
    survivors: survivors.map((pair) => pair.replace(/=t$/u, `=${token}`)),
  }));
};

/** True when a parsed name is the snapshot or one of its chunks, with any prefix and in any case. */
export const isSnapshotName = (name: string, n: string): boolean => {
  const base = name.replace(/^__(?:secure|host)-/iu, '').toLowerCase();
  const target = n.replace(/^__(?:secure|host)-/iu, '').toLowerCase();
  return base === target || base.startsWith(`${target}.`);
};
