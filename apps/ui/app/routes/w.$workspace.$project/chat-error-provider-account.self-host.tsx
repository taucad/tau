import { memo, useState } from 'react';
import type React from 'react';
import { ChevronRight, ExternalLink, RefreshCcw, Repeat, Wallet } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import { cn } from '@taucad/ui/utils/cn';
import { useChatActions } from '#hooks/use-chat.js';
import { ChatModelSelector } from '#components/chat/chat-model-selector.js';
import { ChatErrorCard } from '#routes/w.$workspace.$project/chat-error-card.js';

type ProviderEntry = {
  readonly name: string;
  /** Where the operator adds credit; a provider without one renders no link action. */
  readonly billing?: { readonly host: string; readonly href: string };
};

/**
 * The providers the gateway can name in a `PROVIDER_ACCOUNT_EXHAUSTED` refusal.
 * Only the three with a billing console get a link; the rest contribute a name.
 */
const providerEntries: Record<string, ProviderEntry> = {
  openai: {
    name: 'OpenAI',
    billing: { host: 'platform.openai.com', href: 'https://platform.openai.com/settings/organization/billing/' },
  },
  anthropic: {
    name: 'Anthropic',
    billing: { host: 'console.anthropic.com', href: 'https://console.anthropic.com/settings/billing' },
  },
  xai: { name: 'xAI', billing: { host: 'console.x.ai', href: 'https://console.x.ai' } },
  together: { name: 'Together' },
  morph: { name: 'Morph' },
  vertexai: { name: 'Vertex AI' },
  cerebras: { name: 'Cerebras' },
  moonshot: { name: 'Moonshot' },
};

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** The refusal's provider, defensively: the details are wire data, not a type. */
export const providerEntryFrom = (details: Record<string, unknown> | undefined): ProviderEntry =>
  providerEntries[text(details?.['providerId']) ?? ''] ?? { name: 'The model provider' };

type ChatErrorProviderAccountProps = {
  readonly className?: string;
  /** The provider's own sentence; on self-host the operator owns the key and may read it. */
  readonly description?: string;
  /** `ProviderAccountRefusalDetails` as the gateway sent them; see `ChatError.details`. */
  readonly details?: Record<string, unknown>;
};

/**
 * Self-host: the provider account behind this server's key has no credit.
 *
 * The operator owns that account, so the provider's billing page is the
 * resolving action and comes first; the provider's own sentence and codes stay
 * behind Details, where only someone who can act on them looks.
 *
 * @param properties - Card class, the provider message and the refusal details.
 * @returns The notice.
 */
export const ChatErrorProviderAccount = memo(function ({
  className,
  description,
  details,
}: ChatErrorProviderAccountProps): React.JSX.Element {
  const { continueChat } = useChatActions();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const { name, billing } = providerEntryFrom(details);
  const providerCode = text(details?.['providerCode']);
  const title = `${name} has no credit left`;

  return (
    <ChatErrorCard
      role='status'
      aria-label={title}
      tone='warning'
      icon={Wallet}
      className={className}
      title={title}
      description={`This server's ${name} key is out of credit, so Tau could not run this turn. Add credit ${billing === undefined ? `with ${name}` : `on ${billing.host}`}, then try again.`}
      actionsRowFrom='sm'
      actions={
        <>
          {billing === undefined ? null : (
            <Button asChild variant='outline' size='sm'>
              <a href={billing.href} target='_blank' rel='noreferrer noopener'>
                <ExternalLink className='size-3.5' />
                Open {name} billing
              </a>
            </Button>
          )}
          {/* The composer's picker is the owner, opened here as the credits card opens it. */}
          <ChatModelSelector popoverProperties={{ align: 'end' }}>
            {() => (
              <Button variant='outline' size='sm'>
                <Repeat className='size-3.5' />
                Switch model
              </Button>
            )}
          </ChatModelSelector>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              continueChat();
            }}
          >
            <RefreshCcw className='size-3.5' />
            Try again
          </Button>
        </>
      }
    >
      <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant='ghost' size='xs' className='-ml-1 text-muted-foreground'>
            <ChevronRight className={cn('size-3 transition-transform', isDetailsOpen && 'rotate-90')} />
            Details
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className='space-y-1 pt-1 text-xs text-muted-foreground'>
          {description === undefined ? null : <p className='break-words text-foreground'>{description}</p>}
          <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono'>
            <dt>provider</dt>
            <dd className='min-w-0 break-all'>{text(details?.['providerId']) ?? 'unknown'}</dd>
            {providerCode === undefined ? null : (
              <>
                <dt>code</dt>
                <dd className='min-w-0 break-all'>{providerCode}</dd>
              </>
            )}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </ChatErrorCard>
  );
});
