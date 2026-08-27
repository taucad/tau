import type { Chat } from '@taucad/chat';
import type { FileSystemBackend, ProjectManifest } from '@taucad/types';
import type { EditorState } from '#types/editor.types.js';
import type { ProjectLibraryState } from '#types/project.types.js';

export type PendingProjectBackend = Exclude<FileSystemBackend, 'memory'>;

export type PendingProjectStorage =
  | {
      readonly backend: Exclude<PendingProjectBackend, 'webaccess'>;
      readonly providerBasePath: string;
    }
  | {
      readonly backend: 'webaccess';
      readonly workspaceId: string;
      readonly providerBasePath: string;
    };

export type PendingCreateProjectOperation = PendingProjectStorage & {
  readonly operationId: string;
  readonly kind: 'create';
  readonly manifest: ProjectManifest;
  readonly library: ProjectLibraryState;
  readonly files: Record<string, { readonly content: Uint8Array<ArrayBuffer> }>;
  readonly chat: Chat;
  readonly editorState: EditorState;
};

export type PendingDuplicateProjectOperation = PendingProjectStorage & {
  readonly operationId: string;
  readonly kind: 'duplicate';
  readonly sourceProjectId: string;
  readonly manifest: ProjectManifest;
  readonly library: ProjectLibraryState;
  /** Stable source snapshot captured before the durable operation is created. */
  readonly files: Record<string, { readonly content: Uint8Array<ArrayBuffer> }>;
  readonly chats: readonly Chat[];
  readonly editorState?: EditorState;
};

export type PendingPermanentDeleteProjectOperation = {
  readonly operationId: string;
  readonly kind: 'permanent-delete';
  readonly projectId: string;
  readonly storage: PendingProjectStorage;
};

export type PendingProjectOperation =
  | PendingCreateProjectOperation
  | PendingDuplicateProjectOperation
  | PendingPermanentDeleteProjectOperation;

export type PendingProjectRecoveryReason =
  | 'workspace-unavailable'
  | 'identity-conflict'
  | 'filesystem-error'
  | 'local-state-error';

type PendingProjectRecoveryBase = {
  readonly operationId: string;
  readonly projectId: string;
  readonly kind: PendingProjectOperation['kind'];
  readonly storage: PendingProjectStorage;
};

/** Session projection of one durable pending operation. */
export type PendingProjectRecovery =
  | (PendingProjectRecoveryBase & { readonly status: 'recovering' })
  | (PendingProjectRecoveryBase & {
      readonly status: 'failed';
      readonly reason: PendingProjectRecoveryReason;
    });
