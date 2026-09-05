import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type GeneratorRegistry = {
  generators: Record<string, unknown>;
};

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const registry = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'tools/workspace-plugin/generators.json'), 'utf8'),
) as GeneratorRegistry;

describe('workspace generator skill parity', () => {
  it.each(Object.keys(registry.generators).sort())(
    '%s has one discoverable owning skill and canonical command',
    (name) => {
      const skillPath = resolve(repositoryRoot, `.agents/skills/create-${name}/SKILL.md`);
      const skill = readFileSync(skillPath, 'utf8');

      expect(skill).toMatch(new RegExp(`^---\\nname: create-${name}\\n`, 'u'));
      expect(skill).toContain(`pnpm nx g @taucad/workspace-plugin:${name}`);
    },
  );

  it('keeps the Create Package placement router as a four-column Markdown table', () => {
    const skill = readFileSync(resolve(repositoryRoot, '.agents/skills/create-package/SKILL.md'), 'utf8');
    const router = skill.split('## Placement Router\n')[1]?.split('\n## Usage')[0];
    const rows = router?.split('\n').filter((line) => line.startsWith('|')) ?? [];

    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.split('|')).toHaveLength(6);
    }
    expect(router).toContain('| Code');
    expect(router).toContain('`scope:shared` or `scope:ui`, `type:app-lib layer:<layer>`');
  });
});
