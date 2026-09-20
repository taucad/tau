import deepmerge from 'deepmerge';
import { z } from 'zod';
import { parameterEntryPath } from '@taucad/types';
import type { KernelIssue } from '@taucad/runtime/types';
import { isNotFoundError } from '@taucad/runtime/kernel';
import { defineMiddleware } from '@taucad/runtime/middleware';
import { parameterRecordInputValues, requireParameterRecord } from '@taucad/parameters';

const encoder = new TextEncoder();

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The kernel issue for a record `requireParameterRecord` refused. */
const recordIssue = (error: unknown): KernelIssue => ({
  code: 'INVALID_RECORD',
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

/**
 * Middleware that applies persisted parameter-group values during geometry creation.
 *
 * Each normalized runtime entry path maps to its canonical parameter record path. The active
 * group's values are merged below caller overrides, with arrays replaced rather than concatenated.
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
    /** Milliseconds. */
    watchDebounce: z.number().default(0),
  }),

  getDependencies({ entryPath }, { options }) {
    return [
      {
        path: parameterEntryPath(entryPath),
        affects: ['createGeometry'],
        watchDebounce: options.watchDebounce,
      },
    ];
  },

  async wrapCreateGeometry(input, handler, runtime) {
    const parametersPath = parameterEntryPath(input.entryPath);
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
      parameters: deepmerge(parameterRecordInputValues(entry), input.parameters, {
        arrayMerge: (_target: unknown[], source: unknown[]) => source,
      }),
    });
  },
});
