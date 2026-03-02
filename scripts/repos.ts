import process from 'node:process';

const [command] = process.argv.slice(2);

if (command) {
  const { run } = await import('./repos/commands.ts');
  run(process.argv.slice(2));
} else {
  const { tsImport } = await import('tsx/esm/api');
  const { launch } = (await tsImport('./repos/ui.tsx', import.meta.url)) as { launch: () => void };
  launch();
}
