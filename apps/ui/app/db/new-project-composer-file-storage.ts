import { z } from 'zod';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { cadAgentExecutionSchema, safeValidateUiMessages } from '@taucad/chat';
import { KeyedMutex } from '#db/keyed-mutex.js';

/** Sole Home-workspace record for the pre-project composer. */
export const newProjectComposerFilePath = '/.tau/composers/new-project.json';

export type NewProjectComposerRecord = {
  readonly version: 1;
  readonly draft?: MyUIMessage;
  readonly execution?: CadAgentExecution;
};

export type NewProjectComposerReadResult =
  | { readonly status: 'absent' }
  | { readonly status: 'valid'; readonly record: NewProjectComposerRecord }
  | { readonly status: 'invalid'; readonly error: Error };

type NewProjectComposerClient = {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
};

const envelopeSchema = z
  .object({
    version: z.literal(1),
    draft: z.unknown().optional(),
    execution: cadAgentExecutionSchema.optional(),
  })
  .strict();

const mutex = new KeyedMutex<string>();

const isNotFound = (error: unknown): boolean => {
  const candidate = error as { code?: unknown; name?: unknown };
  return candidate.code === 'ENOENT' || candidate.code === 'ENOTDIR' || candidate.name === 'NotFoundError';
};

const invalid = (error: unknown): NewProjectComposerReadResult => ({
  status: 'invalid',
  error: error instanceof Error ? error : new Error(String(error)),
});

const parseRecord = async (text: string): Promise<NewProjectComposerReadResult> => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return invalid(error);
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    return invalid(envelope.error);
  }
  if (envelope.data.draft === undefined) {
    return {
      status: 'valid',
      record: {
        version: 1,
        ...(envelope.data.execution === undefined ? {} : { execution: envelope.data.execution }),
      },
    };
  }

  const messages = await safeValidateUiMessages([envelope.data.draft]);
  if (!messages.success) {
    return invalid(messages.error);
  }
  const draft = messages.data[0];
  if (draft?.role !== 'user') {
    return invalid(new Error('The new-project composer draft must be one user message.'));
  }
  return { status: 'valid', record: { ...envelope.data, draft } };
};

const serializeRecord = (record: NewProjectComposerRecord): string => `${JSON.stringify(record, undefined, 2)}\n`;

/** Create the narrow filesystem store for the Home new-project composer. */
export function createNewProjectComposerFileStore(client: NewProjectComposerClient): {
  read: () => Promise<NewProjectComposerReadResult>;
  patchDraft: (draft: MyUIMessage) => Promise<void>;
  patchExecution: (execution: CadAgentExecution) => Promise<void>;
} {
  const read = async (): Promise<NewProjectComposerReadResult> => {
    try {
      return await parseRecord(await client.readFile(newProjectComposerFilePath, 'utf8'));
    } catch (error) {
      if (isNotFound(error)) {
        return { status: 'absent' };
      }
      throw error;
    }
  };

  const patch = async (field: Pick<NewProjectComposerRecord, 'draft'> | Pick<NewProjectComposerRecord, 'execution'>) =>
    mutex.run(newProjectComposerFilePath, async () => {
      const current = await read();
      const record: NewProjectComposerRecord = current.status === 'valid' ? current.record : { version: 1 };
      await client.writeFile(newProjectComposerFilePath, serializeRecord({ ...record, ...field }));
    });

  return {
    read,
    patchDraft: async (draft) => patch({ draft }),
    patchExecution: async (execution) => patch({ execution }),
  };
}
