import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge/index.js';
import type { StorageProvider } from '../types/storage.js';
import type { Build } from '~/types/build.js';
import { metaConfig } from '~/config.js';
import { idPrefix } from '~/constants/id.js';
import { generatePrefixedId } from '~/utils/id.js';

export class LocalStorageProvider implements StorageProvider {
  private readonly buildsKey = `${metaConfig.cookiePrefix}builds`;

  public async createBuild(build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>): Promise<Build> {
    const id = generatePrefixedId(idPrefix.build);
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

  public async updateBuild(
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
    const mergeIgnoreKeys = new Set(options?.ignoreKeys ?? []);

    const updatedBuild = deepmerge(
      builds[index],
      { ...update, updatedAt: Date.now() },
      {
        customMerge(key) {
          if (mergeIgnoreKeys.has(key)) {
            return (_source: unknown, target: unknown) => target;
          }

          return undefined;
        },
      },
    ) as Build;
    builds[index] = updatedBuild;
    this.saveBuilds(builds);
    return updatedBuild;
  }

  public async getBuilds(): Promise<Build[]> {
    return this.getBuildsInternal();
  }

  public async getBuild(buildId: string): Promise<Build | undefined> {
    const builds = this.getBuildsInternal();
    return builds.find((b) => b.id === buildId);
  }

  public async deleteBuild(buildId: string): Promise<void> {
    const builds = this.getBuildsInternal();
    const index = builds.findIndex((b) => b.id === buildId);
    if (index !== -1) {
      builds.splice(index, 1);
      this.saveBuilds(builds);
    }
  }

  private getBuildsInternal(): Build[] {
    const data = localStorage.getItem(this.buildsKey);
    return data ? (JSON.parse(data) as Build[]) : [];
  }

  private saveBuilds(builds: Build[]): void {
    localStorage.setItem(this.buildsKey, JSON.stringify(builds));
  }
}
