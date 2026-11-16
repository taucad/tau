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
 * A sign-in credential carried as a query parameter, plain or percent-encoded.
 *
 * Magic-link, password-reset and email-verification pages read `?token=`, OAuth
 * callbacks read `?code=`, and the CLI device flow reads `?user_code=`. The value
 * ends at the next parameter (`&` or `%26`), the fragment, or whitespace and quotes,
 * so the same pass covers a bare URL and one nested inside `?redirectTo=`.
 */
const queryCredentialPattern = /([?&]|%3F|%26)(token|code|user_code)(=|%3D)(?:(?!%26)[^&#\s"'])+/giu;

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
