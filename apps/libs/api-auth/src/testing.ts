/**
 * Test doubles for `@taucad/api-auth`. Test code only; a lint rule keeps this subpath out of
 * production source.
 */
import type { Auth } from 'better-auth';
import type { AuthSession, AuthUser } from '#auth.type.js';
import { modeOf, SessionResolver } from '#session-resolver.js';
import type { SessionLookup, SessionResolution } from '#session-resolver.js';

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
