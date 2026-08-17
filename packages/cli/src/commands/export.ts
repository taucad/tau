import { defineCommand } from 'citty';
import { consola } from 'consola';
import { resolve, basename, dirname, extname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileExtensionSet } from '@taucad/runtime/types';
import type { FileExtension } from '@taucad/runtime/types';
import { createNodeClient, isSafeRelativePath } from '@taucad/runtime/node';
import type { RuntimeClient } from '@taucad/runtime';

const parseJsonObject = (flag: string, input: string | undefined): Record<string, unknown> | undefined => {
  if (input === undefined) {
    return undefined;
  }

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TypeError(`Invalid JSON in ${flag}: ${detail}`);
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${flag} must be a JSON object`);
  }

  return value as Record<string, unknown>;
};

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
 * taucad export model.ts --ext=stl --export-options='{"binary":true}'
 * taucad export model.ts --ext=webp --export-options='{"width":1024,"height":576}'
 * taucad export model.ts --ext=glb --content='{"includeEdges":true}'
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
      description: 'Target extension; route availability depends on the input source (e.g. glb, stl, step)',
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
    exportOptions: {
      type: 'string',
      description: 'JSON object of options for the source-selected export route',
      required: false,
    },
    content: {
      type: 'string',
      description: 'JSON object of semantic content requested from the source-selected export route',
      required: false,
    },
  },
  async run({ args }) {
    const format = args.ext as FileExtension;

    if (!fileExtensionSet.has(format)) {
      throw new Error(`Unrecognized target extension: "${args.ext}"`);
    }

    const inputPath = resolve(args.file);
    const inputDirectory = dirname(inputPath);
    const inputBasename = basename(inputPath, extname(inputPath));
    const inputFilename = basename(inputPath);
    const outputPath = args.output ? resolve(args.output) : resolve(inputDirectory, `${inputBasename}.${format}`);

    const parameters = parseJsonObject('--params', args.params) ?? {};
    const exportOptions = parseJsonObject('--export-options', args.exportOptions);
    const content = parseJsonObject('--content', args.content);

    consola.start(`Exporting ${inputFilename} → ${basename(outputPath)}`);

    const client: RuntimeClient = await createNodeClient(inputDirectory);

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
        ...(exportOptions === undefined ? {} : { exportOptions }),
        ...(content === undefined ? {} : { content }),
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

      const outputDirectory = dirname(outputPath);
      const targetPaths = result.data.map((file, index) => {
        if (!isSafeRelativePath(file.name)) {
          throw new Error(`Export returned an unsafe relative artifact path: ${file.name}`);
        }
        return index === 0 ? outputPath : resolve(outputDirectory, file.name);
      });
      if (new Set(targetPaths).size !== targetPaths.length) {
        throw new Error(`Export artifact paths collide under ${outputDirectory}`);
      }

      for (const [index, file] of result.data.entries()) {
        const targetPath = targetPaths[index]!;
        // oxlint-disable-next-line no-await-in-loop -- Preflight completes before ordered filesystem writes begin.
        await mkdir(dirname(targetPath), { recursive: true });
        // oxlint-disable-next-line no-await-in-loop -- Ordered writes preserve producer artifact order in logs.
        await writeFile(targetPath, file.bytes);
        consola.success(`Wrote ${file.bytes.byteLength} bytes → ${targetPath}`);
      }
    } finally {
      client.terminate();
    }
  },
});
