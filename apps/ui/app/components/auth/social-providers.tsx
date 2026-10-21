import { getProviderName } from '@better-auth-ui/core';
import type { AuthSocialProvider } from '@better-auth-ui/core';
import { providerIcons } from '@better-auth-ui/react';
import type React from 'react';

import { SvgIcon } from '#components/icons/svg-icon.js';

type ProviderIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

/** Better Auth provider id for Sign in with ChatGPT; must match `chatgptProviderId` in `apps/api/app/config/better-auth.config.ts`. */
export const chatgptProviderId = 'chatgpt';

const chatgptName = 'ChatGPT';

/** OpenAI's mark in the current text colour, which serves both of its approved black and white button styles. */
function ChatgptIcon(props: React.SVGProps<SVGSVGElement>): React.JSX.Element | undefined {
  return <SvgIcon {...props} id='openai' aria-hidden='true' />;
}

/** Providers better-auth-ui does not know: their display name and mark. */
const customProviders: Readonly<Record<string, { readonly name: string; readonly Icon: ProviderIcon }>> = {
  [chatgptProviderId]: { name: chatgptName, Icon: ChatgptIcon },
};

/**
 * The social providers this deployment offers.
 *
 * ChatGPT needs a client OpenAI issues per deployment, so it is offered only where the deployment says the
 * API has one; GitHub and Google are always listed.
 *
 * @param isChatgptEnabled - `TAU_CHATGPT_SIGN_IN_ENABLED`.
 * @returns The providers, in button order.
 */
export function getSocialProviders(isChatgptEnabled: boolean): AuthSocialProvider[] {
  return isChatgptEnabled ? ['github', 'google', { id: chatgptProviderId, label: chatgptName }] : ['github', 'google'];
}

/**
 * How a provider id is named and drawn, for built-in and custom providers alike.
 *
 * @param provider - The Better Auth provider id, as an account row or the provider list carries it.
 * @returns Its display name, and its mark when one exists.
 */
export function getSocialProviderDisplay(provider: string): { readonly name: string; readonly Icon?: ProviderIcon } {
  const custom = customProviders[provider];
  if (custom) {
    return custom;
  }
  const Icon = (providerIcons as Record<string, ProviderIcon | undefined>)[provider];
  return Icon ? { name: getProviderName(provider), Icon } : { name: getProviderName(provider) };
}
