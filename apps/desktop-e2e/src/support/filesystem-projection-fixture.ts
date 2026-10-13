import { readFile, realpath } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { chatRecordSchema } from '@taucad/chat/schemas';
import { projectManifestSchema } from '@taucad/project-core';
import { expect } from 'vitest';
import type { DesktopSession } from '#support/desktop-app.js';

/**
 * Create through the native Home UI, then bind the settled route to its physical records.
 * No browser debug route, generated identity, or filesystem configuration is substituted.
 */
export const openNativeProjectionProject = async (
  session: Pick<DesktopSession, 'page' | 'homeRoot'>,
  name: string,
): Promise<{ root: string; projectId: string; chatId: string; manifestPath: string; chatPath: string }> => {
  const { page } = session;
  await page.goto('app://tau/projects/new');
  await page.getByLabel('Project Name *').fill(name);
  await page.getByRole('button', { name: /^Create Project/u }).click();
  await page.waitForURL(/\/w\//u, { timeout: 60_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 60_000 }).toBeTruthy();
  const url = new URL(page.url());
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const slug = segments[2];
  const chatId = url.searchParams.get('chat');
  if (
    url.protocol !== 'app:' ||
    url.host !== 'tau' ||
    segments.length !== 3 ||
    segments[0] !== 'w' ||
    !slug ||
    !/^[a-zA-Z0-9_-]+$/u.test(slug) ||
    !chatId ||
    !/^[a-zA-Z0-9_-]+$/u.test(chatId)
  ) {
    throw new Error('Native project creation did not resolve a safe project and chat route.');
  }
  const home = await realpath(session.homeRoot);
  const root = await realpath(join(home, slug));
  if (dirname(root) !== home) {
    throw new Error('Native project is outside the owned Home directory.');
  }
  const manifestPath = await realpath(join(root, 'tau.json'));
  const chatPath = await realpath(join(root, '.tau/chats', chatId, 'chat.json'));
  if (!manifestPath.startsWith(`${root}${sep}`) || !chatPath.startsWith(`${root}${sep}`)) {
    throw new Error('Native project records are outside the owned project directory.');
  }
  const manifest = projectManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  const chat = chatRecordSchema.parse(JSON.parse(await readFile(chatPath, 'utf8')));
  expect(manifest.name).toBe(name);
  if (chat.id !== chatId || chat.resourceId !== manifest.id) {
    throw new Error('Native chat record does not match the created project and selected chat.');
  }
  return { root, projectId: manifest.id, chatId, manifestPath, chatPath };
};
