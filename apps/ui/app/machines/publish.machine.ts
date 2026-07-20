import { publicationApiCode } from '@taucad/types/constants';
import { assign, assertEvent, setup, waitFor } from 'xstate';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { ENV } from '#environment.config.js';
import {
  isForbiddenPublishRelativePath,
  normalizePublishRelativePath,
  validateCollectedPublishFiles,
} from '#utils/publish.utils.js';

export type PublishVisibility = 'private' | 'public';

export class PublishUploadError extends Error {
  public readonly status?: number;
  public readonly apiCode?: string;
  public readonly networkFault: boolean;

  public constructor(
    message: string,
    options?: { readonly status?: number; readonly apiCode?: string; readonly networkFault?: boolean },
  ) {
    super(message);
    this.name = 'PublishUploadError';
    this.status = options?.status;
    this.apiCode = options?.apiCode;
    this.networkFault = options?.networkFault ?? false;
  }
}

export function isPublishUploadError(error: unknown): error is PublishUploadError {
  return error instanceof PublishUploadError;
}

type ClientPublishManifest = {
  projectId: string;
  projectName: string;
  entryPath: string;
  visibility: PublishVisibility;
  title: string;
  description?: string;
  parameters?: Record<string, unknown>;
  sharedEmails?: string[];
  notifyRecipients?: boolean;
};

export type PublishMachineInput = {
  fileManagerRef: FileManagerRef;
  projectId: string;
  projectName: string;
  entryPath: string;
  parameters?: Record<string, unknown>;
};

type PublishDraft = {
  visibility: PublishVisibility;
  title: string;
  description?: string;
  sharedEmails?: string[];
  notifyRecipients?: boolean;
};

type PublishContext = {
  fileManagerRef: FileManagerRef;
  projectId: string;
  projectName: string;
  entryPath: string;
  parameters?: Record<string, unknown>;

  publishDraft?: PublishDraft;

  collectedFiles?: Map<string, Uint8Array<ArrayBuffer>>;
  publicationId?: string;
  shareUrl?: string;

  error?: Error;
};

type PublishEventInternal =
  | {
      type: 'publish';
      visibility: PublishVisibility;
      title: string;
      description?: string;
      sharedEmails?: string[];
      notifyRecipients?: boolean;
    }
  | { type: 'reset' }
  | { type: 'publishFilesCollected'; files: Map<string, Uint8Array<ArrayBuffer>> }
  | { type: 'publishUploaded'; publicationId: string; shareUrl: string };

type PublishFilesCollectedEvent = {
  type: 'publishFilesCollected';
  files: Map<string, Uint8Array<ArrayBuffer>>;
};

type PublishUploadedEvent = {
  type: 'publishUploaded';
  publicationId: string;
  shareUrl: string;
};

const collectPublishFilesActor = fromSafeAsync<PublishFilesCollectedEvent, PublishMachineInput & PublishDraft>(
  async ({ input }) => {
    const snapshot = await waitFor(input.fileManagerRef, (state) => state.matches('ready') || state.matches('error'));

    if (snapshot.matches('error')) {
      throw new Error('File manager is not ready');
    }

    const { proxy } = snapshot.context;
    if (!proxy) {
      throw new Error('File manager proxy is unavailable');
    }

    const raw = await proxy.getDirectoryContents(`/projects/${input.projectId}`);
    const files = new Map<string, Uint8Array<ArrayBuffer>>();

    for (const [absolutePath, bytes] of Object.entries(raw)) {
      const prefix = `/projects/${input.projectId}/`;
      const relativePath = normalizePublishRelativePath(
        absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : absolutePath,
      );

      if (!relativePath || isForbiddenPublishRelativePath(relativePath)) {
        continue;
      }

      files.set(relativePath, bytes);
    }

    const validated = validateCollectedPublishFiles({ files, entryPath: input.entryPath });
    if (!validated.ok) {
      if (validated.reason === publicationApiCode.MISSING_ENTRY_PATH) {
        throw new Error(publicationApiCode.MISSING_ENTRY_PATH);
      }

      if (validated.reason === publicationApiCode.TOO_MANY_FILES) {
        throw new Error(publicationApiCode.TOO_MANY_FILES);
      }

      if (validated.reason === publicationApiCode.FILE_TOO_LARGE) {
        const path = validated.path ?? '';
        throw new Error(`${publicationApiCode.FILE_TOO_LARGE}:${path}`);
      }

      throw new Error(publicationApiCode.PAYLOAD_TOO_LARGE);
    }

    return { type: 'publishFilesCollected', files };
  },
);

type PublishUploadInput = {
  files: Map<string, Uint8Array<ArrayBuffer>>;
  draft: PublishDraft;
  projectId: string;
  projectName: string;
  entryPath: string;
  parameters?: Record<string, unknown>;
};

