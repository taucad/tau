import * as Cookies from 'es-cookie';

/** A host-only presentation choice, never an authentication credential. */
export const setEntryPreference = (preference: 'app' | 'website'): boolean => {
  try {
    const attributes = { path: '/', expires: 30, sameSite: 'lax' } as const;
    Cookies.set('tau-entry', preference, location.protocol === 'https:' ? { ...attributes, secure: true } : attributes);
    return Cookies.get('tau-entry') === preference;
  } catch {
    return false;
  }
};

export const hasWebsitePreference = (): boolean => {
  try {
    return Cookies.get('tau-entry') === 'website';
  } catch {
    return false;
  }
};
