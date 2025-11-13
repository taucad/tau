import type { QueryClient } from '@tanstack/react-query';
import type { Message } from '@ai-sdk/react';
import type { Build, Chat, File } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { storage } from '#db/storage.js';
import { generatePrefixedId } from '#utils/id.utils.js';

/**
 * Creates a shared set of build mutations that can be used by both useBuild and useBuilds hooks
 */
export function createBuildMutations(queryClient: QueryClient): {
  deleteBuild: (buildId: string) => Promise<void>;
  restoreBuild: (buildId: string) => Promise<void>;
  duplicateBuild: (buildId: string) => Promise<Build>;
  updateName: (buildId: string, name: string) => Promise<void>;
  updateDescription: (buildId: string, description: string) => Promise<void>;
  updateTags: (buildId: string, tags: string[]) => Promise<void>;
  updateThumbnail: (buildId: string, thumbnail: string) => Promise<void>;
  updateCodeParameters: (
    buildId: string,
    files: Record<string, { content: Uint8Array }>,
    parameters: Record<string, unknown>,
  ) => Promise<void>;
  // New chat-related mutations
  addChat: (buildId: string, initialMessages?: Message[]) => Promise<Chat>;
  updateChatMessages: (buildId: string, chatId: string, messages: Message[]) => Promise<void>;
  updateChatName: (buildId: string, chatId: string, name: string) => Promise<void>;
  setActiveChat: (buildId: string, chatId: string) => Promise<void>;
  deleteChat: (buildId: string, chatId: string) => Promise<void>;
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
        tags: sourceBuild.tags,
        assets: sourceBuild.assets,
        chats: sourceBuild.chats,
        lastChatId: sourceBuild.lastChatId,
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
     * Update a build's description
     */
    async updateDescription(buildId: string, description: string) {
      await storage.updateBuild(buildId, { description });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },

    /**
     * Update a build's tags
     */
    async updateTags(buildId: string, tags: string[]) {
      await storage.updateBuild(buildId, { tags }, { ignoreKeys: ['tags'] });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },

    /**
     * Update a build's thumbnail
     */
    async updateThumbnail(buildId: string, thumbnail: string) {
      await storage.updateBuild(buildId, { thumbnail }, { noUpdatedAt: true });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      void queryClient.invalidateQueries({ queryKey: ['builds'] });
    },

    /**
     * Update a build's code and parameters
     */
    async updateCodeParameters(
      buildId: string,
      files: Record<string, { content: Uint8Array }>,
      parameters: Record<string, unknown>,
    ) {
      const now = Date.now();
      const fileUpdates: Record<string, File> = {};
      for (const [filename, { content }] of Object.entries(files)) {
        fileUpdates[filename] = {
          content,
          lastModified: now,
          size: content.length,
        };
      }

      await storage.updateBuild(
        buildId,
        {
          assets: {
            mechanical: {
              files: fileUpdates,
              parameters,
            },
          },
        },
        { ignoreKeys: ['parameters'] },
      );
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Add a new chat to a build
     */
    async addChat(buildId: string, initialMessages: Message[] = []) {
      const build = await storage.getBuild(buildId);
      if (!build) {
        throw new Error('Build not found');
      }

      const timestamp = Date.now();
      const chatId = generatePrefixedId(idPrefix.chat);

      const newChat: Chat = {
        id: chatId,
        name: 'New chat', // Will be updated by AI
        messages: initialMessages,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const chats = [...build.chats, newChat];

      await storage.updateBuild(
        buildId,
        {
          chats,
          lastChatId: chatId,
        },
        { ignoreKeys: ['chats', 'lastChatId'] },
      );

      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
      return newChat;
    },

    /**
     * Update a chat's messages
     */
    async updateChatMessages(buildId: string, chatId: string, messages: Message[]) {
      const build = await storage.getBuild(buildId);
      if (!build) {
        throw new Error('Build not found');
      }

      const { chats } = build;
      const chatIndex = chats.findIndex((chat) => chat.id === chatId);

      if (chatIndex === -1) {
        throw new Error('Chat not found');
      }

      const updatedChats = [...chats];
      updatedChats[chatIndex] = {
        ...updatedChats[chatIndex]!,
        messages,
        updatedAt: Date.now(),
      };

      await storage.updateBuild(
        buildId,
        {
          chats: updatedChats,
        },
        { ignoreKeys: ['chats'] },
      );

      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Update a chat's name
     */
    async updateChatName(buildId: string, chatId: string, name: string) {
      const build = await storage.getBuild(buildId);
      if (!build) {
        throw new Error('Build not found');
      }

      const { chats } = build;
      const chatIndex = chats.findIndex((chat) => chat.id === chatId);

      if (chatIndex === -1) {
        throw new Error('Chat not found');
      }

      const updatedChats = [...chats];
      updatedChats[chatIndex] = {
        ...updatedChats[chatIndex]!,
        name,
        updatedAt: Date.now(),
      };

      await storage.updateBuild(
        buildId,
        {
          chats: updatedChats,
        },
        { ignoreKeys: ['chats'] },
      );

      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Set the active chat
     */
    async setActiveChat(buildId: string, chatId: string) {
      await storage.updateBuild(buildId, { lastChatId: chatId });
      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },

    /**
     * Delete a chat
     */
    async deleteChat(buildId: string, chatId: string) {
      const build = await storage.getBuild(buildId);
      if (!build) {
        throw new Error('Build not found');
      }

      const { chats } = build;
      const filteredChats = chats.filter((chat) => chat.id !== chatId);

      if (filteredChats.length === chats.length) {
        throw new Error('Chat not found');
      }

      // If we're deleting the active chat, set a new active chat to the most recent one
      let { lastChatId } = build;
      if (lastChatId === chatId && filteredChats.length > 0) {
        const mostRecentChat = filteredChats.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        lastChatId = mostRecentChat?.id;
      } else if (filteredChats.length === 0) {
        lastChatId = undefined;
      }

      await storage.updateBuild(
        buildId,
        {
          chats: filteredChats,
          lastChatId,
        },
        { ignoreKeys: ['chats', 'lastChatId'] },
      );

      void queryClient.invalidateQueries({ queryKey: ['build', buildId] });
    },
  };
}

export type BuildMutations = ReturnType<typeof createBuildMutations>;
