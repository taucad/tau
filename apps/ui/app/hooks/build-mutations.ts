import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@ai-sdk/react';
import type { Build } from '~/types/build.js';
import { storage } from '~/db/storage.js';

/**
 * Creates a shared set of build mutations that can be used by both useBuild and useBuilds hooks
 */
export function createBuildMutations(queryClient: QueryClient): {
  deleteBuild: (buildId: string) => Promise<void>;
  restoreBuild: (buildId: string) => Promise<void>;
  duplicateBuild: (buildId: string) => Promise<Build>;
  updateName: (buildId: string, name: string) => Promise<void>;
  updateThumbnail: (buildId: string, thumbnail: string) => Promise<void>;
  updateCode: (buildId: string, code: string) => Promise<void>;
  updateParameters: (buildId: string, parameters: Record<string, unknown>) => Promise<void>;
  updateMessages: (buildId: string, messages: Message[]) => Promise<void>;
} {
  return {
    /**
     * Delete a build by ID
     */
    async deleteBuild(buildId: string) {
      await storage.deleteBuild(buildId);
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Restore a deleted build
     */
    async restoreBuild(buildId: string) {
      const build = await storage.getBuild(buildId);
      if (!build) {
        throw new Error('Build not found');
      }

      await storage.updateBuild(buildId, { deletedAt: undefined });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Duplicate a build with a new name
     */
    async duplicateBuild(buildId: string) {
      const sourceBuild = await storage.getBuild(buildId);
      if (!sourceBuild) {
        throw new Error('Build not found');
      }

      const newBuild = await storage.createBuild({
        name: `${sourceBuild.name} (Copy)`,
        description: sourceBuild.description,
        thumbnail: sourceBuild.thumbnail,
        stars: 0,
        forks: 0,
        author: sourceBuild.author,
        tags: sourceBuild.tags || [],
        assets: sourceBuild.assets,
        messages: sourceBuild.messages || [],
      });

      void queryClient.invalidateQueries({ queryKey: ['builds'] });
      return newBuild;
    },

    /**
     * Update a build's name
     */
    async updateName(buildId: string, name: string) {
      await storage.updateBuild(buildId, { name });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },

    /**
     * Update a build's thumbnail
     */
    async updateThumbnail(buildId: string, thumbnail: string) {
      await storage.updateBuild(buildId, { thumbnail });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },

    /**
     * Update a build's code
     */
    async updateCode(buildId: string, code: string) {
      await storage.updateBuild(buildId, {
        assets: {
          mechanical: {
            files: {
              // eslint-disable-next-line @typescript-eslint/naming-convention -- filenames include extensions
              'model.ts': {
                content: code,
              },
            },
          },
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Update a build's parameters
     */
    async updateParameters(buildId: string, parameters: Record<string, unknown>) {
      await storage.updateBuild(
        buildId,
        {
          assets: {
            mechanical: {
              parameters,
            },
          },
        },
        { ignoreKeys: ['parameters'] },
      );
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Update a build's messages
     */
    async updateMessages(buildId: string, messages: Message[]) {
      await storage.updateBuild(
        buildId,
        {
          messages,
        },
        { ignoreKeys: ['messages'] },
      );
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  };
}

export type BuildMutations = ReturnType<typeof createBuildMutations>;