const uploadPublicationActor = fromSafeAsync<PublishUploadedEvent, PublishUploadInput>(async ({ input }) => {
  const baseUrl = ENV.TAU_API_URL.replace(/\/$/, '');
  const endpoint = `${baseUrl}/v1/publications`;

  const formData = new FormData();

  const manifest: ClientPublishManifest = {
    projectId: input.projectId,
    projectName: input.projectName,
    entryPath: input.entryPath,
    visibility: input.draft.visibility,
    title: input.draft.title.trim(),
    ...(input.draft.description === undefined ? {} : { description: input.draft.description.trim() }),
    ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
    ...(input.draft.sharedEmails === undefined || input.draft.sharedEmails.length === 0
      ? {}
      : { sharedEmails: input.draft.sharedEmails }),
    ...(input.draft.notifyRecipients === true ? { notifyRecipients: true } : {}),
  };

  formData.append('manifest', JSON.stringify(manifest));

  for (const [relativePath, buf] of input.files) {
    formData.append(relativePath, new Blob([buf]), relativePath);
  }

  const headers = new Headers();
  headers.set('Accept', 'application/json');

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });
  } catch {
    throw new PublishUploadError('NETWORK_FAULT', { networkFault: true });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let apiCode: string | undefined;
    try {
      const parsed = JSON.parse(text) as { code?: unknown };
      if (typeof parsed.code === 'string') {
        apiCode = parsed.code;
      }
    } catch {
      /* ignore non-JSON error bodies */
    }

    throw new PublishUploadError('PUBLISH_HTTP_ERROR', {
      status: response.status,
      apiCode,
    });
  }

  let json: { id?: string; urls?: { view?: string; share?: string } };
  try {
    json = (await response.json()) as { id?: string; urls?: { view?: string; share?: string } };
  } catch {
    throw new PublishUploadError('INVALID_RESPONSE');
  }

  const publicationId = json.id;
  const shareUrl = json.urls?.share ?? json.urls?.view;
  if (!publicationId || !shareUrl) {
    throw new PublishUploadError('INVALID_RESPONSE');
  }

  return { type: 'publishUploaded', publicationId, shareUrl };
});

const publishActors = {
  collectPublishFilesActor,
  uploadPublicationActor,
} as const;

export const publishMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as PublishContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as PublishEventInternal,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as PublishMachineInput,
  },
  actors: publishActors,
  actions: {
    assignPublishDraft: assign({
      publishDraft({ event }) {
        assertEvent(event, 'publish');
        return {
          visibility: event.visibility,
          title: event.title,
          ...(event.description === undefined ? {} : { description: event.description }),
          ...(event.sharedEmails === undefined ? {} : { sharedEmails: event.sharedEmails }),
          ...(event.notifyRecipients === undefined ? {} : { notifyRecipients: event.notifyRecipients }),
        };
      },
      error: undefined,
      publicationId: undefined,
      shareUrl: undefined,
      collectedFiles: undefined,
    }),
    assignCollectedFiles: assign({
      collectedFiles({ event }) {
        assertEvent(event, 'publishFilesCollected');
        return event.files;
      },
    }),
    assignUploadedPublication: assign({
      publicationId({ event }) {
        assertEvent(event, 'publishUploaded');
        return event.publicationId;
      },
      shareUrl({ event }) {
        assertEvent(event, 'publishUploaded');
        return event.shareUrl;
      },
      error: undefined,
    }),
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          return event.error;
        }

        return new Error('Unknown error');
      },
    }),
    resetContext: assign(({ context }) => ({
      ...context,
      publishDraft: undefined,
      collectedFiles: undefined,
      publicationId: undefined,
      shareUrl: undefined,
      error: undefined,
    })),
  },
}).createMachine({
  id: 'publish',
  context: ({ input }) => ({
    fileManagerRef: input.fileManagerRef,
    projectId: input.projectId,
    projectName: input.projectName,
    entryPath: input.entryPath,
    parameters: input.parameters,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        publish: {
          target: 'collectingFiles',
          actions: 'assignPublishDraft',
        },
        reset: {
          actions: 'resetContext',
        },
      },
    },
    collectingFiles: {
      invoke: {
        id: 'collectPublishFiles',
        src: 'collectPublishFilesActor',
        input: ({ context }) => {
          const draft = context.publishDraft;
          if (!draft) {
            throw new Error('publishDraft missing');
          }

          return {
            fileManagerRef: context.fileManagerRef,
            projectId: context.projectId,
            projectName: context.projectName,
            entryPath: context.entryPath,
            parameters: context.parameters,
            visibility: draft.visibility,
            title: draft.title,
            ...(draft.description === undefined ? {} : { description: draft.description }),
          };
        },
        onDone: {
          target: 'uploading',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
      on: {
        publishFilesCollected: {
          actions: 'assignCollectedFiles',
        },
      },
    },
    uploading: {
      invoke: {
        id: 'uploadPublication',
        src: 'uploadPublicationActor',
        input: ({ context }) => {
          const draft = context.publishDraft;
          const files = context.collectedFiles;
          if (!draft || !files) {
            throw new Error('missing draft/files');
          }

          return {
            files,
            draft,
            projectId: context.projectId,
            projectName: context.projectName,
            entryPath: context.entryPath,
            parameters: context.parameters,
          };
        },
        onDone: {
          target: 'success',
        },
        onError: {
          target: 'error',
          actions: 'setError',
        },
      },
      on: {
        publishUploaded: {
          actions: 'assignUploadedPublication',
        },
      },
    },
    success: {
      on: {
        reset: {
          target: 'idle',
          actions: 'resetContext',
        },
        publish: {
          target: 'collectingFiles',
          actions: 'assignPublishDraft',
        },
      },
    },
    error: {
      on: {
        publish: {
          target: 'collectingFiles',
          actions: 'assignPublishDraft',
        },
        reset: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },
  },
});
