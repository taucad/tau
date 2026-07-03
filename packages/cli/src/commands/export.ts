import { defineCommand } from 'citty';
import { consola } from 'consola';
import { resolve, basename, dirname, extname } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { FileExtension } from '@taucad/types';
import { fileExtensionSet } from '@taucad/types/constants';
import { createNodeClient } from '@taucad/runtime/node';

/**
 * `taucad export` command.
 *
 * Renders a CAD source file and exports geometry to the specified format.
 *
 * @example <caption>Export a model to GLB</caption>
 * ```bash
 * taucad export model.ts --ext=glb
 * taucad export bambu-plate.ts --ext=stl --output=plate.stl
 * taucad export gear.ts --ext=step --params='{"teeth":24}'
 * ```
 */
export const exportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export a CAD file to a target format',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Input CAD file path (e.g. model.ts)',
      required: true,
    },
    ext: {
      type: 'string',
      description: 'Output format extension (glb, stl, step, 3mf, ...)',
      required: true,
    },
    output: {
      type: 'string',
      description: 'Output file path (defaults to <input-basename>.<ext>)',
      required: false,
    },
    params: {
      type: 'string',
      description: 'JSON-encoded parameters for the model (e.g. \'{"width":100}\')',
      required: false,
    },
  },
  async run({ args }) {
    const format = args.ext as FileExtension;

    if (!fileExtensionSet.has(format)) {
      throw new Error(`Unsupported format: "${args.ext}". Supported: ${[...fileExtensionSet].join(', ')}`);
    }

    const inputPath = resolve(args.file);
    const inputDirectory = dirname(inputPath);
    const inputBasename = basename(inputPath, extname(inputPath));
    const inputFilename = basename(inputPath);
    const outputPath = args.output ? resolve(args.output) : resolve(inputDirectory, `${inputBasename}.${format}`);

    let parameters: Record<string, unknown> = {};
    if (args.params) {
      try {
        parameters = JSON.parse(args.params) as Record<string, unknown>;
      } catch {
        throw new Error(`Invalid JSON in --params: ${args.params}`);
      }
    }

    consola.start(`Exporting ${inputFilename} → ${basename(outputPath)}`);

    const client = await createNodeClient(inputDirectory);

    client.on('log', (entry) => {
      const level = entry.level as 'info' | 'warn' | 'error' | 'debug';
      if (level in consola) {
        consola[level](entry.message);
      }
    });

    try {
      const result = await client.export(format, {
        source: { path: inputFilename },
        parameters,
      });

      if (!result.success) {
        const messages = result.issues.map((i) => i.message).join('\n  ');
        throw new Error(`Export failed:\n  ${messages}`);
      }

      for (const issue of result.issues) {
        if (issue.severity === 'warning') {
          consola.warn(issue.message);
        }
      }

      await writeFile(outputPath, result.data.bytes);
      consola.success(`Wrote ${result.data.bytes.byteLength} bytes → ${outputPath}`);
    } finally {
      client.terminate();
    }
  },
});
