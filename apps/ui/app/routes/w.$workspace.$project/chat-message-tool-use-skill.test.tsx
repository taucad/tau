// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type React from 'react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { systemSkillBundles } from '@taucad/skills/resources';
import type { FileProvenance } from '@taucad/types';
import { ChatMessageToolUseSkill } from '#routes/w.$workspace.$project/chat-message-tool-use-skill.js';

type UseSkillInvocation = ToolInvocation<typeof toolName.useSkill>;

/** What the card handed the link, so the wire record it mints is observable. */
const linked = vi.hoisted(() => [] as Array<{ path: string; provenance: FileProvenance | undefined }>);

vi.mock('#components/files/file-link.js', () => ({
  FileLink({
    children,
    path,
    provenance,
  }: {
    readonly children: React.ReactNode;
    readonly path: string;
    readonly provenance?: FileProvenance;
  }) {
    linked.push({ path, provenance });
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
    { source: 'system', skillPath: undefined, suffix: 'system' },
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

  /*
   * Review R2 of a1: `identity` is the wire's overlay-unit key
   * (`skill:<slug>@<version>#<fingerprint>`), the shape `composeView` mints and
   * the shape an override records as `overrides`. A bare fingerprint is not it.
   */
  it('mints the overlay unit identity the composed view uses', () => {
    const bundle = systemSkillBundles[0]!;
    linked.length = 0;
    render(
      <ChatMessageToolUseSkill
        part={{
          toolCallId: 'skill',
          state: 'output-available',
          input: { skillName: bundle.slug },
          output: {
            skillName: bundle.slug,
            resourceUri: `system:skills/${bundle.slug}/SKILL.md`,
            skillPath: `.agents/skills/${bundle.slug}/SKILL.md`,
            source: 'system',
            fingerprint: bundle.fingerprint,
            frontmatter: {},
            content: bundle.body,
            supportingFiles: [],
          },
        }}
      />,
    );

    expect(linked.at(-1)?.provenance).toEqual({
      source: 'system-skills',
      versioned: false,
      agentAccess: 'read-only',
      identity: `skill:${bundle.slug}@${bundle.version}#${bundle.fingerprint}`,
    });
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
