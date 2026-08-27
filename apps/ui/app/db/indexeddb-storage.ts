import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { Chat } from '@taucad/chat';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { AppUiPreferences, CommitCancelledDraftRestoreInput, StorageProvider } from '#types/storage.types.js';
import type { EditorState, EditorStateInput } from '#types/editor.types.js';
import type {
  PendingPermanentDeleteProjectOperation,
  PendingProjectOperation,
} from '#types/pending-project-operation.types.js';
import type { PersistedRevisionState, ProjectLibraryState } from '#types/project.types.js';
import { metaConfig } from '#constants/meta.constants.js';
import { KeyedMutex } from '#db/keyed-mutex.js';

const defaultNavigationChatName = 'New chat';

/** Pre-cutover store, dropped by the v9 bootstrap. Nothing reads it. */
const legacyProjectsStoreName = 'projects';
const appUiPreferencesId = 'singleton';
const appUiPreferencesMutexKey = 'app-ui-preferences:singleton';

/**
 * Raised when an older connection — invariably another Tau tab — holds the
 * database open so the schema upgrade cannot start. Without this the open
 * request stays blocked forever and the app hangs on a spinner.
 */
export class StorageUpgradeBlockedError extends Error {
  public constructor() {
    super('Local storage could not be opened. Close other Tau tabs and reload.');
    this.name = 'StorageUpgradeBlockedError';
  }
}

function storageValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (left === null || right === null || left === undefined || right === undefined) {
    return left === right;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => storageValuesEqual(item, right[index]));
  }

  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(
      (key) => Object.hasOwn(rightRecord, key) && storageValuesEqual(leftRecord[key], rightRecord[key]),
    );
  }

  return false;
}

export class IndexedDbStorageProvider implements StorageProvider {
  /**
   * Per-key serialiser for every mutating operation against a single chat or
   * project row. Defence-in-depth on top of the atomic single-transaction
   * `get → put` writes (see {@link IndexedDbStorageProvider.updateChat}). See
   * `docs/policy/storage-policy.md` for the contract.
   */
  private readonly mutex = new KeyedMutex<string>();
  private get dbName(): string {
    return `${metaConfig.databasePrefix}db`;
  }

  private get projectLibraryStatesStoreName(): string {
    return 'projectLibraryStates';
  }

  private get appUiPreferencesStoreName(): string {
    return 'appUiPreferences';
  }

  private get chatsStoreName(): string {
    return 'chats';
  }

  private get editorStoreName(): string {
    return 'editor';
  }

  private get pendingProjectOperationsStoreName(): string {
    return 'pendingProjectOperations';
  }

  private get version(): number {
    return 10;
  }

