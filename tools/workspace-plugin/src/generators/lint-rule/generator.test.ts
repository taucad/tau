import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing.js';
import { describe, expect, it } from 'vitest';

import { lintRuleGenerator } from '#generators/lint-rule/generator.js';

const readText = (tree: ReturnType<typeof createTreeWithEmptyWorkspace>, path: string): string => {
  const content = tree.read(path, 'utf8');
  if (!content) {
    throw new Error(`Expected ${path} to exist`);
  }

  return content;
};

describe('lint-rule generator', () => {
  it('scaffolds a rule and a matching RuleTester test under libs/oxlint/src/rules', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await lintRuleGenerator(tree, { name: 'no-foo-bar', description: 'Disallow foo bar.' });

    const rule = readText(tree, 'libs/oxlint/src/rules/no-foo-bar.js');
    expect(rule).toContain('export const noFooBarRule');
    expect(rule).toContain('Disallow foo bar.');
    expect(rule).toContain('create(context)');
    expect(rule).toContain("messageId: 'violation'");

    const test = readText(tree, 'libs/oxlint/src/rules/no-foo-bar.test.js');
    expect(test).toContain("import { noFooBarRule } from './no-foo-bar.js'");
    expect(test).toContain("describe('no-foo-bar'");
    expect(test).toContain("ruleTester.run('no-foo-bar', noFooBarRule");
  });

  it('falls back to a TODO description when none is provided', async () => {
    const tree = createTreeWithEmptyWorkspace();

    await lintRuleGenerator(tree, { name: 'require-baz' });

    const rule = readText(tree, 'libs/oxlint/src/rules/require-baz.js');
    expect(rule).toContain('export const requireBazRule');
    expect(rule).toContain('TODO: describe what require-baz enforces.');
  });
});
