import { useSyncExternalStore } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import {
  chatComposerAddTriggerClassName,
  chatComposerBarClassName,
  chatComposerBarLeftClassName,
  chatComposerBarRightClassName,
  chatComposerCollapsibleControlsClassName,
  chatComposerModelTriggerClassName,
} from '#components/chat/chat-input-styles.js';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';
import { WorkspaceSelectorPlaceholder } from '#components/filesystem/workspace-selector.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { directoryPicker } from '#constants/browser.constants.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { offeredReasoningLevels } from '#utils/model-reasoning.js';

/** How a level reads on the model trigger; the same words as the agent sheet's. */
export const staticReasoningLevelNames = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
} as const;

const subscribeToNothing = (): (() => void) => () => undefined;

/**
 * Whether the composer will offer a location chip: only where folders can be picked. The server
 * cannot tell, so it draws the chip, which is what every desktop build and Chromium browser shows.
 *
 * @returns Whether to draw the location chip.
 */
const useLocationChipShown = (): boolean =>
  useSyncExternalStore(
    subscribeToNothing,
    () => directoryPicker().available,
    () => true,
  );

/**
 * Whether the model's name is still unknown (no catalog row yet), so the trigger holds its width
 * with a neutral bar instead of printing an id.
 *
 * @returns Whether to draw the placeholder.
 */
const isModelNamePending = (model: ResolvedModel): boolean =>
  ((model as { readonly isNamePending?: boolean }).isNamePending ?? false) || model.name === '';

/** The model trigger's resting face for a Tau model: glyph, name, level and chevron, as the agent sheet draws it. */
function StaticModelTrigger(): React.JSX.Element {
  const {
    model: { model, effort },
    execution: { execution },
  } = useChatComposer();
  const isTau = execution.kind === 'tau';
  const isPending = !isTau || isModelNamePending(model);
  const level = effort !== undefined && offeredReasoningLevels(model.model).includes(effort) ? effort : undefined;
  return (
    <Button variant='ghost' size='sm' data-slot='agent-trigger' className={chatComposerModelTriggerClassName}>
      {isPending ? (
        <span
          data-slot='trigger-model-placeholder'
          aria-hidden='true'
          className='h-3 w-20 shrink-0 rounded-sm bg-muted'
        />
      ) : (
        <>
          <SvgIcon id={model.family} className='size-3.5 shrink-0 grayscale' aria-hidden='true' />
          <span data-slot='trigger-model' className='min-w-0 truncate text-xs'>
            {model.name}
          </span>
          {level === undefined ? null : (
            <span
              data-slot='trigger-level'
              className='shrink-0 text-xs text-muted-foreground group-data-[hide-level]/bar:hidden'
            >
              {staticReasoningLevelNames[level]}
            </span>
          )}
        </>
      )}
      <ChevronDown aria-hidden='true' className='size-3 shrink-0 text-muted-foreground' />
    </Button>
  );
}

const noop = (): void => undefined;

/**
 * The new-project composer's bar at rest, drawn without the rich composer's chunk (R2).
 *
 * Home serves a native input in place of the rich composer until that chunk arrives; this is the bar
 * that input sits on, built from the bar's own class names and controls, so the box is the same
 * size and the controls in the same places before and after the swap. It is inert: until the rich
 * composer replaces it there is nothing for its controls to do, and they stay out of the tab order
 * and the accessibility tree so nothing can act on them early.
 */
export function ChatComposerStaticBar({ isEmpty }: { readonly isEmpty: boolean }): React.JSX.Element {
  const isLocationShown = useLocationChipShown();
  return (
    <div inert data-slot='composer-bar' className={chatComposerBarClassName}>
      <div data-slot='composer-left' className={chatComposerBarLeftClassName}>
        <Button variant='ghost' size='sm' aria-label='Add' className={chatComposerAddTriggerClassName}>
          <Plus className='size-4' aria-hidden='true' />
        </Button>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-0.5 pointer-coarse:gap-3')}
        >
          {isLocationShown ? <WorkspaceSelectorPlaceholder variant='toolbar' /> : null}
        </div>
      </div>
      <div data-slot='composer-right' className={chatComposerBarRightClassName}>
        <div
          data-slot='composer-collapsible'
          className={cn(chatComposerCollapsibleControlsClassName, 'gap-1 pointer-coarse:gap-3')}
        >
          <StaticModelTrigger />
        </div>
        <ChatTextareaSubmitButton
          status='ready'
          isSubmitting={false}
          refusal={isEmpty ? 'Write a message first' : undefined}
          formattedCancelKeyCombination=''
          onSubmit={noop}
          onCancel={noop}
        />
      </div>
    </div>
  );
}
