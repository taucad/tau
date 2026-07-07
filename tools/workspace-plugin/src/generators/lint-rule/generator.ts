import { formatFiles, generateFiles, names } from '@nx/devkit';
import type { Tree } from '@nx/devkit';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

type LintRuleGeneratorSchema = {
  name: string;
  description?: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * Scaffold a `tau-lint` custom oxlint rule and its RuleTester test under
 * `libs/oxlint/src/rules/`.
 *
 * The generator only bootstraps the two files — wiring the rule into the plugin
 * (`libs/oxlint/src/tau-lint.js`) and enabling it in `.oxlintrc.json` are the
 * two documented manual steps in the `/create-lint-rule` skill, kept out of the
 * generator so it never has to rewrite the JSONC config or the plugin barrel.
 */
export const lintRuleGenerator = async (tree: Tree, schema: LintRuleGeneratorSchema): Promise<void> => {
  const { fileName, propertyName } = names(schema.name);
  const oxlintRoot = 'libs/oxlint';

  const substitutions = {
    fileName,
    propertyName,
    ruleName: fileName,
    description: schema.description?.trim() ? schema.description.trim() : `TODO: describe what ${fileName} enforces.`,
    tmpl: '',
  };

  generateFiles(tree, join(currentDirectory, 'files'), oxlintRoot, substitutions);

  await formatFiles(tree);
};

export default lintRuleGenerator;
