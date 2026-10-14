import * as Cookies from 'es-cookie';

/** A host-only presentation choice, never an authentication credential. */
export const setEntryPreference = (preference: 'app' | 'website'): boolean => {
  try {
    Cookies.set('tau-entry', preference, {
      path: '/',
      expires: 30,
      sameSite: 'lax',
      secure: location.protocol === 'https:',
    });
    return Cookies.get('tau-entry') === preference;
  } catch {
    return false;
  }
};

export const clearEntryPreference = (): void => {
  try {
    Cookies.remove('tau-entry', { path: '/' });
  } catch {
    // Storage restrictions must not prevent successful sign-out.
  }
};

export const hasWebsitePreference = (): boolean => {
  try {
    return Cookies.get('tau-entry') === 'website';
  } catch {
    return false;
  }
};
