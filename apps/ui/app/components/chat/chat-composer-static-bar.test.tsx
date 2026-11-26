import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { ChatComposerStaticBar, staticReasoningLevelNames } from '#components/chat/chat-composer-static-bar.js';
import {
  chatComposerGhostPillClassName,
  chatComposerModelTriggerClassName,
} from '@taucad/chat-ui/components/chat-input-styles';
import { ghostPillClass, reasoningLevelNames } from '#components/chat/chat-agent-sheet.js';

const composer = vi.hoisted((): { value: Record<string, unknown> } => ({ value: {} }));
vi.mock('#hooks/active-chat-provider.js', () => ({ useChatComposer: () => composer.value }));

const haiku = {
  id: 'anthropic/claude-haiku',
  name: 'Haiku 5.5',
  family: 'claude',
  provider: { id: 'anthropic', name: 'Anthropic' },
  isResolved: true,
  model: { configuration: { thinking: { type: 'adaptive' } } },
};

const renderBar = (isEmpty = true): HTMLElement =>
  render(
    <TooltipProvider>
      <ChatComposerStaticBar isEmpty={isEmpty} />
    </TooltipProvider>,
  ).container;

describe('ChatComposerStaticBar', () => {
  beforeEach(() => {
    composer.value = {
      model: { model: haiku, effort: undefined },
      execution: { execution: { kind: 'tau' } },
      kernel: { preference: 'auto' },
    };
  });

  it('draws the rich bar’s controls at rest, inert until the rich bar replaces it', () => {
    const container = renderBar();
    const bar = container.querySelector('[data-slot="composer-bar"]');
    expect(bar).toHaveAttribute('inert');
    expect(bar?.querySelector('[aria-label="Add"]')).toHaveClass('h-7', 'w-7', 'rounded-full', 'px-0');
    expect(bar?.querySelector('[data-slot="agent-trigger"]')).toHaveClass(
      ...cn(chatComposerModelTriggerClassName).split(' '),
    );
    expect(bar?.querySelector('[data-slot="trigger-model"]')).toHaveTextContent('Haiku 5.5');
  });

  it('leaves the kernel and the location to the + menu, as the rich composer does', () => {
    const bar = renderBar();
    expect(bar.querySelector('[data-slot="kernel-pill"]')).toBeNull();
    expect(bar.querySelector('[aria-label="Create in Home"]')).toBeNull();
  });

  it('refuses Send only while the input is empty, as the rich composer does', () => {
    expect(renderBar(true).querySelector('[aria-label="Send"]')).toHaveAttribute('aria-disabled', 'true');
    const filled = renderBar(false).querySelector('[aria-label="Send"]');
    expect(filled).toHaveAttribute('aria-disabled', 'false');
  });

  it('holds the model slot with a neutral bar while the name is unknown, and for another agent', () => {
    composer.value = {
      ...composer.value,
      model: { model: { ...haiku, name: '' }, effort: undefined },
    };
    const pending = renderBar();
    expect(pending.querySelector('[data-slot="trigger-model-placeholder"]')).toHaveClass('w-20');
    expect(pending.querySelector('[data-slot="trigger-model"]')).toBeNull();

    composer.value = {
      ...composer.value,
      model: { model: haiku, effort: undefined },
      execution: { execution: { kind: 'acp', agentId: 'codex' } },
    };
    expect(renderBar().querySelector('[data-slot="trigger-model-placeholder"]')).not.toBeNull();
  });

  /* The bar is a copy of the rich bar's resting face, so the copy's words and pills are pinned to the originals. */
  it('uses the agent sheet’s pill and level names', () => {
    expect(chatComposerGhostPillClassName).toBe(ghostPillClass);
    expect(cn(chatComposerModelTriggerClassName)).toBe(
      cn(ghostPillClass, 'max-w-64 min-w-0 shrink gap-1 pr-2 text-foreground'),
    );
    expect(staticReasoningLevelNames).toEqual(reasoningLevelNames);
  });
});
