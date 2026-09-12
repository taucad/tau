// @vitest-environment jsdom
/**
 * Red pin for the workspace-filesystem north star, wave W0.
 *
 * The assertion states the target behaviour, so it fails today. It is wrapped
 * in `it.fails` (execution-queue ruling P2) to keep the suite green while the
 * defect stands; the wave that fixes it removes `.fails`.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { systemSkillBundles } from '@taucad/skills/resources';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolUseSkill } from '#routes/w.$workspace.$project/chat-message-tool-use-skill.js';

type UseSkillInvocation = ToolInvocation<typeof toolName.useSkill>;

const editorSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: editorSend } }),
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [true, vi.fn(), vi.fn()] }));

/** The bundle the `use_skill` tool advertises, and the path it advertises for it. */
const bundle = systemSkillBundles[0]!;
const skillPath = `.agents/skills/${bundle.slug}/${bundle.files[0]!.path}`;

const readSkillPart = (): UseSkillInvocation => ({
  toolCallId: 'skill',
  state: 'output-available',
  input: { skillName: bundle.slug },
  output: {
    skillName: bundle.slug,
    resourceUri: `system:skills/${bundle.slug}/SKILL.md`,
    skillPath,
    source: 'system',
    frontmatter: {},
    content: bundle.body,
    supportingFiles: [],
  },
});

describe('built-in skill row links (north star W0)', () => {
  // oxlint-disable-next-line eslint/capitalized-comments -- the pin header is the exact wording the W0 brief specifies
  // north-star W0 pin 2: a skill row link opens "File not found" because the built-in bundle path is dispatched as an ordinary writable project file that only the agent's overlay can serve; turns green in W2 + W4; remove .fails then.
  it.fails('should open a built-in skill bundle file as a read-only entry', async () => {
    render(<ChatMessageToolUseSkill part={readSkillPart()} />);

    await userEvent.click(screen.getByRole('button', { name: bundle.slug }));

    expect(editorSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'openFile', path: skillPath, readOnly: true }),
    );
  });
});
