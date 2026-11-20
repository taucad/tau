/**
 * What a Zoo proxy refusal says to the person, and to an agent reading the kernel issue.
 *
 * One map for every desktop build (adaptive app deployment mode, the surface table; D11): main cannot know whether the
 * API it talks to is funded, so the billing refusals are neutral sentences with no purchase in them. The renderer's Zoo
 * banner adds the purchase action when its mode is `funded`. The sentences repeat the web app's
 * `apps/ui/app/cloud/zoo-close-messages.ts`, which the banner matches; the desktop cannot import UI source (ruling D3).
 * The codes are the API's `zooCloseCodes` (`apps/libs/api-billing/src/billing.constants.ts`).
 */
export const desktopZooCloseErrors: Readonly<Record<string, string>> = {
  1013: 'Zoo is temporarily unavailable. Your project is safe. Try again later.',
  4401: 'Sign in to Tau to use the Zoo kernel.',
  4402: 'This server refused to run Zoo for this account. Your project is safe.',
  4403: 'Your plan on this server does not include Zoo. Your project is safe.',
};
