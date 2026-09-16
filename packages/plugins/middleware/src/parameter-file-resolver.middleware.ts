import deepmerge from 'deepmerge';
import { z } from 'zod';
import { getActiveGroupValues, parametersDirectory } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';
import { assertRootedPath, isNotFoundError } from '@taucad/runtime/kernel';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { readParameterRecord } from '@taucad/parameters';

const encoder = new TextEncoder();

const recordFailure = (code: 'INVALID_RECORD' | 'UNSUPPORTED_RECORD', message: string): Error =>
  Object.assign(new Error(message), {
    issues: [
      {
        code,
        message,
        type: 'runtime',
        severity: 'error',
      } satisfies KernelIssue,
    ],
  });

const resolveParameterFilePath = (entryPath: string, parametersDirectoryPath: string): string => {
  const localEntryPath = assertRootedPath(entryPath);
  const directory = assertRootedPath(parametersDirectoryPath);
  return assertRootedPath(`${directory ? `${directory}/` : ''}${localEntryPath}.json`);
};

/**
 * Middleware that applies persisted parameter-group values during geometry creation.
 *
 * Each normalized runtime entry path maps to a runtime path beneath `parametersDir`. For example,
 * `src/box.ts` maps to `.tau/parameters/src/box.ts.json` by default. The active
 * group's values are deep-merged over the request parameters, with arrays replaced
 * rather than concatenated.
 *
 * The parameter file is included in dependency hashing and registered for watching.
 * Missing files leave the request unchanged. Invalid or unsupported records
 * surface a stable diagnostic, and other read failures propagate so stale
 * handles, permission errors, and provider failures cannot be mistaken for an
 * absent optional parameter file.
 *
 * @public
 */
export const parameterFileResolver = defineMiddleware({
  id: 'parameterFileResolver',
  name: 'ParameterFileResolver',
  optionsSchema: z.object({
    parametersDir: z.string().default(parametersDirectory),
    /** Milliseconds. */
    watchDebounce: z.number().default(0),
  }),

  getDependencies({ entryPath }, { options }) {
    return [
      {
        path: resolveParameterFilePath(entryPath, options.parametersDir),
        watchDebounce: options.watchDebounce,
      },
    ];
  },

  async wrapCreateGeometry(input, handler, runtime) {
    const parametersPath = resolveParameterFilePath(input.entryPath, runtime.options.parametersDir);
    let content: string;
    try {
      content = await runtime.filesystem.readFile(parametersPath, 'utf8');
    } catch (error) {
      if (isNotFoundError(error)) {
        return handler(input);
      }
      throw error;
    }

    const decoded = readParameterRecord(encoder.encode(content), {
      migrationAvailable: false,
    });
    if (decoded.status === 'invalid-preserved') {
      throw recordFailure('INVALID_RECORD', `Invalid parameter record: ${decoded.error}`);
    }
    if (decoded.status === 'unsupported-preserved') {
      throw recordFailure('UNSUPPORTED_RECORD', 'Unsupported parameter record version or profile.');
    }
    const entry = decoded.record;

    return handler({
      ...input,
      parameters: deepmerge(input.parameters, getActiveGroupValues(entry), {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      }),
    });
  },
});
