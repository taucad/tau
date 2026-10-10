import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { projectToManifest } from '@taucad/project-core';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { openNativeProjectionProject } from '#support/filesystem-projection-fixture.js';

const projectId = 'proj_0123456789ABCDEFGHIJK';
const chatId = 'chat_native_fixture';
const name = 'Native metadata fixture';

describe('native projection project identity', () => {
  it.each(['valid', 'wrong-project', 'wrong-chat', 'outside-home', 'outside-record'] as const)(
    'should bind only the owned physical records: %s',
    async (scenario) => {
      const temporary = await mkdtemp(join(tmpdir(), 'tau-native-projection-seed-'));
      const homeRoot = join(temporary, 'home');
      const ownedRoot = join(homeRoot, 'native-metadata-fixture');
      const root = scenario === 'outside-home' ? join(temporary, 'foreign') : ownedRoot;
      const chatDirectory = join(root, '.tau/chats', chatId);
      try {
        await mkdir(homeRoot, { recursive: true });
        await mkdir(chatDirectory, { recursive: true });
        if (scenario === 'outside-home') {
          await symlink(root, ownedRoot);
        }
        await writeFile(
          join(root, 'tau.json'),
          JSON.stringify(
            projectToManifest({
              id: projectId,
              name,
              description: '',
              tags: [],
              assets: { main: { entryPath: 'main.ts' } },
            }),
          ),
        );
        const chat = JSON.stringify({
          id: scenario === 'wrong-chat' ? 'chat_other' : chatId,
          resourceId: scenario === 'wrong-project' ? 'proj_other' : projectId,
          name: 'Initial design',
          createdAt: 1,
          updatedAt: 1,
        });
        if (scenario === 'outside-record') {
          const foreign = join(temporary, 'foreign-chat.json');
          await writeFile(foreign, chat);
          await symlink(foreign, join(chatDirectory, 'chat.json'));
        } else {
          await writeFile(join(chatDirectory, 'chat.json'), chat);
        }
        const page = mockDeep<Page>();
        page.goto.mockResolvedValue(null);
        page.getByLabel.mockReturnValue(mockDeep<ReturnType<Page['getByLabel']>>());
        page.getByRole.mockReturnValue(mockDeep<ReturnType<Page['getByRole']>>());
        page.url.mockReturnValue(`app://tau/w/home/native-metadata-fixture?chat=${chatId}`);
        const result = openNativeProjectionProject({ page, homeRoot }, name);
        if (scenario === 'valid') {
          const identity = await result;
          expect(identity).toMatchObject({ projectId, chatId });
          expect(identity.root).toContain('/home/native-metadata-fixture');
          expect(page.goto).toHaveBeenCalledWith('app://tau/projects/new');
          expect(page.getByLabel('Project Name *').fill).toHaveBeenCalledWith(name);
          expect(page.getByRole('button', { name: /^Create Project/u }).click).toHaveBeenCalledOnce();
        } else {
          await expect(result).rejects.toThrow(
            scenario === 'outside-home'
              ? 'outside the owned Home'
              : scenario === 'outside-record'
                ? 'outside the owned project'
                : 'does not match the created project and selected chat',
          );
        }
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
  );
});
