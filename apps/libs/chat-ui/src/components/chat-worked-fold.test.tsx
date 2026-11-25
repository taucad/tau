// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ChatWorkedFold } from '#components/chat-worked-fold.js';

describe('ChatWorkedFold', () => {
  it('rests closed on one line naming the work, and shows the narrative only when the reader opens it', async () => {
    render(
      <ChatWorkedFold summary='Read files, ran commands (1 of 3 failed)'>
        <p>Reading the model first.</p>
      </ChatWorkedFold>,
    );

    const line = screen.getByRole('button', { name: 'Worked · read files, ran commands (1 of 3 failed)' });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Reading the model first.')).not.toBeInTheDocument();

    await userEvent.click(line);

    expect(line).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Working narrative' })).toHaveTextContent('Reading the model first.');
  });

  it('reads "Worked" alone when the narrative ran no tool', () => {
    render(
      <ChatWorkedFold summary=''>
        <p>Thinking aloud.</p>
      </ChatWorkedFold>,
    );

    expect(screen.getByRole('button', { name: 'Worked' })).toBeInTheDocument();
  });

  it('leads with the time the turn worked when it has one', () => {
    render(
      <ChatWorkedFold summary='Read files' elapsed='5m 32s'>
        <p>Reading the model first.</p>
      </ChatWorkedFold>,
    );

    expect(screen.getByRole('button', { name: 'Worked for 5m 32s · read files' })).toBeInTheDocument();
  });

  it('states what did not go through ahead of the summary, which truncates first', () => {
    render(
      <ChatWorkedFold summary='Ran commands, read files' elapsed='27s' shortfall='2 failed'>
        <p>Reading the model first.</p>
      </ChatWorkedFold>,
    );

    expect(screen.getByRole('button', { name: 'Worked for 27s · 2 failed · ran commands, read files' })).toBeVisible();
    expect(screen.getByText('· 2 failed')).toHaveClass('shrink-0');
    expect(screen.getByText('· ran commands, read files')).toHaveClass('truncate');
  });
});
