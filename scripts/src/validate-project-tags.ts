/**
 * Assert every Nx project carries valid `type:` and `scope:` tags, and every
 * application library also carries a valid `layer:` tag.
 *
 * The rule and the vocabulary live in `@taucad/nx`; this is the CLI over them.
 *
 * Usage: pnpm nx run scripts:validate-project-tags
 */
import process from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateTags, workspace } from '@taucad/nx';

const main = async (): Promise<void> => {
  const workspaceValue = await workspace({ fresh: true });
  const violations = validateTags(workspaceValue);

  if (violations.length > 0) {
    throw new Error(`Invalid project tags:\n${violations.map((line) => `  - ${line}`).join('\n')}`);
  }

  console.log(`✓ ${String(workspaceValue.projects.length)} projects carry valid project tags`);
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
