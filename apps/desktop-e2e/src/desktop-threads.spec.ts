import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { projectTaskRecordSchema } from '@taucad/agent-host/wire';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';

const projectName = 'Threads acceptance';
const rootName = 'Fixture root';
const alternateName = 'Alternate root';
const childName = 'Fixture child';
const grandchildName = 'Fixture grandchild';

const jsonLine = (value: unknown): string => `${JSON.stringify(value)}\n`;

/** The fixture's forced exit must wait until native seeding and collection stop writing into its profile. */
const waitForNativeStore = async (session: DesktopSession, logOffset: number): Promise<void> => {
  await expect
    .poll(
      async () => {
        const log = await readFile(session.logPath, 'utf8');
        const launchLog = log.slice(logOffset);
        if (/ native\.store /u.test(launchLog)) {
          throw new Error('Packaged native payload seeding failed.');
        }
        return / native\.seed /u.test(launchLog) && / native\.gc /u.test(launchLog);
      },
      { timeout: 240_000 },
    )
    .toBe(true);
};

/** Seed only completed, schema-valid records while the packaged app is closed. */
const seedThreads = async ({
  projectRoot,
  projectId,
  rootChatId,
  alternateChatId,
}: Readonly<{
  projectRoot: string;
  projectId: string;
  rootChatId: string;
  alternateChatId: string;
}>): Promise<void> => {
  const chatsRoot = join(projectRoot, '.tau', 'chats');
  const now = Date.now();
  const rootTaskId = 'fixture-root';
  const childTaskId = 'fixture-child';
  const grandchildTaskId = 'fixture-grandchild';
  const childChatId = 'fixture-child-chat';
  const grandchildChatId = 'fixture-grandchild-chat';
  const attempt = (id: string, createdAt: number) => ({
    id: `attempt-${id}`,
    number: 1,
    status: 'completed',
    source: { revisionId: 'fixture-base', checkoutId: 'fixture-base' },
    toolGrant: { toolChoice: 'none' },
    createdAt,
    endedAt: createdAt + 1,
  });
  const tasks = [
    {
      id: rootTaskId,
      projectId,
      chatId: rootChatId,
      depth: 0,
      title: rootName,
      prompt: 'Fixture root instruction',
      provider: { id: 'codex' },
      attempts: [attempt('root', now)],
      createdAt: now,
      closed: false,
    },
    {
      id: childTaskId,
      projectId,
      chatId: childChatId,
      parentTaskId: rootTaskId,
      depth: 1,
      title: childName,
      prompt: 'Inspect the fixture child transcript.',
      provider: { id: 'codex' },
      attempts: [attempt('child', now + 2)],
      createdAt: now + 2,
      closed: false,
    },
    {
      id: grandchildTaskId,
      projectId,
      chatId: grandchildChatId,
      parentTaskId: childTaskId,
      depth: 2,
      title: grandchildName,
      prompt: 'Inspect the fixture grandchild transcript.',
      provider: { id: 'codex' },
      attempts: [attempt('grandchild', now + 4)],
      createdAt: now + 4,
      closed: false,
    },
  ];
  const journal = projectTaskRecordSchema.parse({ version: 1, projectId, sequence: 1, tasks });
  const taskRoot = join(chatsRoot, '.project-tasks');
  await mkdir(taskRoot, { recursive: true });
  await writeFile(join(taskRoot, 'records.jsonl'), jsonLine(journal));

  const renameRoot = async (chatId: string, name: string): Promise<void> => {
    const path = join(chatsRoot, chatId, 'chat.json');
    const record = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    await writeFile(path, `${JSON.stringify({ ...record, name }, undefined, 2)}\n`);
  };
  await renameRoot(rootChatId, rootName);
  await renameRoot(alternateChatId, alternateName);

  await Promise.all(
    (
      [
        [childChatId, childName, childTaskId, rootTaskId, rootChatId, 'Fixture child history is visible.'],
        [
          grandchildChatId,
          grandchildName,
          grandchildTaskId,
          childTaskId,
          childChatId,
          'Fixture grandchild history is visible.',
        ],
      ] as const
    ).map(async ([chatId, name, taskId, parentTaskId, parentChatId, content]) => {
      const directory = join(chatsRoot, chatId);
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, 'chat.json'),
        `${JSON.stringify(
          {
            id: chatId,
            resourceId: projectId,
            name,
            createdAt: now,
            updatedAt: now,
            taskLineage: { taskId, parentTaskId, parentChatId, rootChatId },
          },
          undefined,
          2,
        )}\n`,
      );
      await writeFile(
        join(directory, 'events.jsonl'),
        jsonLine({
          version: 1,
          leaderEpoch: 'fixture-epoch',
          epoch: 1,
          sequence: 0,
          recordedAt: new Date(now).toISOString(),
          runId: `attempt-${taskId}`,
          type: 'message.appended',
          message: { id: `message-${taskId}`, role: 'assistant', content },
        }),
      );
    }),
  );
};

