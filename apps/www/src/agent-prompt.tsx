import { ClientOnly } from '@taucad/ui/components/client-only';
import { CopyButton } from '@taucad/ui/components/copy-button';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { appOrigin } from '#www/environment.js';

const promptId = 'agent-prompt-text';

/**
 * Read the prompt as rendered, because the UI edge function may have named staging's own agent page in it.
 * @returns The prompt text shown on the page.
 */
const readPrompt = (): string => document.querySelector(`#${promptId}`)?.textContent ?? '';

/**
 * The hero's copyable agent prompt: monospace text with the shared copy control at its end.
 * Before hydration the prompt is selectable text and the control's slot stays empty.
 * @returns The agent prompt field.
 */
export function AgentPrompt(): React.JSX.Element {
  return (
    <div className='agent-prompt-field'>
      {/* One text node, so the UI edge function can name staging's own agent page before React hydrates it. */}
      <code id={promptId} suppressHydrationWarning>
        {`Install the Tau plugin from ${appOrigin}/llms.txt`}
      </code>
      <ClientOnly fallback={<span className='agent-prompt-slot' aria-hidden='true' />}>
        <TooltipProvider>
          <CopyButton
            getText={readPrompt}
            size='icon-sm'
            tooltip='Copy prompt'
            data-event='cta'
            data-placement='hero-agent'
          />
        </TooltipProvider>
      </ClientOnly>
    </div>
  );
}
