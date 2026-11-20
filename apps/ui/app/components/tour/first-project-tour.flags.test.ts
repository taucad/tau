// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectRemoteFlags, disconnectRemoteFlags } from '#flags/remote-flags.js';
import type { RemoteFlagClient } from '#flags/remote-flags.js';
import { prepareFirstProjectTour } from '#components/tour/first-project-tour.js';
import { personRecordStores } from '#preferences/person-record.store.js';

/*
 * F2 class: a newcomer can create their first project before PostHog has answered. The decision is one-shot (the
 * second project is no longer a first), so an `onboarding` flag that is still unknown must not count as off. The flag
 * modules are real here.
 */

/** A PostHog client that answers only when the test says so. */
const createPendingClient = (): { client: RemoteFlagClient; answer: (variants: Record<string, boolean>) => void } => {
  let variants: Record<string, boolean> = {};
  let callback: (() => void) | undefined;
  return {
    client: {
      featureFlags: { getFlagVariants: () => variants },
      onFeatureFlags(listener) {
        callback = listener;
        return () => {
          callback = undefined;
        };
      },
    },
    answer(next) {
      variants = next;
      callback?.();
    },
  };
};

const ports = {
  readProjectCount: async () => 0,
  readAccount: async () => ({ isSignedIn: false }) as const,
};

/** Let queued promise reactions run. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

beforeEach(() => {
  globalThis.localStorage.clear();
});

afterEach(() => {
  disconnectRemoteFlags();
});

describe('prepareFirstProjectTour before PostHog answers', () => {
  it('should ask for the tour once PostHog turns onboarding on after the first project was created', async () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);

    const askForTour = await prepareFirstProjectTour(ports);
    askForTour?.();
    expect(personRecordStores.onboarding.read().tour.wanted).toBeUndefined();

    posthog.answer({ onboarding: true });
    await settle();

    expect(personRecordStores.onboarding.read().tour.wanted).toBe(true);
  });

  it('should ask for nothing once PostHog answers with onboarding off', async () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);

    const askForTour = await prepareFirstProjectTour(ports);
    askForTour?.();
    posthog.answer({ onboarding: false });
    await settle();

    expect(personRecordStores.onboarding.read().tour.wanted).toBeUndefined();
  });

  it('should ask for nothing when the person skipped setup before the flags arrived', async () => {
    const posthog = createPendingClient();
    connectRemoteFlags(posthog.client);

    const askForTour = await prepareFirstProjectTour(ports);
    askForTour?.();
    personRecordStores.onboarding.write({ setupStatus: 'skipped' });
    posthog.answer({ onboarding: true });
    await settle();

    expect(personRecordStores.onboarding.read().tour.wanted).toBeUndefined();
  });
});
