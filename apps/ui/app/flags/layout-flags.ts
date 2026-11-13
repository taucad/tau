/**
 * Layout-affecting flags, mirrored to a request cookie (loading-states blueprint, H2).
 *
 * A flag marked `affectsLayout` in the registry decides first-paint geometry (Home's suggestions row). Its value
 * comes from PostHog after hydration, which the server cannot see, so the client mirrors each such flag's settled
 * value into the `layout-flags` cookie and the root loader reads it on the next document request. The server then
 * renders the flagged surface, omits it, or, with no cookie, holds its box.
 *
 * The cookie value is `<name>.<0|1>` entries joined by `_`, such as `onboarding.1`: only letters, digits, `.` and
 * `_`, all RFC 6265 cookie-octets that no cookie library re-encodes. A request's value is untrusted: unknown names,
 * malformed entries and an oversized value are ignored.
 */

import * as Cookies from 'es-cookie';
import { cookieName } from '@taucad/ui-core/constants/cookie.constants';
import { metaConfig } from '#constants/meta.constants.js';
import type { LayoutFlagName } from '#flags/flag.constants.js';
import { layoutFlagNames } from '#flags/flag.constants.js';

/** The settled values of the layout-affecting flags, by registry name. A flag not yet settled is absent. */
export type LayoutFlagValues = Readonly<Partial<Record<LayoutFlagName, boolean>>>;

/** The request cookie carrying the layout-affecting flags. */
export const layoutFlagsCookieName = `${metaConfig.cookiePrefix}${cookieName.layoutFlags}`;

/** Cookie lifetime in days, below the 400-day cap browsers apply. */
const cookieLifetimeDays = 365;

/** A value longer than this is not one this app wrote. */
const maxCookieLength = 512;

const entryPattern = /^([A-Za-z][A-Za-z\d]*)\.([01])$/u;

const isLayoutFlagName = (name: string): name is LayoutFlagName =>
  (layoutFlagNames as readonly string[]).includes(name);

/**
 * Parse the cookie's value.
 *
 * @param value - The raw cookie value, untrusted.
 * @returns The layout flags it names; empty when absent or malformed.
 */
export const parseLayoutFlags = (value: string | undefined): LayoutFlagValues => {
  if (value === undefined || value.length > maxCookieLength) {
    return {};
  }
  const parsed: Partial<Record<LayoutFlagName, boolean>> = {};
  for (const entry of value.split('_')) {
    const match = entryPattern.exec(entry);
    const name = match?.[1];
    if (name !== undefined && isLayoutFlagName(name) && parsed[name] === undefined) {
      parsed[name] = match?.[2] === '1';
    }
  }
  return parsed;
};

/**
 * Encode layout flags as the cookie's value, in registry order.
 *
 * @param flags - The values to carry.
 * @returns The cookie value; empty when no flag is given.
 */
export const encodeLayoutFlags = (flags: LayoutFlagValues): string =>
  layoutFlagNames
    .flatMap((name) => (flags[name] === undefined ? [] : [`${name}.${flags[name] ? '1' : '0'}`]))
    .join('_');

/**
 * The layout flags a document request carried, for the server render.
 *
 * @param header - The request's `Cookie` header.
 * @returns The flags; empty when the browser has never settled one.
 */
export const readLayoutFlagsFromHeader = (header: string | undefined): LayoutFlagValues =>
  header ? parseLayoutFlags(Cookies.parse(header)[layoutFlagsCookieName]) : {};

/**
 * Mirror settled layout flags into the cookie the next document request carries. A flag that is not settled keeps
 * the value the cookie already holds; the cookie is written only when its value changes.
 *
 * @param settled - The settled layout flags.
 */
export const writeLayoutFlagsCookie = (settled: LayoutFlagValues): void => {
  if (typeof document === 'undefined') {
    return;
  }
  try {
    const current = Cookies.get(layoutFlagsCookieName);
    const value = encodeLayoutFlags({ ...parseLayoutFlags(current), ...settled });
    if (value === '' || value === current) {
      return;
    }
    if (globalThis.location.protocol === 'https:') {
      Cookies.set(layoutFlagsCookieName, value, {
        path: '/',
        sameSite: 'lax',
        expires: cookieLifetimeDays,
        secure: true,
      });
    } else {
      Cookies.set(layoutFlagsCookieName, value, { path: '/', sameSite: 'lax', expires: cookieLifetimeDays });
    }
  } catch {
    // The mirror is best-effort; without it the next server render holds the row's box.
  }
};
