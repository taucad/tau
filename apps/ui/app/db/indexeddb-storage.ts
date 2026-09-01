import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { Project } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { StorageProvider } from '#types/storage.types.js';
import type { EditorState, EditorStateInput } from '#types/editor.types.js';
import { metaConfig } from '#constants/meta.constants.js';
import { KeyedMutex } from '#db/keyed-mutex.js';

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

  private get projectsStoreName(): string {
    return 'projects';
  }

  private get chatsStoreName(): string {
    return 'chats';
  }

  private get editorStoreName(): string {
    return 'editor';
  }

  private get version(): number {
    return 5;
  }

  public async createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = generatePrefixedId(idPrefix.project);
    const timestamp = Date.now();
    const projectWithId = {
      ...project,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.projectsStoreName, 'readwrite');
      const store = transaction.objectStore(this.projectsStoreName);

      const request = store.add(projectWithId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(projectWithId);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async touchProject(projectId: string): Promise<Project | undefined> {
    return this.mutex.run(projectId, async () => this.touchProjectAtomic(projectId));
  }

  public async updateProject(
    projectId: string,
    update: PartialDeep<Project>,
    options?: {
      /**
       * If true, the updatedAt timestamp will not be updated.
       *
       * This should be removed after hash-checking is added for avoiding
       * unnecessary updates.
       */
      noUpdatedAt?: boolean;
    },
  ): Promise<Project | undefined> {
    return this.mutex.run(projectId, async () => this.updateProjectAtomic(projectId, update, options));
  }

  public async getProjects(options?: { includeDeleted?: boolean }): Promise<Project[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.projectsStoreName, 'readonly');
      const store = transaction.objectStore(this.projectsStoreName);
      const request = store.getAll();

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        const projects = request.result as Project[];
        // Filter out deleted projects unless explicitly requested
        const filteredProjects = options?.includeDeleted ? projects : projects.filter((project) => !project.deletedAt);
        resolve(filteredProjects);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getProject(projectId: string): Promise<Project | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.projectsStoreName, 'readonly');
      const store = transaction.objectStore(this.projectsStoreName);
      const request = store.get(projectId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result as Project | undefined);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async deleteProject(projectId: string): Promise<void> {
    // Get the project to make sure it exists
    const project = await this.getProject(projectId);
    if (!project) {
      return;
    }

    // Perform soft delete by updating deletedAt timestamp
    await this.updateProject(projectId, { deletedAt: Date.now() });
  }

  // ============================================================================
  // Chat Methods
  // ============================================================================

  public async createChat(
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
        db.close();
        resolve();
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };
    });

    await this.touchProject(resourceId);
    return chatWithId;
  }

  public async updateChat(
    chatId: string,
    update: PartialDeep<Chat>,
    options?: {
      noUpdatedAt?: boolean;
    },
  ): Promise<Chat | undefined> {
    return this.mutex.run(chatId, async () => this.updateChatAtomic(chatId, update, options));
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
        chat[key] = value;
        return true;
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
        chat.deletedAt = Date.now();
        return true;
      }),
    );
  }

  public async getChat(chatId: string): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
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

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
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

      transaction.oncomplete = () => {
        db.close();
      };
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

    return new Promise((resolve, reject) => {
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

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async updateEditorState(editorState: EditorStateInput): Promise<EditorState> {
    const db = await this.getDb();
    const stateWithTimestamp = { ...editorState, updatedAt: Date.now() };

    return new Promise((resolve, reject) => {
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

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async deleteEditorState(projectId: string): Promise<void> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
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

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  // ============================================================================
  // Private atomic mutators
  // ============================================================================

  private async updateProjectAtomic(
    projectId: string,
    update: PartialDeep<Project>,
    options?: { noUpdatedAt?: boolean },
  ): Promise<Project | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.projectsStoreName, 'readwrite');
      const store = transaction.objectStore(this.projectsStoreName);

      let resolved: Project | undefined;

      const getRequest = store.get(projectId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      getRequest.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(getRequest.error);
      };

      getRequest.onsuccess = () => {
        const existingProject = getRequest.result as Project | undefined;
        if (!existingProject) {
          return;
        }

        const isProject = 'id' in update && update.id === projectId;

        let updatedProject: Project;
        if (isProject) {
          updatedProject = update as Project;
        } else {
          const optionalParameters = options?.noUpdatedAt ? {} : { updatedAt: Date.now() };
          updatedProject = deepmerge(existingProject, { ...update, ...optionalParameters }) as Project;
        }

        const putRequest = store.put(updatedProject);
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
        putRequest.onerror = () => {
          // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
          reject(putRequest.error);
        };
        putRequest.onsuccess = () => {
          resolved = updatedProject;
        };
      };

      transaction.oncomplete = () => {
        db.close();
        resolve(resolved);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };
    });
  }

  private async touchProjectAtomic(projectId: string): Promise<Project | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.projectsStoreName, 'readwrite');
      const store = transaction.objectStore(this.projectsStoreName);

      let resolved: Project | undefined;

      const getRequest = store.get(projectId);

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      getRequest.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(getRequest.error);
      };

      getRequest.onsuccess = () => {
        const existingProject = getRequest.result as Project | undefined;
        if (!existingProject || existingProject.deletedAt) {
          return;
        }

        const updatedProject: Project = { ...existingProject, updatedAt: Date.now() };
        const putRequest = store.put(updatedProject);
        // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
        putRequest.onerror = () => {
          // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
          reject(putRequest.error);
        };
        putRequest.onsuccess = () => {
          resolved = updatedProject;
        };
      };

      transaction.oncomplete = () => {
        db.close();
        resolve(resolved);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };
    });
  }

  private async updateChatAtomic(
    chatId: string,
    update: PartialDeep<Chat>,
    options?: { noUpdatedAt?: boolean },
  ): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
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

        let updatedChat: Chat;
        if (isFullChat) {
          updatedChat = update as Chat;
        } else {
          const optionalParameters = options?.noUpdatedAt ? {} : { updatedAt: Date.now() };
          updatedChat = deepmerge(existingChat, { ...update, ...optionalParameters }) as Chat;
        }

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
        db.close();
        const next = resolved;
        if (next && !options?.noUpdatedAt) {
          // async-iife: bootstrap — chat txn is durable; cascade project touch before resolving callers.
          void (async (): Promise<void> => {
            try {
              await this.touchProject(next.resourceId);
              resolve(next);
            } catch (error) {
              reject(error instanceof Error ? error : new Error('touchProject failed', { cause: error }));
            }
          })();
          return;
        }

        resolve(next);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };
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

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      let resolved: Chat | undefined;
      let shouldCascadeProject = false;

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
        if (changed) {
          existingChat.updatedAt = Date.now();
          shouldCascadeProject = true;
        }

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
        db.close();
        const next = resolved;
        if (next && shouldCascadeProject) {
          // async-iife: bootstrap — chat txn is durable; cascade project touch before resolving callers.
          void (async (): Promise<void> => {
            try {
              await this.touchProject(next.resourceId);
              resolve(next);
            } catch (error) {
              reject(error instanceof Error ? error : new Error('touchProject failed', { cause: error }));
            }
          })();
          return;
        }

        resolve(next);
      };

      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      transaction.onerror = () => {
        // oxlint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(transaction.error);
      };
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

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const { oldVersion } = event;

        // Version 1: Create projects store
        if (oldVersion < 1 && !db.objectStoreNames.contains(this.projectsStoreName)) {
          db.createObjectStore(this.projectsStoreName, { keyPath: 'id' });
        }

        // Version 2+: Create chats store with resourceId index
        if (oldVersion < 2 && !db.objectStoreNames.contains(this.chatsStoreName)) {
          const chatsStore = db.createObjectStore(this.chatsStoreName, { keyPath: 'id' });
          chatsStore.createIndex('resourceId', 'resourceId', { unique: false });
        }

        // Version 3 was skipped for no good reason.

        // Version 4+: Create editor store for transient Editor state
        if (oldVersion < 4 && !db.objectStoreNames.contains(this.editorStoreName)) {
          db.createObjectStore(this.editorStoreName, { keyPath: 'projectId' });
        }
      };
    });
  }
}
