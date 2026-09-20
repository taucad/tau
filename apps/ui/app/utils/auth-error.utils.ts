/**
 * `BetterFetchError.error` is typed `any` upstream (`@better-fetch/fetch`), so every
 * `error.error?.message ?? error.message` read leaks `any` into the UI. Duck-type the
 * body once here and let the auth surfaces consume a `string`.
 */

/**
 * Reads the server-sent message out of a `BetterFetchError` body
 * (e.g. `"You can't unlink your last account"`).
 *
 * @param error - The rejection a Better Auth mutation or query produced.
 * @returns The body's `message` when it is a string, otherwise `undefined`.
 */
export const betterFetchErrorBodyMessage = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = (error as { error?: unknown }).error;
  if (!candidate || typeof candidate !== 'object' || !('message' in candidate)) {
    return undefined;
  }
  const { message } = candidate as { message?: unknown };
  return typeof message === 'string' ? message : undefined;
};

/**
 * The sentence to show a person for a failed auth call.
 *
 * @param error - The rejection a Better Auth mutation or query produced.
 * @returns The server's own message, falling back to the outer `Error.message`.
 */
export const authErrorMessage = (error: Error): string => betterFetchErrorBodyMessage(error) ?? error.message;

/**
 * Reads the server-sent error code out of a `BetterFetchError` body
 * (e.g. `"EMAIL_NOT_VERIFIED"`).
 *
 * @param error - The rejection a Better Auth mutation or query produced.
 * @returns The body's `code` when it is a string, otherwise `undefined`.
 */
export const betterFetchErrorBodyCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = (error as { error?: unknown }).error;
  if (!candidate || typeof candidate !== 'object' || !('code' in candidate)) {
    return undefined;
  }
  const { code } = candidate as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
};
