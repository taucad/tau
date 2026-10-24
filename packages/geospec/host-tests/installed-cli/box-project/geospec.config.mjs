import process from 'node:process';
import { defineConfig } from 'geospec/config';
import { commandExporter } from 'geospec/model/node';

export default defineConfig({
  exporters: [
    commandExporter({
      id: 'box-exporter',
      extensions: ['box'],
      command: [process.execPath, 'box-exporter.mjs'],
      capabilities: { formats: ['step'], parameters: true },
      cwd: import.meta.dirname,
    }),
  ],
});
