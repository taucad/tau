// @vitest-environment jsdom
/**
 * The agent's read-only history card (S28, I10, I3).
 *
 * Three claims: every answer shows the one line the rest of the product shows
 * (`main · Rev 12`), a revision is named as a person names it rather than by a
 * commit id, and the card offers nothing to press — the agent reads history and
 * a person owns every verb that changes it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolRevisions } from '#routes/w.$workspace.$project/chat-message-tool-revisions.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({
    children,
    status,
    isCollapsible,
    isDefaultOpen,
  }: {
    readonly children: React.ReactNode;
    readonly status?: string;
    readonly isCollapsible?: boolean;
    readonly isDefaultOpen?: boolean;
  }): React.JSX.Element {
    return (
      <article
        aria-label='revisions tool card'
        data-status={status ?? ''}
        data-collapsible={isCollapsible === false ? 'false' : 'true'}
        data-default-open={isDefaultOpen === false ? 'false' : 'true'}
      >
        {children}
      </article>
    );
  },
  ChatToolCardHeader({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <header>{children}</header>;
  },
  ChatToolCardIcon(): React.JSX.Element {
    return <span data-testid='chat-tool-card-icon' />;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <h3>{children}</h3>;
  },
  ChatToolCardContent({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
  ChatToolCardList({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <ul aria-label='revisions rows'>{children}</ul>;
  },
  ChatToolCardListItem({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <li>{children}</li>;
  },
}));

vi.mock('#components/chat/chat-tool-text.js', () => ({
  ChatToolDescription({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <span data-testid='chat-tool-description'>{children}</span>;
  },
}));

vi.mock('#components/chat/chat-tool-label.js', () => ({
  ChatToolLabel({
    verb,
    children,
  }: {
    readonly verb: React.ReactNode;
    readonly children?: React.ReactNode;
  }): React.JSX.Element {
    return (
      <span>
        <span data-testid='chat-tool-verb'>{verb}</span>
        {children ? <> {children}</> : undefined}
      </span>
    );
  },
}));

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError({ errorText, noun }: { readonly errorText: string; readonly noun: string }): React.JSX.Element {
    return (
      <div role='alert' data-noun={noun}>
        {errorText}
      </div>
    );
  },
}));

type RevisionsInvocation = ToolInvocation<typeof toolName.revisions>;
type RevisionsOutputAvailable = Extract<RevisionsInvocation, { state: 'output-available' }>;
type RevisionsInput = RevisionsOutputAvailable['input'];
type RevisionsOutput = RevisionsOutputAvailable['output'];

const answered = (input: RevisionsInput, output: RevisionsOutput): RevisionsOutputAvailable => ({
  toolCallId: 'tc_1',
  state: 'output-available',
  input,
  output,
});

const revision = (
  overrides: Partial<NonNullable<RevisionsOutput['revisions']>[number]> = {},
): NonNullable<RevisionsOutput['revisions']>[number] => ({
  revisionNumber: 2,
  revisionId: '96b7f7e20408020c0b6bdde67ddb99cec27aa0c1',
  actor: 'ada',
  source: 'user',
  createdAt: 1_789_225_647_000,
  summary: 'Thickened the bracket',
  conflicted: false,
  ...overrides,
});

const verb = (): string => screen.getByTestId('chat-tool-verb').textContent;
const description = (): string => screen.getByTestId('chat-tool-description').textContent;
const rows = (): readonly string[] =>
  within(screen.getByRole('list', { name: 'revisions rows' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

afterEach(cleanup);

describe('ChatMessageToolRevisions', () => {
  it('says where the project is and lists revisions as a person names them', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log' },
          {
            where: 'main · Rev 2',
            branch: 'main',
            revisions: [revision(), revision({ revisionNumber: 1, revisionId: '7cbef6c', summary: 'First revision' })],
          },
        )}
      />,
    );

    expect(verb()).toBe('Read');
    expect(description()).toBe('main · Rev 2 · 2 revisions');
    expect(rows()).toEqual(['Rev 2Thickened the bracketada', 'Rev 1First revisionada']);
    // Never a commit id, on any row (A18, I12).
    expect(screen.queryByText(/96b7f7e2/u)).toBeNull();
  });

  it('gives a merged-in revision no number, and marks one that needs resolution', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log' },
          {
            where: 'main · Rev 2',
            revisions: [
              revision({ revisionNumber: undefined, revisionId: 'abc1234', summary: 'Merged side' }),
              revision({ conflicted: true }),
            ],
          },
        )}
      />,
    );

    expect(rows()[0]).toContain('merged in');
    expect(rows()[1]).toContain('(needs resolution)');
  });

  it('counts the files a diff changed and names each one with how it changed', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'diff', from: 'a', to: 'b' },
          {
            where: 'main · Rev 12',
            changes: [
              { path: 'src/bracket.ts', kind: 'modified' },
              { path: 'models/plate.step', kind: 'added' },
              { path: 'notes.md', kind: 'deleted' },
            ],
          },
        )}
      />,
    );

    expect(verb()).toBe('Compared');
    expect(description()).toBe('main · Rev 12 · 3 files');
    expect(rows()).toEqual(['src/bracket.ts(modified)', 'models/plate.step(added)', 'notes.md(deleted)']);
  });

  it('marks which branch a describe is on, and counts the rest', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'describe' },
          {
            where: 'main · Rev 12',
            branch: 'main',
            branches: [
              { name: 'main', revisionNumber: 12, revisionId: 'aaa' },
              { name: 'sketch', revisionNumber: 4, revisionId: 'bbb' },
            ],
          },
        )}
      />,
    );

    expect(verb()).toBe('Checked');
    expect(description()).toBe('main · Rev 12 · 2 branches');
    expect(rows()).toEqual(['mainRev 12 · this one', 'sketchRev 4']);
  });

  it('carries the where line with no rows to disclose, and stays uncollapsible', () => {
    render(<ChatMessageToolRevisions part={answered({ action: 'describe' }, { where: 'No revisions yet' })} />);

    expect(description()).toBe('No revisions yet');
    expect(screen.queryByRole('list', { name: 'revisions rows' })).toBeNull();
    expect(screen.getByRole('article', { name: 'revisions tool card' }).dataset['collapsible']).toBe('false');
  });

  it('reads as pending while the call streams, in the verb of the action it named', () => {
    render(
      <ChatMessageToolRevisions part={{ toolCallId: 'tc_1', state: 'input-streaming', input: { action: 'diff' } }} />,
    );

    expect(verb()).toBe('Comparing');
    expect(description()).toBe('what changed...');
    expect(screen.getByRole('article', { name: 'revisions tool card' }).dataset['status']).toBe('loading');
  });

  it('offers nothing to press: reading history is the whole card (I10)', () => {
    render(
      <ChatMessageToolRevisions
        part={answered({ action: 'log' }, { where: 'main · Rev 2', revisions: [revision()] })}
      />,
    );

    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.queryAllByRole('link')).toEqual([]);
    for (const word of ['Restore', 'Discard', 'Switch', 'Merge']) {
      expect(screen.queryByText(new RegExp(word, 'u'))).toBeNull();
    }
  });

  it('reports a refusal as an error on the history, not as an empty one', () => {
    render(
      <ChatMessageToolRevisions
        part={{
          toolCallId: 'tc_1',
          state: 'output-error',
          input: { action: 'log' },
          errorText: 'This project has no revision history.',
        }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.dataset['noun']).toBe('revision history');
    expect(alert.textContent).toBe('This project has no revision history.');
  });

  it('shows an empty history as empty rather than as no answer', () => {
    render(<ChatMessageToolRevisions part={answered({ action: 'log' }, { where: 'main · Rev 0', revisions: [] })} />);

    expect(rows()).toEqual(['(no revisions yet)']);
  });
});
