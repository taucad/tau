import type { AppUiPreferences, StorageProvider } from '#types/storage.types.js';
import type { EditorState, EditorStateInput } from '#types/editor.types.js';
import type {
  PendingPermanentDeleteProjectOperation,
  PendingProjectOperation,
} from '#types/pending-project-operation.types.js';
import type { ProjectLibraryState } from '#types/project.types.js';
import { metaConfig } from '#constants/meta.constants.js';
import { KeyedMutex } from '#db/keyed-mutex.js';

/** Pre-cutover store, dropped by the v9 bootstrap. Nothing reads it. */
const legacyProjectsStoreName = 'projects';
/** A chat is files now (W17). The v11 bootstrap drops this store; nothing reads it. */
const legacyChatsStoreName = 'chats';
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
   * Per-key serialiser for every mutating operation against a single project
   * row. Defence-in-depth on top of the atomic single-transaction `get → put`
   * writes. See `docs/policy/storage-policy.md` for the contract.
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

  private get editorStoreName(): string {
    return 'editor';
  }

  private get pendingProjectOperationsStoreName(): string {
    return 'pendingProjectOperations';
  }

  private get version(): number {
    return 11;
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
    const states = await this.createProjectLibraryStates([state]);
    return states[0]!;
  }

  public async createProjectLibraryStates(states: readonly ProjectLibraryState[]): Promise<ProjectLibraryState[]> {
    if (new Set(states.map(({ projectId }) => projectId)).size !== states.length) {
      throw new TypeError('Duplicate project ids in library-state batch');
    }
    if (states.length === 0) {
      return [];
    }
    const db = await this.getDb();
    return new Promise<ProjectLibraryState[]>((resolve, reject) => {
      const transaction = db.transaction(this.projectLibraryStatesStoreName, 'readwrite');
      const store = transaction.objectStore(this.projectLibraryStatesStoreName);
      const resolved = [...states];
      for (const [index, state] of states.entries()) {
        const request = store.get(state.projectId);
        request.addEventListener('success', () => {
          const existing = request.result as ProjectLibraryState | undefined;
          if (existing) {
            resolved[index] = existing;
          } else {
            store.add(state);
          }
        });
      }
      transaction.addEventListener('complete', () => {
        resolve(resolved);
      });
      transaction.addEventListener('error', () => {
        reject(transaction.error ?? new Error('Failed to create project library states'));
      });
      transaction.addEventListener('abort', () => {
        reject(transaction.error ?? new Error('Creating project library states was aborted'));
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

  public async deleteProjectLibraryState(projectId: string): Promise<void> {
    await this.deleteRecord(this.projectLibraryStatesStoreName, projectId);
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
        /* No migration and no shim (A31/I15): a chat is `.tau/chats/<id>/chat.json`
         * inside its project, and this store's chats are dropped rather than
         * carried across. Say it plainly: a chat whose turns predate the
         * portable agent host has no session log to rebuild from and is
         * **unrecoverable** here — sanctioned by I15/A31, which choose a clean
         * cut over a migration. A chat that does have a log keeps its
         * transcript, because the log is what the transcript was always
         * derived from (P26); what this drop destroys is the record row that
         * listed it, which the file store re-derives from the log's own
         * directory. */
        if (db.objectStoreNames.contains(legacyChatsStoreName)) {
          db.deleteObjectStore(legacyChatsStoreName);
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
