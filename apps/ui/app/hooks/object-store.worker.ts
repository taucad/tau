import { expose } from 'comlink';
import type { PartialDeep } from 'type-fest';
import type { Build } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';

// Create a singleton instance of the storage provider
const storage = new IndexedDbStorageProvider();

// Define the worker's API
const objectStoreWorker = {
  // ============================================================================
  // Build Methods
  // ============================================================================

  async createBuild(build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> {
    return storage.createBuild(build);
  },

  async duplicateBuild(buildId: string): Promise<Build> {
    const build = await storage.getBuild(buildId);
    if (!build) {
      throw new Error(`Build not found: ${buildId}`);
    }

    return storage.createBuild({
      ...build,
      name: `${build.name} (Copy)`,
    });
  },

  async updateBuild(
    buildId: string,
    update: PartialDeep<Build>,
    options?: {
      ignoreKeys?: string[];
      noUpdatedAt?: boolean;
    },
  ): Promise<Build | undefined> {
    return storage.updateBuild(buildId, update, options);
  },

  async getBuilds(options?: { includeDeleted?: boolean }): Promise<Build[]> {
    return storage.getBuilds(options);
  },

  async getBuild(buildId: string): Promise<Build | undefined> {
    return storage.getBuild(buildId);
  },

  async deleteBuild(buildId: string): Promise<void> {
    return storage.deleteBuild(buildId);
  },

  // ============================================================================
  // Chat Methods
  // ============================================================================

  async createChat(
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<Chat> {
    return storage.createChat(resourceId, chat);
  },

  async updateChat(
    chatId: string,
    update: PartialDeep<Chat>,
    options?: { ignoreKeys?: string[]; noUpdatedAt?: boolean },
  ): Promise<Chat | undefined> {
    return storage.updateChat(chatId, update, options);
  },

  async getChat(chatId: string): Promise<Chat | undefined> {
    return storage.getChat(chatId);
  },

  async getChatsForResource(resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> {
    return storage.getChatsForResource(resourceId, options);
  },

  async deleteChat(chatId: string): Promise<void> {
    return storage.deleteChat(chatId);
  },

  async duplicateChat(chatId: string): Promise<Chat> {
    return storage.duplicateChat(chatId);
  },
};

expose(objectStoreWorker);

export type ObjectStoreWorker = typeof objectStoreWorker;