test('should navigate packaged fixture-backed child and grandchild histories without opening a generic child chat', async () => {
  const profileRoot = await mkdtemp(join(tmpdir(), 'tau-threads-e2e-'));
  const logPath = join(profileRoot, 'logs', 'desktop.log');
  let session: DesktopSession | undefined;
  let failure: Error | undefined;
  try {
    session = await launchDesktopApp({
      token: 'offline-preferences',
      packaged: true,
      profileRoot,
      preserveProfile: true,
    });
    let { page } = session;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('app://tau/projects/new');
    await page.getByLabel('Project Name *').fill(projectName);
    await page.getByRole('button', { name: /^Create Project/u }).click();
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const projectUrl = new URL(page.url());
    const slug = projectUrl.pathname.split('/').at(-1);
    expect(slug).toBeTruthy();
    const projectRoot = join(session.homeRoot, slug!);
    const projectId = (JSON.parse(await readFile(join(projectRoot, 'tau.json'), 'utf8')) as { id: string }).id;
    const newChat = page.getByRole('button', { name: `New chat in ${projectName}` });
    const priorChatId = new URL(page.url()).searchParams.get('chat');
    await newChat.click();
    await expect
      .poll(
        () => {
          const current = new URL(page.url()).searchParams.get('chat');
          return current && current !== priorChatId ? current : undefined;
        },
        { timeout: 60_000 },
      )
      .toBeTruthy();
    const rootChatId = new URL(page.url()).searchParams.get('chat')!;
    await newChat.click();
    await expect
      .poll(
        () => {
          const current = new URL(page.url()).searchParams.get('chat');
          return current && current !== rootChatId ? current : undefined;
        },
        { timeout: 60_000 },
      )
      .toBeTruthy();
    const alternateChatId = new URL(page.url()).searchParams.get('chat')!;
    expect(alternateChatId).toBeTruthy();
    await waitForNativeStore(session, 0);
    await session.close();
    session = undefined;

    await seedThreads({ projectRoot, projectId, rootChatId, alternateChatId });
    const firstLaunchLog = await readFile(logPath, 'utf8');
    const secondLogOffset = firstLaunchLog.length;
    session = await launchDesktopApp({
      token: 'offline-preferences',
      packaged: true,
      profileRoot,
      preserveProfile: true,
    });
    ({ page } = session);
    await page.setViewportSize({ width: 1440, height: 900 });
    projectUrl.searchParams.set('chat', rootChatId);
    projectUrl.searchParams.set('thread', 'fixture-child');
    await page.goto(projectUrl.toString());
    const child = page.getByRole('region', { name: `Thread ${childName}` });
    await child.waitFor({ state: 'visible', timeout: 60_000 });
    await expect
      .poll(async () => child.getByText('Fixture child history is visible.').isVisible(), { timeout: 30_000 })
      .toBe(true);
    expect(new URL(page.url()).searchParams.get('chat')).toBe(rootChatId);
    expect(await page.getByRole('link', { name: childName, exact: true }).count()).toBe(0);
    await session.capture('threads-fixture-child');

    await child.getByRole('button', { name: grandchildName }).click();
    const grandchild = page.getByRole('region', { name: `Thread ${grandchildName}` });
    await grandchild.waitFor({ state: 'visible' });
    await expect
      .poll(async () => grandchild.getByText('Fixture grandchild history is visible.').isVisible(), { timeout: 30_000 })
      .toBe(true);
    expect(new URL(page.url()).searchParams.get('chat')).toBe(rootChatId);
    await session.capture('threads-fixture-grandchild');

    await grandchild
      .getByRole('navigation', { name: 'Thread ancestry' })
      .getByRole('button', { name: childName })
      .click();
    await child.waitFor({ state: 'visible' });
    await child.getByRole('button', { name: 'Back to threads' }).click();
    const overview = page.getByRole('region', { name: 'Threads for this chat' });
    await overview.waitFor({ state: 'visible' });
    await expect
      .poll(async () => overview.getByRole('button', { name: `Open ${childName}` }).isVisible(), { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(async () => overview.getByRole('button', { name: `Open ${grandchildName}` }).isVisible(), {
        timeout: 30_000,
      })
      .toBe(true);
    await session.capture('threads-fixture-overview');

    await page.getByRole('link', { name: alternateName, exact: true }).click();
    await expect.poll(async () => overview.getByText('No threads yet').isVisible(), { timeout: 30_000 }).toBe(true);
    await session.capture('threads-fixture-alternate-root');
    await page.getByRole('link', { name: rootName, exact: true }).click();
    await expect
      .poll(async () => overview.getByRole('button', { name: `Open ${childName}` }).isVisible(), { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(async () => overview.getByRole('button', { name: `Open ${grandchildName}` }).isVisible(), {
        timeout: 30_000,
      })
      .toBe(true);
    await session.capture('threads-fixture-restored-root');

    const settingsUrl = new URL(page.url());
    settingsUrl.searchParams.set('settings', 'experimental');
    await page.goto(settingsUrl.toString());
    const threadsToggle = page.getByRole('switch', { name: 'Project threads' });
    await threadsToggle.waitFor({ state: 'visible' });
    expect(await threadsToggle.isChecked()).toBe(true);
    await threadsToggle.click();
    expect(await threadsToggle.isChecked()).toBe(false);
    await page.reload();
    await threadsToggle.waitFor({ state: 'visible' });
    expect(await threadsToggle.isChecked()).toBe(false);
    await session.capture('threads-settings-disabled');
    await threadsToggle.click();
    expect(await threadsToggle.isChecked()).toBe(true);
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => overview.getByRole('button', { name: `Open ${childName}` }).isVisible(), { timeout: 30_000 })
      .toBe(true);
    await session.capture('threads-settings-restored');
    await waitForNativeStore(session, secondLogOffset);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    await session?.capture('threads-fixture-failure').catch(() => undefined);
  }
  try {
    await session?.close();
  } catch (error) {
    failure ??= error instanceof Error ? error : new Error(String(error));
  }
  try {
    await rm(profileRoot, { recursive: true, force: true });
  } catch (error) {
    failure ??= error instanceof Error ? error : new Error(String(error));
  }
  if (failure) {
    throw failure;
  }
});
