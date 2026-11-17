/**
 * An invitation path and the token that follows it, plain or percent-encoded.
 *
 * The separator is captured rather than assumed so one pass covers both forms:
 * `/invitations/<token>` as it appears in `$current_url` and `$pathname`, and
 * `%2Finvitations%2F<token>` as the sign-in round trip carries it back inside
 * `?redirectTo=`. A token is 32 random bytes in base64url, so its characters are
 * exactly the ones excluded here from ending it.
 */
const invitationTokenPattern = /(\/|%2F)invitations(\/|%2F)[^/?#&%\s"']+/giu;

/**
 * One parameter name as a browser's `URLSearchParams` would read it: every
 * character either literal or percent-encoded, once (`%74oken`) or, inside an
 * encoded `?redirectTo=`, twice (`%2574oken`). A page reads `?%74oken=` as
 * `token`, so a pattern that knew only the literal spelling would let a live
 * credential through.
 *
 * @param name - The decoded parameter name.
 * @returns A pattern source matching every spelling of it.
 */
const anySpelling = (name: string): string =>
  [...name]
    .map((character) => {
      const hex = character.codePointAt(0)!.toString(16).padStart(2, '0');
      return `(?:${character}|%(?:25)?${hex})`;
    })
    .join('');

/**
 * A sign-in credential carried as a query parameter, plain or percent-encoded.
 *
 * Magic-link, password-reset and email-verification pages read `?token=`, OAuth
 * callbacks read `?code=`, and the CLI device flow reads `?user_code=`. The value
 * ends at the next parameter (`&` or `%26`), the fragment, or whitespace and quotes,
 * so the same pass covers a bare URL and one nested inside `?redirectTo=`.
 */
const queryCredentialPattern = new RegExp(
  `([?&]|%3F|%26)(${['token', 'code', 'user_code'].map((name) => anySpelling(name)).join('|')})(=|%3D)(?:(?!%26)[^&#\\s"'])+`,
  'giu',
);

/**
 * Strip every credential that lives in a URL out of one string.
 *
 * Invitation tokens (charter W5, D27) and sign-in tokens are bearer credentials:
 * whoever reads one can accept the invitation or complete the sign-in. Analytics
 * and error reporting record URLs by design — `history_change` pageviews,
 * autocaptured `href`s, referrers, replay metadata — so the credential is removed
 * before an event is queued rather than trusted to stay out of one.
 *
 * @param value - Any string an event carries.
 * @returns The same string with each credential replaced by `[redacted]`.
 * @public
 */
export const redactUrlCredentials = (value: string): string =>
  value
    .replaceAll(invitationTokenPattern, '$1invitations$2[redacted]')
    .replaceAll(queryCredentialPattern, '$1$2$3[redacted]');

/**
 * Whether a URL carries a credential `redactUrlCredentials` would remove.
 *
 * Redaction cleans a URL once it is inside an event; this answers the earlier
 * question of whether to record a page at all. A replay serialises the whole
 * document, and the browser resolves every relative `href` (`#main`,
 * `#home-composer-end`) against the address bar, so a page whose own URL holds a
 * token leaks it through attributes no event hook sees. One predicate, built on
 * the same patterns, keeps the two answers from drifting apart: a URL already
 * redacted carries nothing, and so reads as clean.
 *
 * @param value - A URL, a path with its query and fragment, or any string.
 * @returns `true` when the value holds an invitation token or a sign-in credential.
 * @public
 */
export const urlCarriesCredential = (value: string): boolean => redactUrlCredentials(value) !== value;
