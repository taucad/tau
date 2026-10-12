/* eslint-disable @typescript-eslint/naming-convention -- WebSocket close-code keys are numeric protocol values. */
/**
 * What a Zoo proxy refusal says to the person, and to an agent reading the kernel issue.
 *
 * Must match the web app's build-selected copy (`apps/ui/app/cloud/zoo-close-errors.cloud.ts`
 * and `.self-host.ts`, whose exact billing messages the upgrade banner matches) and the
 * API's `zooCloseCodes` (`apps/api/app/api/billing/billing.constants.ts`). The desktop
 * cannot import UI source (ruling D3), so the copy is repeated here; `tauCloudBuildEnabled`
 * keeps billing copy out of a self-host build exactly as the UI's cloud boundary does.
 */
const unavailable = 'Zoo execution is temporarily unavailable. Your project is safe; try again later.';
const signIn = 'Sign in to Tau to use the Zoo kernel.';

export const desktopZooCloseErrors: Readonly<Record<string, string>> = tauCloudBuildEnabled
  ? {
      1013: unavailable,
      4401: signIn,
      4402: 'This Zoo run needs more credits. Add credits, then retry.',
      4403: 'Zoo execution requires Pro. Upgrade to Pro, then retry.',
    }
  : { 1013: unavailable, 4401: signIn };
/* eslint-enable @typescript-eslint/naming-convention -- End numeric WebSocket close-code keys. */
