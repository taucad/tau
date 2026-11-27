import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';

/**
 * The Cloud chunk's own copy of `lib/web-settings.ts` (gate G1: the chunk shares no Core module it can do without): a
 * setting's page on Tau's website, for Tau Desktop's Billing and account-closure rows (desktop sign-in DSI-5). Those
 * rows render only in the desktop, which always names its web deployment in `TAU_FRONTEND_URL`.
 *
 * @param section - The settings section.
 * @param setting - The setting to reveal in it.
 * @returns The absolute URL on the web deployment.
 */
export const cloudWebSettingsUrl = (section: 'billing' | 'data-controls', setting?: string): string => {
  // The injected environment the shell publishes on `window.ENV` (`environment.config.ts`), read without importing it.
  const { ENV: environment } = globalThis as unknown as { readonly ENV: { readonly TAU_FRONTEND_URL: string } };
  const url = new URL('/', new URL(environment.TAU_FRONTEND_URL).origin);
  url.searchParams.set(searchParameterName.settings, section);
  if (setting !== undefined) {
    url.searchParams.set(searchParameterName.settingsTarget, setting);
  }
  return url.href;
};
