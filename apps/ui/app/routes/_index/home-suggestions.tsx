import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { chatExamples } from '@taucad/ui-core/constants/chat-prompt-examples';
import type { ChatExample } from '@taucad/ui-core/constants/chat-prompt-examples';
import { pickSuggestions } from '@taucad/ui-core/lib/pick-suggestions';
import { Button } from '@taucad/ui/components/button';
import { useLayoutFlag } from '#flags/use-feature.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useKernel } from '#hooks/use-kernel.js';
import { useRoutingKernelProfile } from '#hooks/use-routing-kernel-profile.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';

/** One seed per page load, so the row keeps its order until the page reloads. */
const pageLoadSeed = Math.random().toString(36).slice(2);

/** How many suggestions the row shows at most. */
const suggestionCount = 4;

/** The row's accessible name. */
export const homeSuggestionsLabel = 'Suggestions';

const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * Whether this render is past hydration. The buttons are never server-rendered: their order follows a per-module
 * random seed, and the person's goals come from storage on this device, so server text would not match.
 */
const useIsHydrated = (): boolean =>
  useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

/** The row itself, mounted only while onboarding is on. */
const HomeSuggestionRow = memo(function (): React.JSX.Element | undefined {
  const isHydrated = useIsHydrated();
  const { profile } = usePersonRecord();
  const { preference } = useKernel();
  const { available } = useRoutingKernelProfile();
  const { draftActorRef } = useChatComposer();
  const telemetry = useOnboardingTelemetry();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const suggestions = useMemo(
    () =>
      pickSuggestions(chatExamples, {
        goals: profile.goals,
        selection: preference,
        entitled: available,
        seed: pageLoadSeed,
        count: suggestionCount,
      }),
    [profile.goals, preference, available],
  );

  if (isHydrated && suggestions.length === 0) {
    return undefined;
  }

  const handleSelect = (example: ChatExample): void => {
    draftActorRef.send({ type: 'setDraftText', text: example.prompt });
    telemetry.homeSuggestionSelected({
      /* eslint-disable @typescript-eslint/naming-convention -- analytics wire names. */
      example_id: example.id,
      goal_matched: example.goals.some((goal) => goal !== 'general' && profile.goals.includes(goal)),
      /* eslint-enable @typescript-eslint/naming-convention -- end of analytics wire names. */
    });
    // The composer takes focus for a navigation that asks for it, as the New project shortcut does on Home.
    void navigate(
      { pathname, search },
      { replace: true, state: { focusChatComposer: true }, preventScrollReset: true },
    );
  };

  return (
    <ul className='flex flex-wrap justify-center gap-2' aria-label={homeSuggestionsLabel}>
      {(isHydrated ? suggestions : []).map((example) => (
        <li key={example.id}>
          <Button
            variant='outline'
            size='sm'
            className='h-auto min-h-8 py-1.5 text-left whitespace-normal'
            onClick={() => {
              handleSelect(example);
            }}
          >
            {example.prompt}
          </Button>
        </li>
      ))}
    </ul>
  );
});

/**
 * The suggestions under Home's composer, while onboarding is on. A click fills the composer with the example's prompt
 * and moves focus there; it sends nothing and leaves the kernel selection, and the one this device remembers, alone.
 *
 * Whether the row has a box is decided once per mount, so a late flag never moves a painted page (H2). With the flag
 * on, or not yet known, the box is held at the row's height for the whole mount, and the row fills it in place when
 * the flag is on. With the flag off nothing is rendered, even if it turns on later: the `layout-flags` cookie makes
 * the next load agree. During hydration the value is the request cookie's, so the server and the client hold the same
 * box. A box held for a flag that settles off stays empty until the next load.
 *
 * @returns The row's box, or nothing while onboarding is off.
 */
export function HomeSuggestions(): React.JSX.Element | undefined {
  const isOnboardingEnabled = useLayoutFlag('onboarding');
  const [isBoxHeld] = useState(isOnboardingEnabled !== false);
  if (!isBoxHeld) {
    return undefined;
  }
  return (
    <div data-slot='home-suggestions' className='min-h-38 md:min-h-18'>
      {isOnboardingEnabled === true ? <HomeSuggestionRow /> : undefined}
    </div>
  );
}
