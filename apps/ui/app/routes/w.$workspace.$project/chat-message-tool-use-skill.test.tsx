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
    return (
      <span data-testid='file-link' data-path={path}>
        {children}
      </span>
    );
  },
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [true, vi.fn(), vi.fn()],
}));

describe('ChatMessageToolUseSkill', () => {
  it('should render input states as Using skill', () => {
    const part: UseSkillInvocation = {
      toolCallId: 'tc-use-skill',
      state: 'input-available',
      input: { skillName: 'woodworking' },
    };

    render(<ChatMessageToolUseSkill part={part} />);

    expect(screen.getByText('Using skill')).toBeInTheDocument();
    expect(screen.getByText('woodworking')).toBeInTheDocument();
  });

  it('should render output state as Used skill with source and file link', () => {
    const part: UseSkillInvocation = {
      toolCallId: 'tc-use-skill',
      state: 'output-available',
      input: { skillName: 'woodworking' },
      output: {
        skillName: 'woodworking',
        resourceUri: 'file:.agents/skills/woodworking/SKILL.md',
        skillPath: '.agents/skills/woodworking/SKILL.md',
        baseDirectory: '.agents/skills/woodworking',
        source: 'user',
        fingerprint: 'woodhash',
        frontmatter: {},
        content: '# Woodworking',
        supportingFiles: [],
      },
    };

    render(<ChatMessageToolUseSkill part={part} />);

    expect(screen.getByText('Used skill')).toBeInTheDocument();
    expect(screen.getByTestId('file-link')).toHaveAttribute('data-path', '.agents/skills/woodworking/SKILL.md');
    expect(screen.getByText('user')).toBeInTheDocument();
  });

  it('should render virtual system skills without a filesystem link', () => {
    const part: UseSkillInvocation = {
      toolCallId: 'tc-use-skill',
      state: 'output-available',
      input: { skillName: 'create-skill' },
      output: {
        skillName: 'create-skill',
        resourceUri: 'system:skills/create-skill/SKILL.md',
        source: 'system',
        fingerprint: 'systemhash',
        frontmatter: {},
        content: '# Create Skill',
        supportingFiles: [],
      },
    };

    render(<ChatMessageToolUseSkill part={part} />);

    expect(screen.getByText('Used skill')).toBeInTheDocument();
    expect(screen.queryByTestId('file-link')).not.toBeInTheDocument();
    expect(screen.getByText('system:skills/create-skill/SKILL.md')).toBeInTheDocument();
  });

  it('should render output-error through the shared tool error component', () => {
    const part: UseSkillInvocation = {
      toolCallId: 'tc-use-skill',
      state: 'output-error',
      input: { skillName: 'missing' },
      errorText: 'Skill not found',
    };

    render(<ChatMessageToolUseSkill part={part} />);

    expect(screen.getByText('Attempted')).toBeInTheDocument();
    expect(screen.getByText('skill use')).toBeInTheDocument();
  });
});
