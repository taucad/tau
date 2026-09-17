/**
 * The one composer record family (blueprint D1-D3, D8, D11).
 *
 * Every per-device composer record — the Home pre-project composer, one per
 * project chat, and one unread marker per project — is the same envelope in the
 * same Home-workspace directory, served by the same store. Home's `/` mount has
 * no revision port and no agent view, so a record under `/.tau/composers/` is
 * per-device by construction: it never enters a project tree, a chat ref tree,
 * an export or an agent filesystem.
 */

import { z } from 'zod';
import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { cadAgentExecutionSchema, safeValidateUiMessages } from '@taucad/chat';
import { chatMode } from '@taucad/chat/constants';
import type { ChatMode } from '@taucad/chat/constants';
import { getErrno } from '@taucad/utils/error';
import { createAttachmentStore } from '#db/attachment-store.js';
import type { AttachmentStore } from '#db/attachment-store.js';
import { KeyedMutex } from '#db/keyed-mutex.js';
import { attachmentReferenceOf, attachmentUrl, isSupportedAttachmentMediaType } from '#utils/attachment.utils.js';

const composersRoot = '/.tau/composers';

/** Every composer record path. Nothing here resolves into `/projects/**` or a chat ref tree. */
export const composerRecordPaths = {
  /** The sole Home pre-project composer record. */
  newProject: `${composersRoot}/new-project.json`,
  /** One record per project chat: draft, message edits, tool choice and mode. */
  chat: (projectId: string, chatId: string): string => `${composersRoot}/chats/${projectId}/${chatId}.json`,
  /** One record per project holding the unread chat ids, so the sidebar reads them in one call. */
  unread: (projectId: string): string => `${composersRoot}/chats/${projectId}/unread.json`,
  /** The directory removed when a project is deleted. */
  project: (projectId: string): string => `${composersRoot}/chats/${projectId}`,
  /**
   * Draft-stage bytes of a pre-project composer that keeps no record. One
   * directory per surface, so releasing one surface's copies never touches
   * another's open draft.
   */
  surfaceAttachments: (surface: 'marketing' | 'library'): string => `${composersRoot}/${surface}/attachments`,
} as const;

/** The draft-stage attachment directory beside a composer record: `<record>/attachments`. */
export const recordAttachmentsPath = (recordPath: string): string => `${recordPath.replace(/\.json$/, '')}/attachments`;

/** One composer record. Every field except `version` is optional and omitted when empty (D8). */
export type ComposerRecord = {
  readonly version: 1;
  readonly draft?: MyUIMessage;
  readonly messageEdits?: Readonly<Record<string, MyUIMessage>>;
  readonly toolChoice?: string | string[];
  readonly mode?: ChatMode;
  readonly unread?: Readonly<Record<string, true>>;
  readonly execution?: CadAgentExecution;
};

/**
 * A field-scoped patch. An omitted key leaves that field alone; a draft or edit
 * with no parts clears it; an `unread` entry set to `false` is removed.
 */
export type ComposerRecordPatch = {
  readonly draft?: MyUIMessage;
  readonly messageEdits?: Readonly<Record<string, MyUIMessage>>;
  readonly toolChoice?: string | string[];
  readonly mode?: ChatMode;
  readonly unread?: Readonly<Record<string, boolean>>;
  readonly execution?: CadAgentExecution;
};

/** Absence and unreadable bytes are different outcomes, and neither is an exception. */
export type ComposerRecordReadResult =
  | { readonly status: 'absent' }
  | { readonly status: 'valid'; readonly record: ComposerRecord }
  | { readonly status: 'invalid'; readonly error: Error };

/** The filesystem surface a composer record store needs — the same one its attachment store takes. */
export type ComposerRecordClient = {
  readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  writeFile: (path: string, data: Uint8Array<ArrayBuffer>) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  readdir: (path: string) => Promise<string[]>;
  unlink: (path: string) => Promise<void>;
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
};

/** The code every unrepairable `patch` rejection carries, so a caller branches without parsing a message. */
export const composerRecordInputErrorCode = 'COMPOSER_RECORD_UNREPAIRABLE_INPUT';

/** A patch this record can never accept. Retrying the same fields fails identically. */
export class ComposerRecordInputError extends Error {
  public readonly code = composerRecordInputErrorCode;

  /**
   * @param message - What about the patch is unacceptable.
   * @param options - Carries the underlying validation error as `cause`.
   */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ComposerRecordInputError';
  }
}

/**
 * Whether a `patch` rejection can never succeed on retry.
 *
 * `patch` rejects for exactly two reasons, and they need opposite handling:
 *
 * - **Never retry** — unrepairable input: a message that fails the UI-message
 *   schema, a non-user message, a `data:` URL attachment, an unsupported
 *   attachment media type, or a file URL that is not `attachments/<sha256>.<ext>`.
 *   These carry {@link composerRecordInputErrorCode}. Retrying replays the same
 *   rejection forever, and a retained pending patch would take every later
 *   field down with it, so the caller drops the offending fields instead.
 * - **Retry** — everything else, which is filesystem I/O from the client. These
 *   never carry the code and are the failures the backoff curve exists for.
 */
