/**
 * Runs in the document head before marketing can paint. Keep self-contained:
 * the template serializes this function into a CSP-hashed inline script.
 */
export const bootEntry = async () => {
  const root = document.documentElement;
  const preference = () => {
    try {
      return document.cookie
        .split(';')
        .find((part) => part.trim().startsWith('tau-entry='))
        ?.trim()
        .slice(10);
    } catch {
      return undefined;
    }
  };
  const writeApp = () => {
    try {
      // oxlint-disable-next-line unicorn/no-document-cookie -- Synchronous head routing must read back persistence before first paint; this script has no imports.
      document.cookie = `tau-entry=app; Path=/; Max-Age=2592000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
      return preference() === 'app';
    } catch {
      return false;
    }
  };
  const initialPreference = preference();
  const api =
    location.hostname === 'taucad.dev'
      ? 'https://api.taucad.dev'
      : location.hostname === 'tau.new'
        ? 'https://api.tau.new'
        : undefined;
  // A real link remains usable without JavaScript or cookie persistence.
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-open-app]') : null;
    if (
      !api ||
      (initialPreference === 'app' &&
        location.pathname === '/' &&
        !new URLSearchParams(location.search).has('website')) ||
      !link ||
      !(event instanceof MouseEvent) ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    if (writeApp()) {
      event.preventDefault();
      location.assign('/');
    }
  });
  if (
    !api ||
    location.pathname !== '/' ||
    preference() !== undefined ||
    new URLSearchParams(location.search).has('website')
  ) {
    return;
  }
  root.classList.add('entry-pending');
  const controller = new AbortController();
  const reveal = () => {
    root.classList.remove('entry-pending');
    controller.abort();
  };
  // Milliseconds. A slow auth service must never trap visitors behind a cover.
  const sessionTimeout = setTimeout(reveal, 1500);
  let isContinuing = false;
  try {
    const response = await fetch(`${api}/v1/auth/get-session`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return;
    }
    /** @type {unknown} */
    const session = await response.json();
    if (
      !controller.signal.aborted &&
      session !== null &&
      typeof session === 'object' &&
      'session' in session &&
      session.session &&
      'user' in session &&
      session.user &&
      preference() === undefined &&
      writeApp()
    ) {
      isContinuing = true;
      clearTimeout(sessionTimeout);
      // A stale edge sees the existing marker and cannot reload again.
      location.replace(location.href);
    }
  } catch {
    // Null, unavailable and blocked sessions leave the public site usable.
  } finally {
    if (!isContinuing) {
      clearTimeout(sessionTimeout);
      reveal();
    }
  }
};