  public async getAppUiPreferences(): Promise<AppUiPreferences> {
    const db = await this.getDb();
    return new Promise<AppUiPreferences>((resolve, reject) => {
      const transaction = db.transaction(this.appUiPreferencesStoreName, 'readonly');
      const request = transaction.objectStore(this.appUiPreferencesStoreName).get(appUiPreferencesId);
      request.addEventListener('success', () => {
        resolve(
          (request.result as AppUiPreferences | undefined) ?? {
            id: appUiPreferencesId,
            projectDisclosure: {},
          },
        );
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error('Failed to read application UI preferences'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('Reading application UI preferences was aborted'));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async setProjectDisclosure(
    projectId: string,
    expanded: boolean | undefined,
  ): Promise<AppUiPreferences | undefined> {
    return this.mutex.run(appUiPreferencesMutexKey, async () => {
      const db = await this.getDb();
      return new Promise<AppUiPreferences | undefined>((resolve, reject) => {
        const transaction = db.transaction(this.appUiPreferencesStoreName, 'readwrite');
        const store = transaction.objectStore(this.appUiPreferencesStoreName);
        let resolved: AppUiPreferences | undefined;
        const request = store.get(appUiPreferencesId);
        request.addEventListener('success', () => {
          const existing = (request.result as AppUiPreferences | undefined) ?? {
            id: appUiPreferencesId,
            projectDisclosure: {},
          };
          const hasOverride = Object.hasOwn(existing.projectDisclosure, projectId);
          if (
            (!hasOverride && expanded === undefined) ||
            (hasOverride && existing.projectDisclosure[projectId] === expanded)
          ) {
            return;
          }

          const projectDisclosure = { ...existing.projectDisclosure };
          if (expanded === undefined) {
            Reflect.deleteProperty(projectDisclosure, projectId);
          } else {
            projectDisclosure[projectId] = expanded;
          }
          resolved = { id: appUiPreferencesId, projectDisclosure };
          store.put(resolved);
        });
        transaction.addEventListener('complete', () => {
          resolve(resolved);
        });
        transaction.addEventListener('error', () => {
          reject(transaction.error ?? new Error('Failed to update project disclosure'));
        });
        transaction.addEventListener('abort', () => {
          reject(transaction.error ?? new Error('Updating project disclosure was aborted'));
        });
      }).finally(() => {
        db.close();
      });
    });
  }

  public async putChatRecord(chat: Chat): Promise<void> {
    await this.putRecord(this.chatsStoreName, chat);
  }

  public async deleteChatRecord(chatId: string): Promise<void> {
    await this.deleteRecord(this.chatsStoreName, chatId);
  }

  public async putEditorStateRecord(editorState: EditorState): Promise<void> {
    await this.putRecord(this.editorStoreName, editorState);
  }

  public async putPendingProjectOperation(operation: PendingProjectOperation): Promise<void> {
    await this.putRecord(this.pendingProjectOperationsStoreName, operation);
  }

  public async beginPermanentDeleteProject(operation: PendingPermanentDeleteProjectOperation): Promise<void> {
    return this.mutex.run(operation.projectId, async () => {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [this.projectLibraryStatesStoreName, this.pendingProjectOperationsStoreName],
          'readwrite',
        );
        const libraryStore = transaction.objectStore(this.projectLibraryStatesStoreName);
        const pendingStore = transaction.objectStore(this.pendingProjectOperationsStoreName);
        let validationError: Error | undefined;
        const abortWith = (error: Error): void => {
          validationError = error;
          transaction.abort();
        };

        const stateRequest = libraryStore.get(operation.projectId);
        stateRequest.addEventListener('success', () => {
          const state = stateRequest.result as ProjectLibraryState | undefined;
          if (state?.deletedAt === undefined) {
            abortWith(new Error('Permanent delete is available only for trashed projects'));
            return;
          }
          const pendingRequest = pendingStore.getAll();
          pendingRequest.addEventListener('success', () => {
            const alreadyPending = (pendingRequest.result as PendingProjectOperation[]).some(
              (candidate) => candidate.kind === 'permanent-delete' && candidate.projectId === operation.projectId,
            );
            if (alreadyPending) {
              abortWith(new Error(`Permanent delete is already pending for ${operation.projectId}`));
              return;
            }
            pendingStore.add(operation);
          });
        });
        transaction.addEventListener('complete', () => {
          resolve();
        });
        transaction.addEventListener('error', () => {
          reject(validationError ?? transaction.error ?? new Error('Failed to begin permanent project deletion'));
        });
        transaction.addEventListener('abort', () => {
          reject(validationError ?? transaction.error ?? new Error('Beginning permanent project deletion was aborted'));
        });
      }).finally(() => {
        db.close();
      });
    });
  }

  public async getPendingProjectOperation(operationId: string): Promise<PendingProjectOperation | undefined> {
    const db = await this.getDb();
    return new Promise<PendingProjectOperation | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.pendingProjectOperationsStoreName, 'readonly');
      const request = transaction.objectStore(this.pendingProjectOperationsStoreName).get(operationId);
      request.addEventListener('success', () => {
        resolve(request.result as PendingProjectOperation | undefined);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`Failed to read pending project operation ${operationId}`));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Reading pending project operation ${operationId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async getPendingProjectOperations(): Promise<PendingProjectOperation[]> {
    const db = await this.getDb();
    return new Promise<PendingProjectOperation[]>((resolve, reject) => {
      const transaction = db.transaction(this.pendingProjectOperationsStoreName, 'readonly');
      const request = transaction.objectStore(this.pendingProjectOperationsStoreName).getAll();
      request.addEventListener('success', () => {
        resolve(request.result as PendingProjectOperation[]);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to read pending project operations'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('Reading pending project operations was aborted'));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async deletePendingProjectOperation(operationId: string): Promise<void> {
    await this.deleteRecord(this.pendingProjectOperationsStoreName, operationId);
  }

  public async createProjectLibraryState(state: ProjectLibraryState): Promise<ProjectLibraryState> {
    const db = await this.getDb();
    return new Promise<ProjectLibraryState>((resolve, reject) => {
      const transaction = db.transaction(this.projectLibraryStatesStoreName, 'readwrite');
      const store = transaction.objectStore(this.projectLibraryStatesStoreName);
      let resolved = state;
      const request = store.get(state.projectId);
      request.addEventListener('success', () => {
        const existing = request.result as ProjectLibraryState | undefined;
        if (existing) {
          resolved = existing;
          return;
        }
        store.add(state);
      });
      transaction.addEventListener('complete', () => {
        resolve(resolved);
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error('Failed to create project library state'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('Creating project library state was aborted'));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async getProjectLibraryState(projectId: string): Promise<ProjectLibraryState | undefined> {
    const db = await this.getDb();
    return new Promise<ProjectLibraryState | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.projectLibraryStatesStoreName, 'readonly');
      const request = transaction.objectStore(this.projectLibraryStatesStoreName).get(projectId);
      request.addEventListener('success', () => {
        resolve(request.result as ProjectLibraryState | undefined);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error(`Failed to read project library state ${projectId}`));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Reading project library state ${projectId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async getProjectLibraryStates(projectIds?: readonly string[]): Promise<ProjectLibraryState[]> {
    const db = await this.getDb();
    const states = await new Promise<ProjectLibraryState[]>((resolve, reject) => {
      const transaction = db.transaction(this.projectLibraryStatesStoreName, 'readonly');
      const request = transaction.objectStore(this.projectLibraryStatesStoreName).getAll();
      request.addEventListener('success', () => {
        resolve(request.result as ProjectLibraryState[]);
      });
      request.addEventListener('error', () => {
        reject(request.error ?? new Error('Failed to read project library states'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('Reading project library states was aborted'));
      });
    }).finally(() => {
      db.close();
    });
    if (projectIds === undefined) {
      return states;
    }
    const requested = new Set(projectIds);
    return states.filter((state) => requested.has(state.projectId));
  }

  public async touchProjectActivity(
    projectId: string,
    activityAt = Date.now(),
  ): Promise<ProjectLibraryState | undefined> {
    return this.mutateProjectLibraryState(projectId, (state) =>
      activityAt > state.lastActivityAt ? { ...state, lastActivityAt: activityAt } : state,
    );
  }

  public async trashProject(projectId: string, deletedAt = Date.now()): Promise<ProjectLibraryState | undefined> {
    return this.mutateProjectLibraryState(projectId, (state) => ({ ...state, deletedAt }));
  }

  public async restoreProject(projectId: string): Promise<ProjectLibraryState | undefined> {
    return this.mutex.run(projectId, async () => {
      const db = await this.getDb();
      return new Promise<ProjectLibraryState | undefined>((resolve, reject) => {
        const transaction = db.transaction(
          [this.projectLibraryStatesStoreName, this.pendingProjectOperationsStoreName],
          'readwrite',
        );
        const libraryStore = transaction.objectStore(this.projectLibraryStatesStoreName);
        const pendingStore = transaction.objectStore(this.pendingProjectOperationsStoreName);
        let restored: ProjectLibraryState | undefined;
        let validationError: Error | undefined;
        const pendingRequest = pendingStore.getAll();
        pendingRequest.addEventListener('success', () => {
          const permanentDeletePending = (pendingRequest.result as PendingProjectOperation[]).some(
            (operation) => operation.kind === 'permanent-delete' && operation.projectId === projectId,
          );
          if (permanentDeletePending) {
            validationError = new Error(`Cannot restore project while permanent deletion is pending: ${projectId}`);
            transaction.abort();
            return;
          }
          const stateRequest = libraryStore.get(projectId);
          stateRequest.addEventListener('success', () => {
            const state = stateRequest.result as ProjectLibraryState | undefined;
            if (state === undefined) {
              return;
            }
            const { deletedAt: _deletedAt, ...next } = state;
            restored = next;
            if (state.deletedAt !== undefined) {
              libraryStore.put(next);
            }
          });
        });
        transaction.addEventListener('complete', () => {
          resolve(restored);
        });
        transaction.addEventListener('error', () => {
          reject(validationError ?? transaction.error ?? new Error(`Failed to restore project ${projectId}`));
        });
        transaction.addEventListener('abort', () => {
          reject(validationError ?? transaction.error ?? new Error(`Restoring project ${projectId} was aborted`));
        });
      }).finally(() => {
        db.close();
      });
    });
  }

  public async setProjectRevisionState(
    projectId: string,
    revisionState: PersistedRevisionState,
  ): Promise<ProjectLibraryState | undefined> {
    return this.mutateProjectLibraryState(projectId, (state) => ({ ...state, revisionState }));
  }

  public async deleteProjectLibraryState(projectId: string): Promise<void> {
    await this.deleteRecord(this.projectLibraryStatesStoreName, projectId);
  }

  // ============================================================================
  // Chat Methods
  // ============================================================================

  public async createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Chat> {
    return this.createChatRecord(resourceId, chat);
  }

  public async createNavigationRepairChat(resourceId: string): Promise<Chat> {
    return this.createChatRecord(resourceId, { name: defaultNavigationChatName, messages: [] });
  }

  public async updateChat(chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () => this.updateChatAtomic(chatId, update));
  }

  /**
   * Atomic field-scoped patch for a single top-level chat field. Performs
   * `get → mutate → put` inside one readwrite transaction, gated by the
   * per-chatId mutex so concurrent callers cannot lose writes. See
   * `docs/policy/storage-policy.md`.
   */
  public async patchChat<K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () =>
      this.atomicChatMutation(chatId, (chat) => {
        if (storageValuesEqual(chat[key], value)) {
          return false;
        }
        chat[key] = value;
        return true;
      }),
    );
  }

  /**
   * Consume a persisted startup request exactly once. A stale request id is a
   * no-op so concurrent hydration/reacquire cannot clear a newer command.
   */
  public async consumeChatStartupRequest(chatId: string, requestId: string): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () =>
      this.atomicChatMutation(chatId, (chat) => {
        if (chat.startupRequest?.id !== requestId) {
          return false;
        }
        delete chat.startupRequest;
        return true;
      }),
    );
  }

  /**
   * Commit the empty-cancel restore as one durable chat-row transition:
   * transcript, composer draft, and matching startup-request cleanup.
   */
  public async commitCancelledDraftRestore(
    chatId: string,
    input: CommitCancelledDraftRestoreInput,
  ): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () =>
      this.atomicChatMutation(chatId, (chat) => {
        let changed = false;

        if (!storageValuesEqual(chat.messages, input.messages)) {
          chat.messages = input.messages;
          changed = true;
        }

        if (!storageValuesEqual(chat.draft, input.draft)) {
          chat.draft = input.draft;
          changed = true;
        }

        if (input.clearStartupRequestId !== undefined && chat.startupRequest?.id === input.clearStartupRequestId) {
          delete chat.startupRequest;
          changed = true;
        }

        return changed;
      }),
    );
  }

  /**
   * Set a single message-edit draft entry on a chat. Creates the
   * `messageEdits` map if missing. Atomic per-chatId.
   */
  public async setMessageEdit(
    chatId: string,
    messageId: string,
    draft: NonNullable<Chat['messageEdits']>[string],
  ): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () =>
      this.atomicChatMutation(chatId, (chat) => {
        if (storageValuesEqual(chat.messageEdits?.[messageId], draft)) {
          return false;
        }
        chat.messageEdits ??= {};
        chat.messageEdits[messageId] = draft;
        return true;
      }),
    );
  }

  /**
   * Remove a single message-edit draft entry from a chat. No-op (no
   * `updatedAt` bump) if the entry does not exist. Atomic per-chatId.
   */
  public async clearMessageEdit(chatId: string, messageId: string): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () =>
      this.atomicChatMutation(chatId, (chat) => {
        if (!chat.messageEdits || !(messageId in chat.messageEdits)) {
          return false;
        }
        // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete -- messageId is a runtime key
        delete chat.messageEdits[messageId];
        return true;
      }),
    );
  }

  /**
   * Soft-delete a chat by setting `deletedAt`. Atomic per-chatId.
   */
  public async softDeleteChat(chatId: string): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () =>
      this.atomicChatMutation(chatId, (chat) => {
        if (chat.deletedAt !== undefined) {
          return false;
        }
        chat.deletedAt = Date.now();
        return true;
      }),
    );
  }

  public async applyGeneratedChatName(chatId: string, name: string): Promise<Chat | undefined> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    return this.mutex.run(chatId, async () => this.applyGeneratedChatNameAtomic(chatId, trimmed));
  }

  public async getChat(chatId: string): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise<Chat | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readonly');
      const store = transaction.objectStore(this.chatsStoreName);
      const request = store.get(chatId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result as Chat | undefined);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Reading chat ${chatId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async getAllChats(options?: { includeDeleted?: boolean }): Promise<Chat[]> {
    const db = await this.getDb();
    return new Promise<Chat[]>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readonly');
      const request = transaction.objectStore(this.chatsStoreName).getAll();
      request.addEventListener('success', () => {
        const chats = request.result as Chat[];
        resolve(options?.includeDeleted ? chats : chats.filter((chat) => chat.deletedAt === undefined));
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error('Failed to read chats'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('Reading chats was aborted'));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> {
    const db = await this.getDb();

    return new Promise<Chat[]>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readonly');
      const store = transaction.objectStore(this.chatsStoreName);
      const index = store.index('resourceId');
      const request = index.getAll(resourceId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        const chats = request.result as Chat[];
        // Filter out deleted chats unless explicitly requested
        const filteredChats = options?.includeDeleted ? chats : chats.filter((chat) => !chat.deletedAt);
        resolve(filteredChats);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Reading chats for ${resourceId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async deleteChat(chatId: string): Promise<void> {
    await this.softDeleteChat(chatId);
  }

  public async duplicateChat(chatId: string): Promise<Chat> {
    const chat = await this.getChat(chatId);
    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    return this.createChat(chat.resourceId, {
      name: `${chat.name} (Copy)`,
      messages: chat.messages,
      draft: chat.draft,
      messageEdits: chat.messageEdits,
      activeModel: chat.activeModel,
      activeKernel: chat.activeKernel,
    });
  }

  public async duplicateResourceChats(
    sourceResourceId: string,
    targetResourceId: string,
  ): Promise<Record<string, string>> {
    const chats = await this.getChatsForResource(sourceResourceId);

    const duplicatedChats = await Promise.all(
      chats.map(async (chat) => {
        const newChat = await this.createChat(targetResourceId, {
          name: chat.name,
          messages: chat.messages,
          draft: chat.draft,
          messageEdits: chat.messageEdits,
          activeModel: chat.activeModel,
          activeKernel: chat.activeKernel,
        });
        return { oldId: chat.id, newId: newChat.id };
      }),
    );

    return Object.fromEntries(duplicatedChats.map(({ oldId, newId }) => [oldId, newId]));
  }

  // ============================================================================
  // Editor State Methods
  // ============================================================================

  public async getEditorState(projectId: string): Promise<EditorState | undefined> {
    const db = await this.getDb();

    return new Promise<EditorState | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.editorStoreName, 'readonly');
      const store = transaction.objectStore(this.editorStoreName);
      const request = store.get(projectId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result as EditorState | undefined);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Reading editor state ${projectId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async updateEditorState(editorState: EditorStateInput): Promise<EditorState> {
    const db = await this.getDb();
    const stateWithTimestamp = { ...editorState, updatedAt: Date.now() };

    return new Promise<EditorState>((resolve, reject) => {
      const transaction = db.transaction(this.editorStoreName, 'readwrite');
      const store = transaction.objectStore(this.editorStoreName);
      const request = store.put(stateWithTimestamp);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(stateWithTimestamp);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Writing editor state ${editorState.projectId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  public async deleteEditorState(projectId: string): Promise<void> {
    const db = await this.getDb();

    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.editorStoreName, 'readwrite');
      const store = transaction.objectStore(this.editorStoreName);
      const request = store.delete(projectId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Deleting editor state ${projectId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  // ============================================================================
  // Private atomic mutators
  // ============================================================================

  private async createChatRecord(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Chat> {
    const id = chat.id ?? generatePrefixedId(idPrefix.chat);
    const timestamp = Date.now();
    const chatWithId: Chat = {
      ...chat,
      id,
      resourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const db = await this.getDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      const request = store.add(chatWithId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        // Resolved after durability via transaction.oncomplete.
      };

      transaction.oncomplete = () => {
        resolve();
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Creating chat ${id} was aborted`));
      });
    }).finally(() => {
      db.close();
    });

    return chatWithId;
  }

  private async applyGeneratedChatNameAtomic(chatId: string, name: string): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise<Chat | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      let resolved: Chat | undefined;

      const getRequest = store.get(chatId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      getRequest.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(getRequest.error);
      };

      getRequest.onsuccess = () => {
        const existingChat = getRequest.result as Chat | undefined;
        if (
          !existingChat ||
          existingChat.deletedAt !== undefined ||
          existingChat.name !== defaultNavigationChatName ||
          existingChat.name === name
        ) {
          return;
        }

        const updatedChat: Chat = { ...existingChat, name };
        const putRequest = store.put(updatedChat);
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
        putRequest.onerror = () => {
          // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
          reject(putRequest.error);
        };
        putRequest.onsuccess = () => {
          resolved = updatedChat;
        };
      };

      transaction.oncomplete = () => {
        resolve(resolved);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Naming chat ${chatId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  private async mutateProjectLibraryState(
    projectId: string,
    mutate: (state: ProjectLibraryState) => ProjectLibraryState,
  ): Promise<ProjectLibraryState | undefined> {
    return this.mutex.run(projectId, async () => {
      const db = await this.getDb();
      return new Promise<ProjectLibraryState | undefined>((resolve, reject) => {
        const transaction = db.transaction(this.projectLibraryStatesStoreName, 'readwrite');
        const store = transaction.objectStore(this.projectLibraryStatesStoreName);
        let resolved: ProjectLibraryState | undefined;
        const getRequest = store.get(projectId);
        getRequest.addEventListener('error', () => {
          reject(getRequest.error ?? new Error(`Failed to read project library state ${projectId}`));
        });
        getRequest.addEventListener('success', () => {
          const existing = getRequest.result as ProjectLibraryState | undefined;
          if (existing === undefined) {
            return;
          }
          const updated = mutate(existing);
          resolved = updated;
          if (!storageValuesEqual(existing, updated)) {
            store.put(updated);
          }
        });
        transaction.addEventListener('complete', () => {
          resolve(resolved);
        });
        transaction.addEventListener('error', () => {
          reject(transaction.error ?? new Error(`Failed to update project library state ${projectId}`));
        });
        transaction.addEventListener('abort', () => {
          reject(transaction.error ?? new Error(`Updating project library state ${projectId} was aborted`));
        });
      }).finally(() => {
        db.close();
      });
    });
  }

  private async updateChatAtomic(chatId: string, update: PartialDeep<Chat>): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise<Chat | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      let resolved: Chat | undefined;

      const getRequest = store.get(chatId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      getRequest.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(getRequest.error);
      };

      getRequest.onsuccess = () => {
        const existingChat = getRequest.result as Chat | undefined;
        if (!existingChat) {
          return;
        }

        const isFullChat = 'id' in update && update.id === chatId;

        const candidateChat = isFullChat ? (update as Chat) : (deepmerge(existingChat, update) as Chat);
        if (storageValuesEqual(candidateChat, existingChat)) {
          return;
        }

        const updatedChat = isFullChat ? candidateChat : { ...candidateChat, updatedAt: Date.now() };
        const putRequest = store.put(updatedChat);
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
        putRequest.onerror = () => {
          // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
          reject(putRequest.error);
        };
        putRequest.onsuccess = () => {
          resolved = updatedChat;
        };
      };

      transaction.oncomplete = () => {
        resolve(resolved);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Updating chat ${chatId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  /**
   * Internal: read the chat, hand it to `mutate` for in-place modification,
   * then `put` it back inside a single readwrite transaction. Bumps
   * `updatedAt` only when the mutator returns `true` (i.e. an actual change
   * was made), so no-op clears do not pollute timestamps.
   *
   * Resolves the outer promise from `transaction.oncomplete` (not from
   * `request.onsuccess`) so callers never observe a pre-durability value.
   */
  private async atomicChatMutation(chatId: string, mutate: (chat: Chat) => boolean): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise<Chat | undefined>((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      let resolved: Chat | undefined;

      const getRequest = store.get(chatId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      getRequest.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(getRequest.error);
      };

      getRequest.onsuccess = () => {
        const existingChat = getRequest.result as Chat | undefined;
        if (!existingChat) {
          return;
        }

        const changed = mutate(existingChat);
        if (!changed) {
          return;
        }

        existingChat.updatedAt = Date.now();

        const putRequest = store.put(existingChat);
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
        putRequest.onerror = () => {
          // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
          reject(putRequest.error);
        };
        putRequest.onsuccess = () => {
          resolved = existingChat;
        };
      };

      transaction.oncomplete = () => {
        resolve(resolved);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };

      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Mutating chat ${chatId} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  // ============================================================================
  // Database Management
  // ============================================================================

  private async getDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onblocked = () => {
        reject(new StorageUpgradeBlockedError());
      };

      request.onsuccess = () => {
        const db = request.result;
        // Never be the tab that blocks another tab's upgrade.
        db.onversionchange = () => {
          db.close();
        };
        resolve(db);
      };

      // One bootstrap handler, no version-conditional branches: the v1–v8
      // ladder was deleted at v9 (blueprint L5). Every profile — fresh or
      // sitting at v8 — gets the current store set, and the dead `projects`
      // store goes with the bump.
      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(this.chatsStoreName)) {
          const chatsStore = db.createObjectStore(this.chatsStoreName, { keyPath: 'id' });
          chatsStore.createIndex('resourceId', 'resourceId', { unique: false });
        }
        if (!db.objectStoreNames.contains(this.editorStoreName)) {
          db.createObjectStore(this.editorStoreName, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(this.pendingProjectOperationsStoreName)) {
          db.createObjectStore(this.pendingProjectOperationsStoreName, { keyPath: 'operationId' });
        }
        if (!db.objectStoreNames.contains(this.projectLibraryStatesStoreName)) {
          db.createObjectStore(this.projectLibraryStatesStoreName, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(this.appUiPreferencesStoreName)) {
          db.createObjectStore(this.appUiPreferencesStoreName, { keyPath: 'id' });
        }
        if (db.objectStoreNames.contains(legacyProjectsStoreName)) {
          db.deleteObjectStore(legacyProjectsStoreName);
        }
        request.transaction?.objectStore(this.editorStoreName).clear();
      };
    });
  }

  private async putRecord(storeName: string, value: unknown): Promise<void> {
    const db = await this.getDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value);
      transaction.addEventListener('complete', () => {
        resolve();
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error(`Failed to write record in ${storeName}`));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Writing record in ${storeName} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }

  private async deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await this.getDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      transaction.addEventListener('complete', () => {
        resolve();
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error(`Failed to delete record from ${storeName}`));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error(`Deleting record from ${storeName} was aborted`));
      });
    }).finally(() => {
      db.close();
    });
  }
}
