import { APIError } from 'better-auth/api';

/** The refusal's `code`, shared by account creation and sign-in so a client can explain both the same way. */
export const emailDomainNotAllowedCode = 'EMAIL_DOMAIN_NOT_ALLOWED';

/**
 * Whether an address may hold an account under the deployment's allowlist.
 *
 * The domain is everything after the last `@`, compared exactly and without case: `x.tau.new` does not match
 * `tau.new`. Email verification stays required, so naming an allowed domain is not enough to get in.
 *
 * @param email - The account's address.
 * @param allowedDomains - `TAU_AUTH_ALLOWED_EMAIL_DOMAINS`, already lower-cased; empty allows every domain.
 * @returns True when the list is empty or holds the address's domain.
 */
export const isEmailDomainAllowed = (email: string, allowedDomains: readonly string[]): boolean => {
  if (allowedDomains.length === 0) {
    return true;
  }
  const at = email.lastIndexOf('@');
  if (at === -1) {
    return false;
  }
  return allowedDomains.includes(
    email
      .slice(at + 1)
      .trim()
      .toLowerCase(),
  );
};

/**
 * Better Auth's own 403 for an address outside the allowlist; anything else a hook throws answers an empty 500.
 *
 * @returns The error to throw from a database hook.
 */
export const emailDomainNotAllowed = (): APIError =>
  new APIError('FORBIDDEN', {
    code: emailDomainNotAllowedCode,
    message: 'This email domain cannot sign in to this deployment',
  });
