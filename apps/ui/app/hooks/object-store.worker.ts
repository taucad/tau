import { expose } from 'comlink';
import type { PartialDeep } from 'type-fest';
import type { Build } from '@taucad/types';
import { IndexedDbStorageProvider } from '#db/indexeddb-storage.js';

// Create a singleton instance of the storage provider
const storage = new IndexedDbStorageProvider();

// Define the worker's API
const objectStoreWorker = {
  // Create a new build
  async createBuild(build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> {
    return storage.createBuild(build);
  },

  // Duplicate a build
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

  // Update an existing build
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

  // Get all builds
  async getBuilds(options?: { includeDeleted?: boolean }): Promise<Build[]> {
    return storage.getBuilds(options);
  },

  // Get a single build by ID
  async getBuild(buildId: string): Promise<Build | undefined> {
    return storage.getBuild(buildId);
  },

  // Delete a build (soft delete)
  async deleteBuild(buildId: string): Promise<void> {
    return storage.deleteBuild(buildId);
  },
};

expose(objectStoreWorker);

export type ObjectStoreWorker = typeof objectStoreWorker;
