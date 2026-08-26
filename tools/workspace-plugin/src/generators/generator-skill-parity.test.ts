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
});
