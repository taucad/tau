import { defineCommand, runMain } from 'citty';
// oxlint-disable-next-line no-restricted-imports -- relative import is the only portable way to load the CLI's own package.json (matches `packages/runtime/src/utils/package-info.ts`).
import packageJson from '../package.json' with { type: 'json' };

const main = defineCommand({
  meta: {
    name: 'taucad',
    version: packageJson.version,
    description: 'CLI for @taucad/runtime — render and export CAD files from the terminal',
  },
  subCommands: {
    export: async () => {
      const { exportCommand } = await import('./commands/export.js');
      return exportCommand;
    },
  },
});

void runMain(main);
