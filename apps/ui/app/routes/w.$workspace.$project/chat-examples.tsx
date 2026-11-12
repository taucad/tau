import { Heading } from '@taucad/ui/components/heading';
import { memo, useCallback, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { chatExamples, getRandomExamples } from '@taucad/ui-core/constants/chat-prompt-examples';
import type { ChatExample } from '@taucad/ui-core/constants/chat-prompt-examples';
import { pickSuggestions } from '@taucad/ui-core/lib/pick-suggestions';
import { useFeature } from '#flags/use-feature.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useRoutingKernelProfile } from '#hooks/use-routing-kernel-profile.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { Button } from '@taucad/ui/components/button';
import { useCadChatClient } from '#chat-clients/use-cad-chat-client.js';
import { CollectionEmptyState } from '@taucad/ui-kit/components/collection-empty-state';

/** How many examples the empty state shows. */
const exampleCount = 3;

/** A fresh seed, so a refresh shows another set. */
const newSeed = (): string => Math.random().toString(36).slice(2);

/**
 * The examples to show: with onboarding on, three chosen for the person's goals (or general ones), stable until a
 * refresh; with it off, three at random as before.
 */
const useExamples = (): Readonly<{
  examples: readonly ChatExample[];
  refresh: () => void;
}> => {
  const isOnboardingEnabled = useFeature('onboarding');
  const { profile } = usePersonRecord();
  const {
    kernel: { preference },
  } = useChatComposer();
  const { available } = useRoutingKernelProfile();
  // Lazy initialization to ensure consistent examples across renders.
  const [random, setRandom] = useState(() => getRandomExamples(exampleCount));
  const [seed, setSeed] = useState(newSeed);
  const picked = useMemo(
    () =>
      pickSuggestions(chatExamples, {
        goals: profile.goals,
        selection: preference,
        entitled: available,
        seed,
        count: exampleCount,
      }),
    [profile.goals, preference, available, seed],
  );
  const refresh = useCallback(() => {
    if (isOnboardingEnabled) {
      setSeed(newSeed());
    } else {
      setRandom(getRandomExamples(exampleCount));
    }
  }, [isOnboardingEnabled]);
  return { examples: isOnboardingEnabled ? picked : random, refresh };
};

/** One example's button; it submits the example's prompt. */
const ExampleButton = memo(function ({
  example,
  onSelect,
}: {
  readonly example: ChatExample;
  readonly onSelect: (example: ChatExample) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(example);
  }, [example, onSelect]);
  return (
    <Button variant='outline' className='flex-1' onClick={handleClick}>
      {example.title}
    </Button>
  );
});

export const ChatExamples = memo(function () {
  const { examples, refresh } = useExamples();
  // The chat-client composes the per-request `agent` payload (model, kernel,
  // mode, toolChoice, testingEnabled, snapshot, contextPayload) from
  // `useCadAgentConfig`. The originally-broken kernel / testingEnabled fields
  // now flow through the same chat-client all submit sites use, so this
  // quick-start path can no longer drift from the chat-history textarea path.
  const cadChat = useCadChatClient();

  const { submit } = cadChat;
  const handleExampleClick = useCallback(
    (example: ChatExample) => {
      void submit({ text: example.prompt });
    },
    [submit],
  );

  // Nothing fits the person's goals and kernel: show no section rather than an empty one.
  if (examples.length === 0) {
    return undefined;
  }

  return (
    <CollectionEmptyState>
      <div className='mb-2 flex items-center justify-between'>
        <Heading level={3} variant='label'>
          Get started with 3D model examples
        </Heading>
        <Button variant='ghost' size='icon' className='size-7' aria-label='Show other examples' onClick={refresh}>
          <RefreshCw className='size-4' />
        </Button>
      </div>
      <div className='flex w-full flex-wrap justify-between gap-2'>
        {examples.map((example) => (
          <ExampleButton key={example.id} example={example} onSelect={handleExampleClick} />
        ))}
      </div>
    </CollectionEmptyState>
  );
});
