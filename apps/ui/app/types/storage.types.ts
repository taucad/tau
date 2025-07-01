import type { PartialDeep } from 'type-fest';
import type { Build } from '~/types/build.types.js';

export type StorageProvider = {
  // Build operations
  createBuild(build: Build): Promise<Build>;
  updateBuild(
    buildId: string,
    update: PartialDeep<Build>,
    options: { ignoreKeys?: string[] },
  ): Promise<Build | undefined>;
  getBuilds(): Promise<Build[]>;
  getBuild(buildId: string): Promise<Build | undefined>;
};
