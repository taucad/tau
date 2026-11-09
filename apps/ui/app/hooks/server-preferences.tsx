import { createContext } from 'react';
import type { ReactNode } from 'react';

/**
 * The server-visible preferences the request carried, by storage name, as parsed JSON. The server renders with them
 * and the client hydrates with the same values, so a mirrored preference's first paint is final.
 */
export type ServerPreferences = Readonly<Record<string, unknown>>;

/** No request cookies: every preference renders its default on the server. */
export const noServerPreferences: ServerPreferences = {};

/** `useCookie`'s server snapshot source. */
export const serverPreferencesContext = createContext<ServerPreferences>(noServerPreferences);

/**
 * Supplies `useCookie`'s server snapshot: what the request's cookies said, from the root loader.
 *
 * @param props - The request's preferences and the tree that reads them.
 * @returns The provider.
 */
export function ServerPreferencesProvider({
  value,
  children,
}: {
  readonly value: ServerPreferences;
  readonly children?: ReactNode;
}): React.JSX.Element {
  return <serverPreferencesContext.Provider value={value}>{children}</serverPreferencesContext.Provider>;
}
