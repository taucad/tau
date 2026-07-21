import deepmerge from 'deepmerge';
import { z } from 'zod';
import { fileParameterEntrySchema, getActiveGroupValues, parametersDirectory } from '@taucad/types';
import { resolveVirtualPath } from '@taucad/utils/path';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { isNotFoundError } from '#filesystem/filesystem-errors.js';

const resolveParameterFilePath = (entryPath: string, parametersDirectoryPath: string): string => {
  const localEntryPath = resolveVirtualPath(entryPath).slice(1);
  return resolveVirtualPath(`/${parametersDirectoryPath}/${localEntryPath}.json`);
};

/**
 * Middleware that applies persisted parameter-group values during geometry creation.
 *
 * Each normalized runtime entry path maps to a runtime path beneath `parametersDir`. For example,
 * `/src/box.ts` maps to `/.tau/parameters/src/box.ts.json` by default. The active
 * group's values are deep-merged over the request parameters, with arrays replaced
 * rather than concatenated.
 *
 * The parameter file is included in dependency hashing and registered for watching.
 * Missing, malformed, or incomplete files leave the request unchanged. Other
 * read failures propagate so stale handles, permission errors, and provider
 * failures cannot be mistaken for an absent optional parameter file.
 *
 * @public
 */
export const parameterFileResolver = defineMiddleware({
  id: 'parameterFileResolver',
  name: 'parameter-file-resolver',
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

    let decoded: unknown;
    try {
      decoded = JSON.parse(content);
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
      return handler(input);
    }

    const entry = fileParameterEntrySchema.safeParse(decoded);
    if (!entry.success) {
      return handler(input);
    }

    return handler({
      ...input,
      parameters: deepmerge(input.parameters, getActiveGroupValues(entry.data), {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      }),
    });
  },
});
