// @vitest-environment jsdom
/**
 * The agent's read-only history card (S28, I10, I3).
 *
 * Three claims: every answer shows the one line the rest of the product shows
 * (`main`), an entry is named as History names it — its title, time and who,
 * and for a version its `V3` — never by a number or a commit id (M11), and the
 * card offers nothing to press: the agent reads history and a person owns every
 * verb that changes it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolRevisions } from '#routes/w.$workspace.$project/chat-message-tool-revisions.js';

vi.mock('@taucad/chat-ui/components/chat-tool-card', () => ({
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
        aria-label='history tool card'
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
    return <ul aria-label='history rows'>{children}</ul>;
  },
  ChatToolCardListItem({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <li>{children}</li>;
  },
}));

vi.mock('@taucad/chat-ui/components/chat-tool-text', () => ({
  ChatToolDescription({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <span data-testid='chat-tool-description'>{children}</span>;
  },
}));

vi.mock('@taucad/chat-ui/components/chat-tool-label', () => ({
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

type RevisionsInvocation = ToolInvocation<typeof toolName.history>;
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
  revisionId: '96b7f7e20408020c0b6bdde67ddb99cec27aa0c1',
  who: { kind: 'recorded', identity: { kind: 'user', id: 'ada' } },
  source: 'user',
  createdAt: 1_789_225_647_000,
  summary: 'Thickened the bracket',
  conflicted: false,
  ...overrides,
});

/** The time History prints for a row, in this run's locale and zone. */
const at = (createdAt = 1_789_225_647_000): string =>
  new Date(createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' });

const verb = (): string => screen.getByTestId('chat-tool-verb').textContent;
const description = (): string => screen.getByTestId('chat-tool-description').textContent;
const rows = (): readonly string[] =>
  within(screen.getByRole('list', { name: 'history rows' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

/** M11: no "Rev " followed by a digit and no "revision" for a save, anywhere on the card. */
const expectNoSaveNumber = (): void => {
  const text = document.body.textContent;
  expect(text).not.toMatch(/\bRev \d/u);
  expect(text).not.toMatch(/\brevisions?\b/iu);
};

afterEach(cleanup);

describe('ChatMessageToolRevisions', () => {
  it('says where the project is and lists entries by time and title, with no number', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log' },
          {
            where: 'main',
            branch: 'main',
            revisions: [
              revision(),
              revision({ revisionId: '7cbef6c', summary: 'First change', createdAt: 1_789_225_000_000 }),
            ],
          },
        )}
      />,
    );

    expect(verb()).toBe('Read');
    expect(description()).toBe('main · 2 entries');
    /* Q2: a single-person project's rows carry no who line, and an id is never printed. */
    expect(rows()).toEqual([`${at()}Thickened the bracket`, `${at(1_789_225_000_000)}First change`]);
    // Never a commit id, on any row (A18, I12).
    expect(screen.queryByText(/96b7f7e2/u)).toBeNull();
    expectNoSaveNumber();
  });

  it('shows a version by its number and name where an entry shows its time (M11)', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log', limit: 1 },
          {
            where: 'main',
            revisions: [revision({ summary: 'Saved changes (save)', version: { number: 2, name: 'Ready for print' } })],
          },
        )}
      />,
    );

    expect(description()).toBe('main · 1 entry');
    expect(rows()).toEqual(['V2Ready for print']);
    expectNoSaveNumber();
  });

  /* C5 acceptance: the card reads the engine's placeholders the way History titles them (M6, Q9). */
  it('titles an entry as History does, never with the engine’s placeholder', () => {
    const agent = {
      kind: 'recorded',
      identity: { kind: 'agent', id: 'agent', runId: 'run-1', onBehalfOf: { kind: 'user', id: 'ada' } },
    } as const;
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log' },
          {
            where: 'main',
            revisions: [
              revision({ revisionId: 'a1', summary: 'Agent change', source: 'agent', who: agent }),
              /* A turn's base cut: the person's own edits, saved before the agent started (A5). */
              revision({ revisionId: 'a2', summary: 'Autosave', source: 'user' }),
              revision({ revisionId: 'a3', summary: 'Saved changes (idle)' }),
              revision({ revisionId: 'a4', summary: 'Saved changes (save)' }),
              revision({ revisionId: 'a5', summary: 'Make the lid walls 2.4 mm', source: 'agent', who: agent }),
            ],
          },
        )}
      />,
    );

    expect(rows()).toEqual([
      `${at()}Agent changeAgent`,
      `${at()}Autosave`,
      `${at()}Autosave`,
      `${at()}Saved changes`,
      `${at()}Make the lid walls 2.4 mmAgent`,
    ]);
    const text = document.body.textContent;
    expect(text).not.toContain('Agent turn');
    expect(text).not.toContain('Saved changes (');
    expect(text).not.toContain('Tau agent');
    /* The agent's who carries its glyph, as History's does. */
    expect(document.querySelectorAll('[data-slot="entry-who"] svg')).toHaveLength(2);
  });

  it('names who made an entry as History does, never by a model or account id (HQ4)', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log' },
          {
            where: 'main',
            revisions: [
              revision({
                who: {
                  kind: 'recorded',
                  identity: {
                    kind: 'agent',
                    id: 'claude-opus-4',
                    runId: 'run-1',
                    onBehalfOf: { kind: 'user', id: 'user_2abc' },
                  },
                },
                source: 'agent',
              }),
              revision({
                revisionId: '7cbef6c',
                who: { kind: 'recorded', identity: { kind: 'user', id: 'user_2abc' } },
                source: 'user',
              }),
            ],
          },
        )}
      />,
    );

    expect(rows()[0]).toContain('Agent');
    expect(rows()[1]).toBe(`${at()}Thickened the bracket`);
    expect(screen.queryByText(/claude-opus-4|user_2abc|^agent$/u)).toBeNull();
  });

  /* A2: the card asks the resolver History asks, so L1–L4 and a pseudonym read the same here. */
  it('reads the fallback ids L1–L4 as no name and a pseudonym as Anonymous, as History does', () => {
    const fallbacks = ['prj_x', 'tau-host', 'richard', 'maker@example.com'];
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'log' },
          {
            where: 'main',
            revisions: [
              revision({
                revisionId: 'r5',
                who: { kind: 'recorded', identity: { kind: 'user', id: 'anon:3fa9c1', anonymous: true } },
                summary: 'Hidden',
              }),
              ...fallbacks.map((actor, index) =>
                revision({
                  revisionId: `r${String(4 - index)}`,
                  who: { kind: 'recorded', identity: { kind: 'user', id: actor } },
                  summary: 'Saved',
                }),
              ),
            ],
          },
        )}
      />,
    );

    expect(rows()).toEqual([`${at()}HiddenAnonymous`, `${at()}Saved`, `${at()}Saved`, `${at()}Saved`, `${at()}Saved`]);
    expect(screen.queryByText(/3fa9c1|prj_x|tau-host|richard|example\.com/u)).toBeNull();
  });

  it('marks an entry that needs your decision', () => {
    render(
      <ChatMessageToolRevisions
        part={answered({ action: 'log' }, { where: 'main', revisions: [revision({ conflicted: true })] })}
      />,
    );

    expect(rows()[0]).toContain('Needs your decision');
  });

  it('counts the files a diff changed and names each one with how it changed', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'diff', from: 'a', to: 'b' },
          {
            where: 'main',
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
    expect(description()).toBe('main · 3 files');
    expect(rows()).toEqual(['src/bracket.ts(modified)', 'models/plate.step(added)', 'notes.md(deleted)']);
  });

  it('says No changes for a diff that changed nothing', () => {
    render(<ChatMessageToolRevisions part={answered({ action: 'diff', to: 'b' }, { where: 'main', changes: [] })} />);

    expect(rows()).toEqual(['No changes']);
  });

  it('marks which branch a describe is on with no number, and counts the rest', () => {
    render(
      <ChatMessageToolRevisions
        part={answered(
          { action: 'describe' },
          {
            where: 'main',
            branch: 'main',
            branches: [
              { name: 'main', revisionId: 'aaa' },
              { name: 'sketch', revisionId: 'bbb' },
            ],
          },
        )}
      />,
    );

    expect(verb()).toBe('Checked');
    expect(description()).toBe('main · 2 branches');
    expect(rows()).toEqual(['maincurrent', 'sketch']);
    expectNoSaveNumber();
  });

  it('carries the where line with no rows to disclose, and stays uncollapsible', () => {
    render(<ChatMessageToolRevisions part={answered({ action: 'describe' }, { where: 'No history yet' })} />);

    expect(description()).toBe('No history yet');
    expect(screen.queryByRole('list', { name: 'history rows' })).toBeNull();
    expect(screen.getByRole('article', { name: 'history tool card' }).dataset['collapsible']).toBe('false');
  });

  it('reads as pending while the call streams, in the verb of the action it named', () => {
    render(
      <ChatMessageToolRevisions part={{ toolCallId: 'tc_1', state: 'input-streaming', input: { action: 'diff' } }} />,
    );

    expect(verb()).toBe('Comparing');
    expect(description()).toBe('what changed...');
    expect(screen.getByRole('article', { name: 'history tool card' }).dataset['status']).toBe('loading');
  });

  it('offers nothing to press: reading history is the whole card (I10)', () => {
    render(<ChatMessageToolRevisions part={answered({ action: 'log' }, { where: 'main', revisions: [revision()] })} />);

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
          errorText: 'This project has no history available here.',
        }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.dataset['noun']).toBe('history');
    expect(alert.textContent).toBe('This project has no history available here.');
  });

  it('shows an empty history as empty rather than as no answer', () => {
    render(<ChatMessageToolRevisions part={answered({ action: 'log' }, { where: 'main', revisions: [] })} />);

    expect(rows()).toEqual(['No history yet']);
    expectNoSaveNumber();
  });
});
