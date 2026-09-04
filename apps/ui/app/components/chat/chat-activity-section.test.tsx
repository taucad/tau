import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ChatActivitySection } from '#components/chat/chat-activity-section.js';
import { ChatActivityGroup } from '#components/chat/chat-activity-group.js';

describe('ChatActivitySection', () => {
  it('should render the two-tone verb + detail label when closed', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        hasDownstreamText
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    const verbSpan = screen.getByText('Explored');
    const detailSpan = screen.getByText('12 searches, 2 fetches');

    expect(verbSpan).toHaveClass('text-foreground/60');
    expect(verbSpan).toHaveClass('font-medium');
    expect(detailSpan).toHaveClass('text-foreground/50');
  });

  it('should declare the shared chat-tool trigger named group on the trigger button so labels lift on hover', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        hasDownstreamText
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveClass('group/chat-tool-trigger');

    expect(screen.getByText('Explored')).toHaveClass('group-hover/chat-tool-trigger:text-foreground');
    expect(screen.getByText('12 searches, 2 fetches')).toHaveClass('group-hover/chat-tool-trigger:text-foreground/80');
  });

  it('should render only the present-participle verb with an ellipsis when isActive', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        isLast
        isActive
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByText('Exploring…')).toBeInTheDocument();
    expect(screen.queryByText('Explored')).not.toBeInTheDocument();
    expect(screen.queryByText('12 searches, 2 fetches')).not.toBeInTheDocument();
  });

  it('should apply the shimmer animation to the active title so it matches per-tool loading states', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        isLast
        isActive
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    const activeLabel = screen.getByText('Exploring…');
    expect(activeLabel).toHaveClass('animate-shiny-text');
  });

  it('should not apply the shimmer animation to past-tense (concluded) titles', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        hasDownstreamText
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByText('Explored')).not.toHaveClass('animate-shiny-text');
    expect(screen.getByText('12 searches, 2 fetches')).not.toHaveClass('animate-shiny-text');
  });

  it('should keep present tense even when the user collapses a live (isActive) section', async () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        isLast
        isActive
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Exploring…')).toBeInTheDocument();
    expect(screen.queryByText('Explored')).not.toBeInTheDocument();
  });

  it('should render past-tense two-tone header on the trailing section after streaming ends (isLast, !isActive)', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        isLast
      >
        <div data-testid='body'>activity content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByText('Explored')).toBeInTheDocument();
    expect(screen.getByText('12 searches, 2 fetches')).toBeInTheDocument();
    expect(screen.queryByText('Exploring…')).not.toBeInTheDocument();
    // Default-open behavior is preserved by isLast — body is still visible after cancel.
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('should render past-tense header on a concluded (non-trailing) section regardless of isActive', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        hasDownstreamText
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByText('Explored')).toBeInTheDocument();
    expect(screen.queryByText('Exploring…')).not.toBeInTheDocument();
  });

  it('should keep past tense even when the user expands a concluded section', async () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches, 2 fetches'
        hasDownstreamText
      >
        <div>activity content</div>
      </ChatActivitySection>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Explored')).toBeInTheDocument();
    expect(screen.getByText('12 searches, 2 fetches')).toBeInTheDocument();
    expect(screen.queryByText('Exploring…')).not.toBeInTheDocument();
  });

  it('should render only the verb when detail is empty (e.g. fallback "Activity")', () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' hasDownstreamText>
        <div>content</div>
      </ChatActivitySection>,
    );

    const verbSpan = screen.getByText('Activity');
    expect(verbSpan).toHaveClass('text-foreground/60');
    expect(verbSpan).toHaveClass('font-medium');
  });

  it('should default to expanded when no hasDownstreamText', () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail=''>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('should default to collapsed when hasDownstreamText is true', () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' hasDownstreamText>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('should toggle when the trigger is clicked', async () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' hasDownstreamText>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.queryByTestId('body')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('body')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('should set aria-expanded on the trigger button', async () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' hasDownstreamText>
        <div>content</div>
      </ChatActivitySection>,
    );

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('should respect user toggle even after initial collapse', async () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' hasDownstreamText>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    const trigger = screen.getByRole('button');
    await userEvent.click(trigger);
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('should be open when isLast is true (no downstream text)', () => {
    render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' isLast>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('should close when isLast transitions to false (downstream text arrives)', () => {
    const { rerender } = render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' isLast>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByTestId('body')).toBeInTheDocument();

    rerender(
      <ChatActivitySection
        summaryVerbPast='Activity'
        summaryVerbActive='Working'
        summaryDetail=''
        isLast={false}
        hasDownstreamText
      >
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('should render a child ChatActivityGroup flat (no inner header) when nested inside the section', () => {
    render(
      <ChatActivitySection
        summaryVerbPast='Explored'
        summaryVerbActive='Exploring'
        summaryDetail='12 searches'
        hasDownstreamText
      >
        <ChatActivityGroup summaryVerbPast='Explored' summaryVerbActive='Exploring' summaryDetail='12 searches'>
          <div data-testid='inner-row'>tool row</div>
        </ChatActivityGroup>
      </ChatActivitySection>,
    );

    // Section is concluded (hasDownstreamText, !isLast): header reads
    // "Explored 12 searches" past-tense; inner group is suppressed by
    // disableInnerFold and renders nothing in the closed body.
    expect(screen.getByText('Explored')).toBeInTheDocument();
    expect(screen.getByText('12 searches')).toBeInTheDocument();
    expect(screen.queryByText('Exploring…')).not.toBeInTheDocument();
  });

  it('should respect user toggle over isLast', async () => {
    const { rerender } = render(
      <ChatActivitySection summaryVerbPast='Activity' summaryVerbActive='Working' summaryDetail='' isLast>
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByTestId('body')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();

    rerender(
      <ChatActivitySection
        summaryVerbPast='Activity'
        summaryVerbActive='Working'
        summaryDetail=''
        isLast={false}
        hasDownstreamText
      >
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.queryByTestId('body')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('body')).toBeInTheDocument();

    rerender(
      <ChatActivitySection
        summaryVerbPast='Activity'
        summaryVerbActive='Working'
        summaryDetail=''
        isLast={false}
        hasDownstreamText
      >
        <div data-testid='body'>content</div>
      </ChatActivitySection>,
    );

    expect(screen.getByTestId('body')).toBeInTheDocument();
  });
});

it('keeps a skill section manually collapsed while its summary and children stream', async () => {
  const { rerender } = render(
    <ChatActivitySection
      summaryVerbPast='Activity:'
      summaryVerbActive='Loading'
      summaryDetail='1 unfinished tool load'
      isLast
      isActive
    >
      <ChatActivityGroup
        summaryVerbPast='Activity:'
        summaryVerbActive='Loading'
        summaryDetail='1 unfinished tool load'
        isActive
      >
        <span>Reading a skill</span>
      </ChatActivityGroup>
    </ChatActivitySection>,
  );
  const toggle = screen.getByRole('button', { name: 'Loading…' });
  expect(screen.getAllByRole('button')).toHaveLength(1);
  toggle.focus();
  await userEvent.keyboard(' ');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  rerender(
    <ChatActivitySection
      summaryVerbPast='Loaded'
      summaryVerbActive='Working'
      summaryDetail='1 tool, edited 1 file'
      isLast
    >
      <ChatActivityGroup summaryVerbPast='Loaded' summaryVerbActive='Working' summaryDetail='1 tool, edited 1 file'>
        <span>Read a skill and edited a file</span>
      </ChatActivityGroup>
    </ChatActivitySection>,
  );
  const completed = screen.getByRole('button', { name: 'Loaded 1 tool, edited 1 file' });
  expect(completed).toBe(toggle);
  expect(completed).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Read a skill and edited a file')).not.toBeInTheDocument();
  await userEvent.keyboard('{Enter}');
  expect(completed).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByText('Read a skill and edited a file')).toBeInTheDocument();
});
