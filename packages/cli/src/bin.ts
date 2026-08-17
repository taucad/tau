import { defineCommand, runMain } from 'citty';

const main = defineCommand({
  meta: {
    name: 'taucad',
    version: '0.0.1',
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
