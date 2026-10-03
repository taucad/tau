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
 * Strip every invitation token out of one string.
 *
 * An invitation token is a bearer credential that happens to live in a URL
 * (charter W5, D27): whoever reads it can accept the invitation. Analytics
 * records URLs by design — `history_change` pageviews, autocaptured `href`s,
 * referrers — so the token is removed before an event is queued rather than
 * trusted to stay out of one.
 *
 * @param value - Any string an event carries.
 * @returns The same string with each token replaced by `[redacted]`.
 * @public
 */
export const redactInvitationTokens = (value: string): string =>
  value.replaceAll(
    invitationTokenPattern,
    (_match, lead: string, separator: string) => `${lead}invitations${separator}[redacted]`,
  );
