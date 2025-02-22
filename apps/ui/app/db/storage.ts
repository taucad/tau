import type { Build } from '@/types/build';

export interface StorageProvider {
  // Build operations
  createBuild(build: Build): Promise<Build>;
  updateBuild(buildId: string, update: Partial<Build>): Promise<Build | undefined>;
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

  async createBuild(build: Build): Promise<Build> {
    const builds = this.getBuildsInternal();
    builds.push(build);
    this.saveBuilds(builds);
    return build;
  }

  async updateBuild(buildId: string, update: Partial<Build>): Promise<Build | undefined> {
    const builds = this.getBuildsInternal();
    const index = builds.findIndex((b) => b.id === buildId);

    if (index === -1) {
      return undefined;
    }

    const updatedBuild = { ...builds[index], ...update };
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
}

// Export a singleton instance
export const storage = new LocalStorageProvider();
