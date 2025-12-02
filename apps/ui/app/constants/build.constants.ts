import type { MyUIMessage } from '@taucad/chat';
import type { Build, File } from '@taucad/types';

export type CreateInitialBuildOptions = {
  buildName: string;
  chatId: string;
  initialMessage: MyUIMessage;
  mainFileName: string;
  emptyCodeContent: Uint8Array;
};

export type CreateInitialBuildResult = {
  buildData: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>;
  files: Record<string, File>;
};

export function createInitialBuild(options: CreateInitialBuildOptions): CreateInitialBuildResult {
  const { buildName, chatId, mainFileName, emptyCodeContent } = options;

  const buildData: Omit<Build, 'id' | 'createdAt' | 'updatedAt'> = {
    name: buildName,
    description: '',
    stars: 0,
    forks: 0,
    author: {
      name: 'You',
      avatar: '/avatar-sample.png',
    },
    tags: [],
    thumbnail: '',
    lastChatId: chatId,
    assets: {
      mechanical: {
        main: mainFileName,
        parameters: {},
      },
    },
  };

  const files: Record<string, File> = {
    [mainFileName]: { content: emptyCodeContent },
  };

  return { buildData, files };
}
