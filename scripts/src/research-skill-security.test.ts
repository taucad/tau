import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const skillsRoot = resolve(repoRoot, '.agents/skills');
const skillPath = (skill: string): string => resolve(skillsRoot, skill, 'SKILL.md');

describe('research workflow ownership', () => {
  it('should keep reference conversion in create-reference and synthesis in create-research', () => {
    const createReference = readFileSync(skillPath('create-reference'), 'utf8');
    const createResearch = readFileSync(skillPath('create-research'), 'utf8');
    expect(createReference).toContain('sole owner of reference-manifest');
    expect(createReference).toContain('scripts:pdf-to-md');
    expect(createReference).toContain('scripts:text-to-md');
    expect(createReference).toContain('docs/reference/_index.yaml');
    expect(createResearch).toContain('references-ready');
    expect(createResearch).toContain('../create-reference/SKILL.md');
    expect(createResearch).not.toContain('scripts:pdf-to-md');
    expect(createResearch).not.toContain('scripts:text-to-md');
    expect(createResearch).not.toContain('_index.yaml');
  });
});