export const isComposerRecordInputError = (error: unknown): error is ComposerRecordInputError =>
  error instanceof Error && 'code' in error && error.code === composerRecordInputErrorCode;

/** The store for one record. */
export type ComposerRecordStore = {
  read: () => Promise<ComposerRecordReadResult>;
  /**
   * Merge `fields` into the record under the path's mutex.
   *
   * @throws {ComposerRecordInputError} When the patch can never be written; see
   *   {@link isComposerRecordInputError} for the retry contract.
   * @throws When the client's read or write fails. That failure is retryable.
   */
  patch: (fields: ComposerRecordPatch) => Promise<void>;
  remove: () => Promise<void>;
  attachments: AttachmentStore;
};

const envelopeSchema = z
  .object({
    version: z.literal(1),
    draft: z.unknown().optional(),
    messageEdits: z.record(z.string(), z.unknown()).optional(),
    toolChoice: z.union([z.string(), z.array(z.string())]).optional(),
    mode: z.enum(chatMode).optional(),
    unread: z.record(z.string(), z.literal(true)).optional(),
    execution: cadAgentExecutionSchema.optional(),
  })
  .strict();

// Keyed by absolute path, so two stores over one record still serialise their read-modify-writes.
const mutex = new KeyedMutex<string>();

// The write order every record is serialised in, so equal records produce equal bytes.
const fieldOrder = ['draft', 'messageEdits', 'toolChoice', 'mode', 'unread', 'execution'] as const;

const isNotFound = (error: unknown): boolean => {
  const code = getErrno(error);
  return code === 'ENOENT' || code === 'ENOTDIR' || (error as { name?: unknown }).name === 'NotFoundError';
};

const invalid = (error: unknown): ComposerRecordReadResult => ({
  status: 'invalid',
  error: error instanceof Error ? error : new Error(String(error)),
});

/** The draft machine persists a cleared composer as a user message with no parts; that means "no field". */
const isEmptyMessage = (message: MyUIMessage): boolean => message.parts.length === 0;

/** The same rule before validation, so a stored empty never has to satisfy the message schema. */
const isClearedMessage = (value: unknown): boolean => {
  const candidate = value as { role?: unknown; parts?: unknown } | undefined;
  return candidate?.role === 'user' && Array.isArray(candidate.parts) && candidate.parts.length === 0;
};

const omitEmpty = <T>(entries: Readonly<Record<string, T>>, isEmpty: (value: T) => boolean): Record<string, T> =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => !isEmpty(value)));

const withField = <T>(key: string, value: T | undefined): Record<string, T> =>
  value === undefined ? {} : { [key]: value };

const nonEmptyMap = <T>(entries: Record<string, T>): Record<string, T> | undefined =>
  Object.keys(entries).length === 0 ? undefined : entries;

/**
 * Every file part must point at this record's own attachment directory.
 * A legacy `data:` URL is tolerated on read and refused on write, so the first
 * write of that draft converts it to an attachment instead of entrenching it.
 */
const checkAttachments = (message: MyUIMessage, allowDataUrl: boolean): Error | undefined => {
  for (const part of message.parts) {
    if (part.type !== 'file') {
      continue;
    }
    if (part.url.startsWith('data:')) {
      if (allowDataUrl) {
        continue;
      }
      return new Error('A composer record cannot be written with a data: URL attachment; store the bytes first.');
    }
    if (!isSupportedAttachmentMediaType(part.mediaType)) {
      return new Error(`Unsupported attachment type: ${part.mediaType}`);
    }
    const reference = attachmentReferenceOf(part);
    if (reference === undefined) {
      return new Error(`A composer attachment must be referenced as attachments/<sha256>.<ext>, not ${part.url}.`);
    }
    // The extension names the file on disk, so it must be the one the media type implies (S9).
    if (attachmentUrl(reference) !== part.url) {
      return new Error(`Attachment ${part.url} does not match its media type ${part.mediaType}.`);
    }
  }
  return undefined;
};

/**
 * Validate the messages of a record or a patch in one pass.
 *
 * @returns The validated messages in the order given, or the first error.
 */
const validateMessages = async (
  candidates: readonly unknown[],
  allowDataUrl: boolean,
): Promise<{ messages: MyUIMessage[] } | { error: Error }> => {
  if (candidates.length === 0) {
    return { messages: [] };
  }
  const result = await safeValidateUiMessages(candidates);
  if (!result.success) {
    return { error: result.error };
  }
  for (const message of result.data) {
    if (message.role !== 'user') {
      return {
        error: new Error('A composer record holds only user messages.'),
      };
    }
    const attachmentError = checkAttachments(message, allowDataUrl);
    if (attachmentError) {
      return { error: attachmentError };
    }
  }
  return { messages: result.data };
};

