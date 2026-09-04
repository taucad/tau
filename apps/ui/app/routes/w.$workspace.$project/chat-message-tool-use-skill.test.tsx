// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolUseSkill } from '#routes/w.$workspace.$project/chat-message-tool-use-skill.js';

type UseSkillInvocation = ToolInvocation<typeof toolName.useSkill>;

vi.mock('#components/files/file-link.js', () => ({
  FileLink({ children, path }: { readonly children: React.ReactNode; readonly path: string }) {
    return <a href={`#${path}`}>{children}</a>;
  },
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [true, vi.fn(), vi.fn()] }));

describe('ChatMessageToolUseSkill', () => {
  it.each(['input-streaming', 'input-available'] as const)(
    'reads a named skill during %s without an empty disclosure',
    (state) => {
      render(<ChatMessageToolUseSkill part={{ toolCallId: 'skill', state, input: { skillName: 'woodworking' } }} />);
      expect(screen.getByText('Reading').parentElement).toHaveTextContent('Reading woodworking skill…');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('handles partial input without repeating the word skill', () => {
    render(<ChatMessageToolUseSkill part={{ toolCallId: 'skill', state: 'input-streaming' }} />);
    expect(screen.getByText('Reading').parentElement).toHaveTextContent('Reading skill…');
  });

  it.each([
    { source: 'system', skillPath: undefined, suffix: ' system' },
    { source: 'user', skillPath: '.agents/skills/woodworking/SKILL.md', suffix: '' },
    { source: 'tau-store', skillPath: undefined, suffix: '' },
    { source: 'legacy-source', skillPath: undefined, suffix: '' },
  ])('renders $source provenance without a transport URI', ({ source, skillPath, suffix }) => {
    const part: UseSkillInvocation = {
      toolCallId: 'skill',
      state: 'output-available',
      input: { skillName: 'woodworking' },
      output: {
        skillName: 'woodworking',
        resourceUri: `${source}:skills/woodworking/SKILL.md`,
        skillPath,
        source,
        frontmatter: {},
        content: '# Woodworking',
        supportingFiles: [],
      },
    };
    render(<ChatMessageToolUseSkill part={part} />);
    expect(screen.getByText('Read').parentElement).toHaveTextContent(`Read woodworking skill${suffix}`);
    expect(screen.queryByText(part.output.resourceUri)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    if (skillPath) {
      expect(screen.getByRole('link', { name: 'woodworking' })).toHaveAttribute('href', `#${skillPath}`);
      expect(screen.queryByText('user')).not.toBeInTheDocument();
    } else {
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    }
  });

  it('renders read errors through the shared error disclosure', () => {
    render(
      <ChatMessageToolUseSkill
        part={{
          toolCallId: 'skill',
          state: 'output-error',
          input: { skillName: 'missing' },
          errorText: 'Skill not found',
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Attempted skill read/ })).toBeInTheDocument();
  });
});
