// @vitest-environment jsdom
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BookOpen } from 'lucide-react';
import {
  ChatActivityGroup,
  ChatActivityRow,
  useActivityRow,
  useActivityRowDisclosure,
} from '#components/chat-activity-group.js';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardTitle,
} from '#components/chat-tool-card.js';

const renderGroup = (options: { readonly summary?: string; readonly running?: boolean } = {}) =>
  render(
    <ChatActivityGroup
      summary={options.summary ?? 'Read files, ran commands'}
      icon={BookOpen}
      hasActiveRows={options.running}
    >
      <ChatActivityRow>
        <div data-testid='first-row'>Read main.scad</div>
      </ChatActivityRow>
      <ChatActivityRow>
        <div data-testid='second-row'>Run numerical verification</div>
      </ChatActivityRow>
    </ChatActivityGroup>,
  );

/** A row with its own disclosure, as a tool card or a thought is. */
function DisclosureRow({ name }: { readonly name: string }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const row = useActivityRowDisclosure(isOpen);
  return (
    <div>
      <button
        type='button'
        aria-expanded={isOpen}
        data-sole={String(row?.isSole)}
        onClick={() => {
          setIsOpen((open) => !open);
        }}
      >
        {name}
      </button>
      {isOpen ? <p>{name} detail</p> : undefined}
    </div>
  );
}

function SettledProbe(): React.JSX.Element {
  return <span data-testid='settled'>{String(useActivityRow()?.isSettled)}</span>;
}