const parseRecord = async (text: string): Promise<ComposerRecordReadResult> => {
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
  const { version, draft, messageEdits, toolChoice, mode, unread, execution } = envelope.data;

  // Records written before empties were omitted still carry `parts: []` (D8); they mean "no field".
  const storedDraft = draft === undefined || isClearedMessage(draft) ? undefined : draft;
  const editIds = Object.entries(messageEdits ?? {})
    .filter(([, value]) => !isClearedMessage(value))
    .map(([id]) => id);

  const validated = await validateMessages(
    [...(storedDraft === undefined ? [] : [storedDraft]), ...editIds.map((id) => messageEdits?.[id])],
    true,
  );
  if ('error' in validated) {
    return invalid(validated.error);
  }

  const validatedEdits = storedDraft === undefined ? validated.messages : validated.messages.slice(1);
  const edits = Object.fromEntries(
    editIds.flatMap((id, index) => {
      const message = validatedEdits[index];
      return message === undefined ? [] : [[id, message] as const];
    }),
  );

  return {
    status: 'valid',
    record: {
      version,
      ...withField('draft', storedDraft === undefined ? undefined : validated.messages[0]),
      ...withField('messageEdits', nonEmptyMap(edits)),
      ...withField('toolChoice', toolChoice),
      ...withField('mode', mode),
      ...withField('unread', nonEmptyMap({ ...unread })),
      ...withField('execution', execution),
    },
  };
};

const mergeRecord = (record: ComposerRecord, fields: ComposerRecordPatch): ComposerRecord => {
  const draft = fields.draft ?? record.draft;
  const edits =
    fields.messageEdits === undefined
      ? { ...record.messageEdits }
      : omitEmpty({ ...record.messageEdits, ...fields.messageEdits }, isEmptyMessage);
  const unread =
    fields.unread === undefined
      ? { ...record.unread }
      : omitEmpty({ ...record.unread, ...fields.unread }, (value) => !value);

  return {
    version: 1,
    ...withField('draft', draft === undefined || isEmptyMessage(draft) ? undefined : draft),
    ...withField('messageEdits', nonEmptyMap(edits)),
    ...withField('toolChoice', fields.toolChoice ?? record.toolChoice),
    ...withField('mode', fields.mode ?? record.mode),
    // `unread` only ever holds `true`, so the false entries dropped above are gone.
    ...withField('unread', nonEmptyMap(unread) as Readonly<Record<string, true>> | undefined),
    ...withField('execution', fields.execution ?? record.execution),
  };
};

const serializeRecord = (record: ComposerRecord): Uint8Array<ArrayBuffer> => {
  const ordered: Record<string, unknown> = { version: record.version };
  for (const key of fieldOrder) {
    if (record[key] !== undefined) {
      ordered[key] = record[key];
    }
  }
  return new TextEncoder().encode(`${JSON.stringify(ordered, undefined, 2)}\n`);
};

/**
 * Create the store for the record at `path`.
 *
 * @param client - Filesystem client; absolute paths reach the Home workspace from any route.
 * @param path - One of {@link composerRecordPaths}.
 * @returns Read, patch, remove and the record's own attachment store.
 */
export function createComposerRecordStore(client: ComposerRecordClient, path: string): ComposerRecordStore {
  const attachments = createAttachmentStore(client, recordAttachmentsPath(path));

  const read = async (): Promise<ComposerRecordReadResult> => {
    try {
      return await parseRecord(new TextDecoder().decode(await client.readFile(path)));
    } catch (error) {
      if (isNotFound(error)) {
        return { status: 'absent' };
      }
      // An I/O failure is not an absence; the caller must not overwrite what it could not read.
      throw error;
    }
  };

  return {
    read,
    attachments,
    patch: async (fields) => {
      // A cleared message removes its field, so it is never validated or written.
      const messages = [
        ...(fields.draft === undefined ? [] : [fields.draft]),
        ...Object.values(fields.messageEdits ?? {}),
      ].filter((message) => !isEmptyMessage(message));
      const validated = await validateMessages(messages, false);
      if ('error' in validated) {
        // Every write-side validation failure is unrepairable; only the client's I/O is worth retrying.
        throw new ComposerRecordInputError(validated.error.message, { cause: validated.error });
      }
      await mutex.run(path, async () => {
        const current = await read();
        const base: ComposerRecord = current.status === 'valid' ? current.record : { version: 1 };
        await client.writeFile(path, serializeRecord(mergeRecord(base, fields)));
      });
    },
    remove: async () =>
      mutex.run(path, async () => {
        try {
          await client.unlink(path);
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
        await attachments.removeAll();
      }),
  };
}
