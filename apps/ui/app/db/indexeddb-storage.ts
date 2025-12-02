import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { Build } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type { StorageProvider } from '#types/storage.types.js';
import { metaConfig } from '#constants/meta.constants.js';

export class IndexedDbStorageProvider implements StorageProvider {
  private get dbName(): string {
    return `${metaConfig.databasePrefix}db`;
  }

  private get buildsStoreName(): string {
    return 'builds';
  }

  private get chatsStoreName(): string {
    return 'chats';
  }

  private get version(): number {
    return 3;
  }

  public async createBuild(build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> {
    const id = generatePrefixedId(idPrefix.build);
    const timestamp = Date.now();
    const buildWithId = {
      ...build,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.buildsStoreName, 'readwrite');
      const store = transaction.objectStore(this.buildsStoreName);

      const request = store.add(buildWithId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(buildWithId);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async updateBuild(
    buildId: string,
    update: PartialDeep<Build>,
    options?: {
      ignoreKeys?: string[];
      /**
       * If true, the updatedAt timestamp will not be updated.
       *
       * This should be removed after hash-checking is added for avoiding
       * unnecessary updates.
       */
      noUpdatedAt?: boolean;
    },
  ): Promise<Build | undefined> {
    const db = await this.getDb();
    const existingBuild = await this.getBuild(buildId);

    if (!existingBuild) {
      return undefined;
    }

    // If update contains an 'id' field matching buildId, treat it as a full build replacement
    // This is the new pattern from the parallel state machine refactor
    const isBuild = 'id' in update && update.id === buildId;

    let updatedBuild: Build;

    if (isBuild) {
      // Full build replacement - no merging needed
      updatedBuild = update as Build;
    } else {
      // Partial update - use deepmerge for backward compatibility
      const mergeIgnoreKeys = new Set(options?.ignoreKeys ?? []);
      const optionalParameters = {
        ...(options?.noUpdatedAt ? {} : { updatedAt: Date.now() }),
      };

      updatedBuild = deepmerge(
        existingBuild,
        { ...update, ...optionalParameters },
        {
          customMerge(key) {
            if (mergeIgnoreKeys.has(key)) {
              return (_source: unknown, target: unknown) => target;
            }

            return undefined;
          },
        },
      ) as Build;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.buildsStoreName, 'readwrite');
      const store = transaction.objectStore(this.buildsStoreName);

      const request = store.put(updatedBuild);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(updatedBuild);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getBuilds(options?: { includeDeleted?: boolean }): Promise<Build[]> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.buildsStoreName, 'readonly');
      const store = transaction.objectStore(this.buildsStoreName);
      const request = store.getAll();

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        const builds = request.result as Build[];
        // Filter out deleted builds unless explicitly requested
        const filteredBuilds = options?.includeDeleted ? builds : builds.filter((build) => !build.deletedAt);
        resolve(filteredBuilds);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getBuild(buildId: string): Promise<Build | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.buildsStoreName, 'readonly');
      const store = transaction.objectStore(this.buildsStoreName);
      const request = store.get(buildId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result as Build | undefined);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async deleteBuild(buildId: string): Promise<void> {
    // Get the build to make sure it exists
    const build = await this.getBuild(buildId);
    if (!build) {
      return;
    }

    // Perform soft delete by updating deletedAt timestamp
    await this.updateBuild(buildId, { deletedAt: Date.now() });
  }

  // ============================================================================
  // Chat Methods
  // ============================================================================

  public async createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'>,
  ): Promise<Chat> {
    const id = generatePrefixedId(idPrefix.chat);
    const timestamp = Date.now();
    const chatWithId: Chat = {
      ...chat,
      id,
      resourceId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      const request = store.add(chatWithId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(chatWithId);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async updateChat(
    chatId: string,
    update: PartialDeep<Chat>,
    options?: {
      ignoreKeys?: string[];
      noUpdatedAt?: boolean;
    },
  ): Promise<Chat | undefined> {
    const db = await this.getDb();
    const existingChat = await this.getChat(chatId);

    if (!existingChat) {
      return undefined;
    }

    // If update contains an 'id' field matching chatId, treat it as a full chat replacement
    const isFullChat = 'id' in update && update.id === chatId;

    let updatedChat: Chat;

    if (isFullChat) {
      // Full chat replacement - no merging needed
      updatedChat = update as Chat;
    } else {
      // Partial update - use deepmerge
      const mergeIgnoreKeys = new Set(options?.ignoreKeys ?? []);
      const optionalParameters = {
        ...(options?.noUpdatedAt ? {} : { updatedAt: Date.now() }),
      };

      updatedChat = deepmerge(
        existingChat,
        { ...update, ...optionalParameters },
        {
          customMerge(key) {
            if (mergeIgnoreKeys.has(key)) {
              return (_source: unknown, target: unknown) => target;
            }

            return undefined;
          },
        },
      ) as Chat;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readwrite');
      const store = transaction.objectStore(this.chatsStoreName);

      const request = store.put(updatedChat);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(updatedChat);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  }

  public async getChat(chatId: string): Promise<Chat | undefined> {
    const db = await this.getDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.chatsStoreName, 'readonly');
      const store = transaction.objectStore(this.chatsStoreName);
      const request = store.get(chatId);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
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

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
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
    // Get the chat to make sure it exists
    const chat = await this.getChat(chatId);
    if (!chat) {
      return;
    }

    // Perform soft delete by updating deletedAt timestamp
    await this.updateChat(chatId, { deletedAt: Date.now() });
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
    });
  }

  // ============================================================================
  // Database Management
  // ============================================================================

  private async getDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      // eslint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
      request.onerror = () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- we want to let the actual error be thrown
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const { oldVersion } = event;

        // Version 1: Create builds store
        if (oldVersion < 1 && !db.objectStoreNames.contains(this.buildsStoreName)) {
          db.createObjectStore(this.buildsStoreName, { keyPath: 'id' });
        }

        // Version 2+: Create chats store with resourceId index
        if (oldVersion < 2 && !db.objectStoreNames.contains(this.chatsStoreName)) {
          const chatsStore = db.createObjectStore(this.chatsStoreName, { keyPath: 'id' });
          chatsStore.createIndex('resourceId', 'resourceId', { unique: false });
        }
      };
    });
  }
}