describe('ChatActivityGroup', () => {
  it('rests closed while its rows run, so a working turn keeps one line', () => {
    renderGroup({ running: true, summary: 'Reading files' });
    const trigger = screen.getByRole('button', { name: 'Reading files' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('first-row')).not.toBeInTheDocument();
  });

  it('spins a collapsed header while a row runs and keeps the family icon when open or settled (S08, S12)', async () => {
    const user = userEvent.setup();
    const { container, rerender } = renderGroup({ running: true, summary: 'Reading files' });
    const trigger = screen.getByRole('button', { name: 'Reading files' });
    const spinner = () => container.querySelector('[data-slot="activity-group-spinner"]');

    expect(spinner()).toHaveClass('spin-glyph');
    expect(trigger).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.lucide-book-open')).toBeNull();

    await user.click(trigger);
    expect(spinner()).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.lucide-book-open')).not.toBeNull();

    await user.click(trigger);
    rerender(
      <ChatActivityGroup summary='Read files' icon={BookOpen} hasActiveRows={false}>
        <ChatActivityRow>one</ChatActivityRow>
        <ChatActivityRow>two</ChatActivityRow>
      </ChatActivityGroup>,
    );
    expect(spinner()).toBeNull();
    expect(screen.getByRole('button', { name: 'Read files' })).not.toHaveAttribute('aria-busy');
  });

  it('keeps the chevron visible without hover, for a screen that has none', () => {
    const { container } = renderGroup();
    const trigger = screen.getByRole('button', { name: 'Read files, ran commands' });

    expect(container.querySelector('.lucide-book-open')).toHaveClass('size-3', 'shrink-0');
    expect(trigger).toHaveClass('items-center', 'gap-1.5', 'text-xs', 'font-normal');
    expect(trigger.querySelector('.lucide-chevron-right')).not.toHaveClass('opacity-0');
  });

  it('opens into one bordered container with a cell per row', async () => {
    const user = userEvent.setup();
    renderGroup();
    const trigger = screen.getByRole('button', { name: 'Read files, ran commands' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('first-row')).not.toBeInTheDocument();

    await user.click(trigger);

    const details = screen.getByRole('region', { name: 'Read files, ran commands details' });
    expect(details).toHaveClass('rounded-lg', 'border');
    expect(details).not.toHaveClass('max-h-80', 'overflow-y-auto');
    expect(details.querySelectorAll('[data-slot="activity-row"]')).toHaveLength(2);
    expect(screen.getByTestId('second-row')).toBeInTheDocument();
  });

  it('stays as the reader left it through live summary updates and completion', async () => {
    const user = userEvent.setup();
    const { rerender } = renderGroup({ running: true, summary: 'Reading files' });

    await user.click(screen.getByRole('button', { name: 'Reading files' }));
    rerender(
      <ChatActivityGroup summary='Reading files, running commands' icon={BookOpen} hasActiveRows>
        <ChatActivityRow>one</ChatActivityRow>
        <ChatActivityRow>two</ChatActivityRow>
        <ChatActivityRow>three</ChatActivityRow>
      </ChatActivityGroup>,
    );
    expect(screen.getByRole('button', { name: 'Reading files, running commands' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Reading files, running commands' }));
    rerender(
      <ChatActivityGroup summary='Read files, ran commands' icon={BookOpen} isSettled>
        <ChatActivityRow>one</ChatActivityRow>
        <ChatActivityRow>two</ChatActivityRow>
        <ChatActivityRow>three</ChatActivityRow>
      </ChatActivityGroup>,
    );
    expect(screen.getByRole('button', { name: 'Read files, ran commands' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports keyboard disclosure through the native trigger', async () => {
    const user = userEvent.setup();
    renderGroup();
    const trigger = screen.getByRole('button', { name: 'Read files, ran commands' });
    trigger.focus();

    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('lets its only row stand as the line, with no summary header or container', () => {
    render(
      <ChatActivityGroup isSole summary='Ran commands' icon={BookOpen}>
        <ChatActivityRow>
          <DisclosureRow name='Ran pnpm test' />
        </ChatActivityRow>
      </ChatActivityGroup>,
    );

    expect(screen.queryByRole('button', { name: 'Ran commands' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ran pnpm test' })).toHaveAttribute('data-sole', 'true');
  });

  it('forms closed around an untouched only row when a second row arrives', () => {
    const { rerender } = render(
      <ChatActivityGroup isSole summary='Running commands' icon={BookOpen}>
        <ChatActivityRow key='a'>
          <DisclosureRow name='Ran pnpm test' />
        </ChatActivityRow>
      </ChatActivityGroup>,
    );
    rerender(
      <ChatActivityGroup summary='Ran commands, reading files' icon={BookOpen}>
        <ChatActivityRow key='a'>
          <DisclosureRow name='Ran pnpm test' />
        </ChatActivityRow>
        <ChatActivityRow key='b'>
          <DisclosureRow name='Read main.scad' />
        </ChatActivityRow>
      </ChatActivityGroup>,
    );

    expect(screen.getByRole('button', { name: 'Ran commands, reading files' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Ran pnpm test' })).not.toBeInTheDocument();
  });

  it('keeps a row the reader opened in view when the group forms around it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ChatActivityGroup isSole summary='Running commands' icon={BookOpen}>
        <ChatActivityRow key='a'>
          <DisclosureRow name='Ran pnpm test' />
        </ChatActivityRow>
      </ChatActivityGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'Ran pnpm test' }));
    rerender(
      <ChatActivityGroup summary='Ran commands, reading files' icon={BookOpen}>
        <ChatActivityRow key='a'>
          <DisclosureRow name='Ran pnpm test' />
        </ChatActivityRow>
        <ChatActivityRow key='b'>
          <DisclosureRow name='Read main.scad' />
        </ChatActivityRow>
      </ChatActivityGroup>,
    );

    expect(screen.getByRole('button', { name: 'Ran commands, reading files' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('Ran pnpm test detail')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read main.scad' })).toHaveAttribute('aria-expanded', 'false');

    /* Closing the row the reader opened does not fold the group they are now reading. */
    await user.click(screen.getByRole('button', { name: 'Ran pnpm test' }));
    expect(screen.getByRole('button', { name: 'Ran commands, reading files' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('reports an opened only row to the host, as it reports an opened group', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <ChatActivityGroup isSole summary='Ran tests' icon={BookOpen} onOpen={onOpen}>
        <ChatActivityRow>
          <DisclosureRow name='Ran 4 tests' />
        </ChatActivityRow>
      </ChatActivityGroup>,
    );
    expect(onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ran 4 tests' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('tells its rows when the turn has ended', async () => {
    const user = userEvent.setup();
    render(
      <ChatActivityGroup isSettled summary='Ran commands' icon={BookOpen}>
        <ChatActivityRow>
          <SettledProbe />
        </ChatActivityRow>
        <ChatActivityRow>two</ChatActivityRow>
      </ChatActivityGroup>,
    );
    await user.click(screen.getByRole('button', { name: 'Ran commands' }));
    expect(screen.getByTestId('settled')).toHaveTextContent('true');
  });
});

describe('ChatToolCard inside an activity group', () => {
  const card = (properties: Partial<React.ComponentProps<typeof ChatToolCard>> = {}): React.JSX.Element => (
    <ChatToolCard variant='minimal' {...properties}>
      <ChatToolCardHeader>
        <ChatToolCardTitle>Ran pnpm test</ChatToolCardTitle>
      </ChatToolCardHeader>
      <ChatToolCardContent>
        <p>exit 1</p>
      </ChatToolCardContent>
    </ChatToolCard>
  );

  it('never opens itself, whatever default the card asks for', () => {
    render(
      <ChatActivityGroup isSole summary='Commands failed' icon={BookOpen}>
        <ChatActivityRow>{card({ status: 'error', isDefaultOpen: true })}</ChatActivityRow>
      </ChatActivityGroup>,
    );

    expect(screen.getByRole('button', { name: 'Ran pnpm test' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('exit 1')).not.toBeInTheDocument();
  });

  it('keeps its own default outside a group', () => {
    render(card({ status: 'error', isDefaultOpen: true }));
    expect(screen.getByText('exit 1')).toBeInTheDocument();
  });

  it('opens an only row into the bordered surface a group opens into', async () => {
    const user = userEvent.setup();
    render(
      <ChatActivityGroup isSole summary='Ran commands' icon={BookOpen}>
        <ChatActivityRow>{card()}</ChatActivityRow>
      </ChatActivityGroup>,
    );

    await user.click(screen.getByRole('button', { name: 'Ran pnpm test' }));
    expect(screen.getByText('exit 1').parentElement).toHaveClass('rounded-lg', 'border');
  });

  it('draws no spinner for a call a settled turn left running', () => {
    const { container, rerender } = render(
      <ChatActivityGroup isSole summary='Running commands' icon={BookOpen}>
        <ChatActivityRow key='a'>{card({ status: 'loading' })}</ChatActivityRow>
      </ChatActivityGroup>,
    );
    expect(container.querySelector('.animate-shiny-text, [class*="shiny"]')).not.toBeNull();

    rerender(
      <ChatActivityGroup isSole isSettled summary='Running commands' icon={BookOpen}>
        <ChatActivityRow key='a'>{card({ status: 'loading' })}</ChatActivityRow>
      </ChatActivityGroup>,
    );
    expect(container.querySelector('.animate-shiny-text, [class*="shiny"]')).toBeNull();
  });
});
