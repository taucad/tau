import deepmerge from 'deepmerge';
import { z } from 'zod';
import { getActiveGroupValues, parametersDirectory } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';
import { assertRootedPath, isNotFoundError } from '@taucad/runtime/kernel';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { requireParameterRecord } from '@taucad/parameters';

const encoder = new TextEncoder();

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The kernel issue for a record `requireParameterRecord` refused. */
const recordIssue = (error: unknown): KernelIssue => ({
  code:
    error instanceof Error && 'code' in error && error.code === 'UNSUPPORTED_RECORD'
      ? 'UNSUPPORTED_RECORD'
      : 'INVALID_RECORD',
  message: errorMessage(error),
  type: 'runtime',
  severity: 'error',
});

/** Decode a stored record, reporting an unusable one as the typed kernel issue every reader shares. */
const recordFrom = (content: string): ReturnType<typeof requireParameterRecord> => {
  try {
    return requireParameterRecord(encoder.encode(content));
  } catch (error) {
    throw Object.assign(new Error(errorMessage(error)), { issues: [recordIssue(error)] });
  }
};

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

    const entry = recordFrom(content);

    return handler({
      ...input,
      parameters: deepmerge(input.parameters, getActiveGroupValues(entry), {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      }),
    });
  },
});
