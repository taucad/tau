import { describe, expect, it } from 'vitest';
import { projectNameGenerationSystemPrompt } from '#api/chat/prompts/cad-name.prompt.js';
import { commitMessageGenerationSystemPrompt } from '#api/chat/prompts/git-commit.prompt.js';

describe('projectNameGenerationSystemPrompt', () => {
  it('should require generated project titles to use Title Case', () => {
    expect(projectNameGenerationSystemPrompt).toContain('should use Title Case');
    expect(projectNameGenerationSystemPrompt).toContain('The title should be 1-3 words');
  });
});

describe('commitMessageGenerationSystemPrompt', () => {
  it('should keep conventional commit casing and remain exempt from Title Case display-label guidance', () => {
    expect(commitMessageGenerationSystemPrompt).toContain('type(scope): description');
    expect(commitMessageGenerationSystemPrompt).toContain('feat(geometry): add parametric box with rounded corners');
    expect(commitMessageGenerationSystemPrompt).toContain('fix(render): correct tessellation for curved surfaces');
    expect(commitMessageGenerationSystemPrompt).not.toContain('Title Case');
  });
});
