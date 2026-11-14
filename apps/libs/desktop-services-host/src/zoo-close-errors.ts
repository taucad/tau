/**
 * What a Zoo proxy refusal says to the person, and to an agent reading the kernel issue.
 *
 * Must match the web app's build-selected copy (`apps/ui/app/cloud/zoo-close-errors.cloud.ts`
 * and `.self-host.ts`, whose exact billing messages the upgrade banner matches) and the
 * API's `zooCloseCodes` (`apps/libs/api-billing/src/billing.constants.ts`). The desktop
 * cannot import UI source (ruling D3), so the copy is repeated here; `tauCloudBuildEnabled`
 * keeps billing copy out of a self-host build exactly as the UI's cloud boundary does.
 */
const unavailable = 'Zoo is temporarily unavailable. Your project is safe. Try again later.';
const signIn = 'Sign in to Tau to use the Zoo kernel.';

export const desktopZooCloseErrors: Readonly<Record<string, string>> = tauCloudBuildEnabled
  ? {
      1013: unavailable,
      4401: signIn,
      4402: 'You need more credits to run Zoo. Add credits, then try again.',
      4403: 'Zoo needs a Pro plan. Upgrade to Pro, then try again.',
    }
  : { 1013: unavailable, 4401: signIn };
