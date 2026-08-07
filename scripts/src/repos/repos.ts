/* oxlint-disable no-restricted-imports -- standalone scripts use relative imports */

import process from 'node:process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './commands.ts';

const [command] = process.argv.slice(2);

if (command) {
  run(process.argv.slice(2));
} else {
  const tuiPath = join(dirname(fileURLToPath(import.meta.url)), 'repos-tui.mjs');

  if (!existsSync(tuiPath)) {
    console.error('TUI not available. Build first: pnpm nx build scripts');
    console.error('Or use CLI mode: pnpm repos help');
    process.exit(1);
  }

  const tui = (await import(tuiPath)) as { launch: () => void };
  tui.launch();
}
