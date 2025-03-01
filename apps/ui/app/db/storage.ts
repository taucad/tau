import type { Build } from '@/types/build';
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import { generatePrefixedId } from '@/utils/id';
import { PREFIX_TYPES } from '@/utils/constants';

export interface StorageProvider {
  // Build operations
  createBuild(build: Build): Promise<Build>;
  updateBuild(
    buildId: string,
    update: PartialDeep<Build>,
    options: { ignoreKeys?: string[] },
  ): Promise<Build | undefined>;
  getBuilds(): Build[];
  getBuild(buildId: string): Build | undefined;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly BUILDS_KEY = 'tau-builds';

  private getBuildsInternal(): Build[] {
    const data = localStorage.getItem(this.BUILDS_KEY);
    return data ? JSON.parse(data) : [];
  }

  private saveBuilds(builds: Build[]): void {
    localStorage.setItem(this.BUILDS_KEY, JSON.stringify(builds));
  }

  async createBuild(build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> {
    const id = generatePrefixedId(PREFIX_TYPES.BUILD);
    const timestamp = Date.now();
    const buildWithId = {
      ...build,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const builds = this.getBuildsInternal();
    builds.push(buildWithId);
    this.saveBuilds(builds);
    return buildWithId;
  }

  async updateBuild(
    buildId: string,
    update: PartialDeep<Build>,
    options?: {
      /**
       * Keys to ignore when merging the build
       */
      ignoreKeys?: string[];
    },
  ): Promise<Build | undefined> {
    const builds = this.getBuildsInternal();
    const index = builds.findIndex((b) => b.id === buildId);

    if (index === -1) {
      return undefined;
    }

    // Custom merge function that doesn't merge leaf nodes for 'files' and 'parameters'
    const mergeIgnoreKeys = new Set(options?.ignoreKeys || []);
    const updatedBuild = deepmerge(
      builds[index],
      { ...update, updatedAt: Date.now() },
      {
        customMerge: (key) => {
          if (mergeIgnoreKeys.has(key)) {
            return (source, target) => target;
          }
        },
      },
    ) as Build;
    builds[index] = updatedBuild;
    this.saveBuilds(builds);
    return updatedBuild;
  }

  getBuilds(): Build[] {
    return this.getBuildsInternal();
  }

  getBuild(buildId: string): Build | undefined {
    const builds = this.getBuilds();
    return builds.find((b) => b.id === buildId);
  }

  async deleteBuild(buildId: string): Promise<void> {
    const builds = this.getBuilds();
    const index = builds.findIndex((b) => b.id === buildId);
    if (index !== -1) {
      builds.splice(index, 1);
      this.saveBuilds(builds);
    }
  }
}

// Export a singleton instance
export const storage = new LocalStorageProvider();
