import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';
import { setTimeout as wait } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { desktopE2ECompletedArtifact } from '#support/config.js';
import {
  authenticatePackagedDesktop,
  createPickedDirectories,
  launchDesktopApp,
  removeDesktopRoot,
} from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { gatewayFixtureModelName, installGatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  expectSignedIn,
  expectVisible,
  parkPointer,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

type Page = DesktopSession['page'];

/**
 * The operator's case, rehearsed (desktop resilient startup blueprint, Test plan WP12).
 *
 * The incident: 29 test folders granted in a real profile, 28 of them deleted afterwards, one of those chosen as the
 * composer's creation location. Every later launch showed "Couldn't start the file service" and Home was down. The
 * rehearsal produces that profile through the harness, breaks it the same way, and then launches over it and touches
 * nothing: Home must work, nothing may be forgotten automatically, and the dead folders wait in one collapsed group
 * for one optional click.
 *
 * Every row here spans packages (WP1–WP6, WP10), so it lands first as `it.fails`, the repository's form for a
 * known-red test. A row turns red the moment its behaviour is fixed, and the package that fixes it removes the mark.
 */

/** The incident's folder count, and how many of them were deleted. */
const grantedFolders = 29;
const deletedFolders = 28;

/** Long enough for a cold Electron launch plus the watchdog's 60 s deadline (D0). */
const homeReadyTimeout = 90_000;

/** A producer launch connects 29 folders and runs one scripted turn. */
const rehearsalTimeout = 1_500_000;

/**
 * T-REH.2's producer: the unpackaged app built at the release's base commit, in a second worktree (I2). Its build is
 * the update as the data sees it; the release-gate job sets it and the PR lane does not.
 */
const baseDesktopRoot = process.env['TAU_E2E_REHEARSAL_BASE_DESKTOP_ROOT'];

const homeProjectName = 'Rehearsal Home project';
const folderPrompt = 'Create a cube with a centered cylindrical cutout and verify it.';

type BootHealth = { readonly last?: { readonly stage?: string; readonly mode?: string } };

const readJson = async <T>(path: string): Promise<T | undefined> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const grantsPath = (profile: string): string => join(profile, 'granted-roots.json');

const readGrants = async (profile: string): Promise<readonly string[]> =>
  (await readJson<readonly string[]>(grantsPath(profile))) ?? [];

/** The granted folders, without Home: main admits Home into the same file at every launch (`main.ts`). */
const readFolderGrants = async (profile: string): Promise<readonly string[]> => {
  const home = join(profile, 'home');
  const homeSpellings = new Set([home, await realpath(home).catch(() => home)]);
  const grants = await readGrants(profile);
  return grants.filter((entry) => !homeSpellings.has(entry));
};

/** Whether the grant file names this folder, in either spelling (`/var/…` and `/private/var/…` on macOS). */
const isGranted = async (profile: string, directory: string): Promise<boolean> => {
  const spellings = new Set([directory, await realpath(directory).catch(() => directory)]);
  const grants = await readGrants(profile);
  return grants.some((entry) => spellings.has(entry));
};

/** The furthest boot stage and mode the ledger recorded for the launch now running (D0). */
const bootHealth = async (profile: string): Promise<BootHealth['last']> => {
  const ledger = await readJson<BootHealth>(join(profile, 'boot-health.json'));
  return ledger?.last;
};

/** What `desktop.log` gained since `offset`, the size it had before this launch. */
const logSince = async (logPath: string, offset: number): Promise<string> => {
  const contents = await readFile(logPath).catch(() => Buffer.alloc(0));
  return contents.subarray(Math.min(offset, contents.length)).toString('utf8');
};

const sizeOf = async (path: string): Promise<number> => {
  const info = await stat(path).catch(() => undefined);
  return info?.size ?? 0;
};

/** Every file under `root` with its size and modification time, for an "unchanged on disk" comparison. */
const snapshotTree = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile());
  const lines = await Promise.all(
    files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      const info = await stat(path);
      return `${relative(root, path)} ${String(info.size)} ${String(info.mtimeMs)}`;
    }),
  );
  return lines.toSorted();
};

type ChatRecordFile = Readonly<Record<string, unknown>> & {
  readonly startupRequest?: { readonly messageId?: unknown };
};

/** Every chat's `chat.json` under `root`, by chat directory. */
const readChatRecords = async (root: string): Promise<ReadonlyMap<string, ChatRecordFile | undefined>> => {
  const ids = await readdir(root).catch(() => []);
  const records = await Promise.all(
    ids.map(async (id) => [id, await readJson<ChatRecordFile>(join(root, id, 'chat.json'))] as const),
  );
  return new Map(records);
};

/**
 * The chats under `root` hold what they held before, with one write that opening a chat may make.
 *
 * A chat created from Home carries its first prompt as a one-shot start intent, `startupRequest`, until the host has
 * durably accepted that Start. The producer clears it when the acceptance lands; when the session that dispatched it is
 * gone by then, the next open of the chat finds the prompt's turn already in the log and clears the intent instead,
 * without resending it (`ChatSessionStore.startPendingSeed`). That write drops only the accepted intent and moves
 * `updatedAt`: the prompt itself is the log's turn, which must be unchanged. Every other file, the log included, is
 * compared byte for byte and by modification time; every other field of every record must be equal.
 */
const expectChatHistoryKept = async (
  root: string,
  before: { readonly tree: readonly string[]; readonly records: ReadonlyMap<string, ChatRecordFile | undefined> },
): Promise<void> => {
  const pathOf = (line: string): string => line.split(' ')[0] ?? '';
  const isRecordLine = (line: string): boolean => pathOf(line).endsWith('/chat.json');
  const isOtherLine = (line: string): boolean => !isRecordLine(line);
  const tree = await snapshotTree(root);
  expect(tree.filter((line) => isOtherLine(line))).toEqual(before.tree.filter((line) => isOtherLine(line)));
  expect(tree.filter((line) => isRecordLine(line)).map((line) => pathOf(line))).toEqual(
    before.tree.filter((line) => isRecordLine(line)).map((line) => pathOf(line)),
  );
  const records = await readChatRecords(root);
  const logs = new Map(
    await Promise.all(
      [...before.records.keys()].map(
        async (id) => [id, await readFile(join(root, id, 'events.jsonl'), 'utf8').catch(() => '')] as const,
      ),
    ),
  );
  for (const [id, previous] of before.records) {
    const current = records.get(id);
    if (previous?.startupRequest === undefined || current?.startupRequest !== undefined) {
      expect(current, `${id}/chat.json`).toEqual(previous);
      continue;
    }
    const { startupRequest, updatedAt: _previousUpdatedAt, ...kept } = previous;
    const { updatedAt: _currentUpdatedAt, ...now } = current ?? {};
    expect(now, `${id}/chat.json without the accepted start intent`).toEqual(kept);
    const { messageId } = startupRequest;
    expect(typeof messageId).toBe('string');
    expect(logs.get(id), `${id}'s log holds the cleared intent's turn`).toContain(String(messageId));
  }
};

const createInTrigger = (page: Page): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: /^Create in /u }).first();

/**
 * Connect the folder the dialog stub answers next, through the composer's location picker, and wait for its grant.
 * Every rehearsal folder is named `tau-desktop-workspace`, as in the incident, so the trigger's label cannot tell one
 * connect from the next; the grant file can.
 */
const connectNextFolder = async (session: DesktopSession, directory: string): Promise<void> => {
  const { page } = session;
  await parkPointer(page);
  await createInTrigger(page).click();
  await page
    .getByRole('button', { name: /Connect a folder/u })
    .first()
    .click();
  await expect.poll(async () => isGranted(session.profileRoot, directory), { timeout: 60_000 }).toBe(true);
  await expect
    .poll(async () => createInTrigger(page).getAttribute('aria-label'), { timeout: 60_000 })
    .toBe('Create in tau-desktop-workspace');
  /* The connect is finished when the picker closes and its request to focus the composer, queued for the next frame,
   * has run. The grant lands before both and the label cannot tell one connect from the next, so without this the
   * next connect opened the picker and the finishing one moved focus out of it, which closed it under the click and
   * left no "Connect a folder…" to press. */
  await expect
    .poll(async () => page.getByRole('button', { name: /Connect a folder/u }).count(), { timeout: 60_000 })
    .toBe(0);
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
};

/** Create a project in Home through the new-project page while Home is the creation location. */
const createHomeProject = async (page: Page, name: string): Promise<void> => {
  await page.goto('app://tau/projects/new');
  await page.getByLabel('Project Name *').fill(name);
  await page.getByRole('button', { name: /^Create Project/u }).click();
  await page.waitForURL(/\/w\//u, { timeout: 120_000 });
  await page.goto('app://tau/');
};

/**
 * Create a project with a chat in the current creation location through the home composer and one scripted turn.
 *
 * @returns The project's directory on disk.
 */
const createFolderProjectWithChat = async (session: DesktopSession, folder: string): Promise<string> => {
  const { page } = session;
  const fixture = await installGatewayFixture(page);
  try {
    await selectKernel(page, 'OpenSCAD');
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, folderPrompt);
    await waitForProjectOnDisk(folder, slug, { extension: '.scad', page });
    const project = join(folder, slug);
    await expect
      .poll(
        async () =>
          readdir(join(project, '.tau', 'chats')).then(
            (entries) => entries.length,
            () => 0,
          ),
        {
          timeout: 120_000,
        },
      )
      .toBeGreaterThan(0);
    await page.goto('app://tau/');
    return project;
  } finally {
    await fixture.close();
  }
};

const launchSignedIn = async (
  token: string,
  options: Omit<Parameters<typeof launchDesktopApp>[0], 'token'>,
): Promise<DesktopSession> => {
  const session = await launchDesktopApp({ token, preserveProfile: true, ...options });
  await expectVisible(session.page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  if (desktopE2ECompletedArtifact) {
    await authenticatePackagedDesktop(session, token);
  }
  await expectSignedIn(session.page);
  return session;
};

/** Wait for this launch to record `home-ready` in normal mode, the boot invariant (D0). */
const expectHomeReady = async (session: DesktopSession): Promise<void> => {
  await expect
    .poll(async () => bootHealth(session.profileRoot), { timeout: homeReadyTimeout })
    .toMatchObject({ stage: 'home-ready', mode: 'normal' });
};

const expectNoStartFailure = async (page: Page): Promise<void> => {
  expect(await page.getByText("Couldn't start the file service").count()).toBe(0);
  expect(await page.getByText("Couldn't load projects").count()).toBe(0);
};

const unavailableNotice = (page: Page): ReturnType<Page['getByText']> => page.getByText(/can.t be found/u);

let sessions: DesktopSession[] = [];
let cleanups: Array<() => Promise<void>> = [];
let seededEmail: string | undefined;

afterEach(async () => {
  for (const session of sessions.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- One Electron at a time; each close owns its process.
    await session.close();
  }
  sessions = [];
  for (const cleanup of cleanups.toReversed()) {
    // oxlint-disable-next-line no-await-in-loop -- Removals wait for the processes that name each root.
    await cleanup();
  }
  cleanups = [];
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

const track = (session: DesktopSession): DesktopSession => {
  sessions.push(session);
  return session;
};

/** Close a session this spec opened and stop tracking it, keeping its profile for the next launch. */
const closeSession = async (session: DesktopSession): Promise<void> => {
  sessions = sessions.filter((entry) => entry !== session);
  await session.close();
};

const seedAccount = async (label: string): Promise<string> => {
  const account = tauTestAccount(label);
  seededEmail = account.email;
  return seedTauTestUser(account);
};

/**
 * Steps 1–5 of the rehearsal (Test plan, WP12). The producer is the candidate itself for T-REH.1 and the base
 * commit's build for T-REH.2; steps 2–5 always run the candidate.
 */
const rehearse = async (label: string, producerDesktopRoot: string | undefined): Promise<void> => {
  const token = await seedAccount(label);
  const picked = await createPickedDirectories(grantedFolders);
  cleanups.push(picked.remove);
  const [survivor, ...doomed] = picked.directories;
  if (survivor === undefined || doomed.length !== deletedFolders) {
    throw new Error(`The rehearsal needs ${String(grantedFolders)} folders.`);
  }

  /* 1. Produce the profile. */
  const producer = track(
    await launchSignedIn(token, {
      pickedDirectories: picked.directories,
      ...(producerDesktopRoot === undefined ? {} : { desktopRoot: producerDesktopRoot }),
    }),
  );
  const profile = producer.profileRoot;
  cleanups.push(async () => removeDesktopRoot(profile));
  await createHomeProject(producer.page, homeProjectName);
  /* The surviving folder is connected first and holds the folder project and its chat; the folders connected after
   * it are the ones deleted, and the last of them stays the composer's creation location, as in the incident. The
   * composer stores its location when a project is created there, not when a folder is connected, so the last folder
   * gets a project too. */
  await connectNextFolder(producer, survivor);
  const survivorProject = await createFolderProjectWithChat(producer, survivor);
  for (const directory of doomed) {
    // oxlint-disable-next-line no-await-in-loop -- The dialog stub answers the folders in order.
    await connectNextFolder(producer, directory);
  }
  const chosen = doomed.at(-1);
  if (chosen === undefined) {
    throw new Error('The rehearsal needs a folder to choose.');
  }
  await createFolderProjectWithChat(producer, chosen);
  expect(await readFolderGrants(profile)).toHaveLength(grantedFolders);
  await closeSession(producer);

  /* 2. Break it: delete 28 folders, the composer's chosen one among them, and keep the grant file's bytes. */
  for (const directory of doomed) {
    // oxlint-disable-next-line no-await-in-loop -- Each removal waits for anything still naming its root.
    await removeDesktopRoot(dirname(directory));
  }
  const grantsBefore = await readFile(grantsPath(profile));
  const logOffset = await sizeOf(join(profile, 'logs/desktop.log'));

  /* 3. Launch over it and touch nothing. */
  const candidate = track(await launchDesktopApp({ token, profileRoot: profile, preserveProfile: true }));
  const { page } = candidate;
  await expectHomeReady(candidate);
  await expectNoStartFailure(page);
  await expect
    .poll(async () => createInTrigger(page).getAttribute('aria-label'), { timeout: homeReadyTimeout })
    .toBe('Create in Home');
  await expectVisible(unavailableNotice(page).first(), homeReadyTimeout);
  expect(await logSince(candidate.logPath, logOffset)).not.toContain('[FileManager] state → error');
  const grantsAfter = await readFile(grantsPath(profile));
  expect(grantsAfter.equals(grantsBefore)).toBe(true);
  await page.goto('app://tau/projects');
  await expectVisible(page.getByRole('link', { name: `Open ${homeProjectName}`, exact: true }), homeReadyTimeout);
  await expectNoStartFailure(page);

  /* 4. The folders are there to act on, at the default window size. */
  await page.goto('app://tau/files');
  await expectVisible(page.getByText('Connected', { exact: true }).first(), homeReadyTimeout);
  const notFoundGroup = page.getByRole('button', {
    name: new RegExp(`^Folders not found \\(${String(deletedFolders)}\\)`, 'u'),
  });
  await expectVisible(notFoundGroup, homeReadyTimeout);
  expect(await notFoundGroup.getAttribute('aria-expanded')).toBe('false');
  await notFoundGroup.scrollIntoViewIfNeeded();
  const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  const groupBox = await notFoundGroup.boundingBox();
  expect(groupBox, 'the not-found group is laid out').not.toBeNull();
  expect((groupBox?.y ?? Number.POSITIVE_INFINITY) + (groupBox?.height ?? 0)).toBeLessThanOrEqual(viewport.height);

  /* 5. One optional click. */
  const survivorBefore = await snapshotTree(survivorProject);
  await page.getByRole('button', { name: 'Remove all', exact: true }).click();
  await expect.poll(async () => readFolderGrants(profile).then((grants) => grants.length), { timeout: 60_000 }).toBe(1);
  expect(await isGranted(profile, survivor)).toBe(true);
  await expect.poll(async () => notFoundGroup.count(), { timeout: 60_000 }).toBe(0);
  expect(await snapshotTree(survivorProject)).toEqual(survivorBefore);
};

describe('desktop missing-folder recovery (the operator rehearsal)', () => {
  /* T-REH.1: the incident's profile, produced and opened by the candidate. */
  it(
    'should start Home over 28 deleted folders with nothing forgotten automatically',
    async () => {
      await rehearse('rehearsal', undefined);
    },
    rehearsalTimeout,
  );

  /* T-REH.2, the release gate: the profile is produced by the release's base commit and opened by the candidate.
   * It needs that build, which only the release-gate job provides (`desktop-e2e:test:e2e:rehearsal-gate` refuses to
   * run without it), so the PR lane reports it as skipped rather than passing it for the wrong reason. */
  it.runIf(baseDesktopRoot !== undefined)(
    "should open the base commit's broken profile in the candidate with nothing forgotten automatically",
    async () => {
      await rehearse('rehearsal-base', baseDesktopRoot);
    },
    rehearsalTimeout,
  );

  /* T-R3.2: removing a folder never touches its chats, and the Home notice is shown once. */
  it(
    'should keep a removed folder chat history on disk and list it again when the folder is added back',
    async () => {
      const token = await seedAccount('rehearsal-remove');
      const picked = await createPickedDirectories(2);
      cleanups.push(picked.remove);
      const [kept, missing] = picked.directories;
      if (kept === undefined || missing === undefined) {
        throw new Error('The removal row needs two folders.');
      }

      const producer = track(await launchSignedIn(token, { pickedDirectories: [kept, missing] }));
      const profile = producer.profileRoot;
      cleanups.push(async () => removeDesktopRoot(profile));
      await connectNextFolder(producer, kept);
      const project = await createFolderProjectWithChat(producer, kept);
      await connectNextFolder(producer, missing);
      await closeSession(producer);
      await removeDesktopRoot(dirname(missing));

      const chats = join(project, '.tau', 'chats');
      const chatsBefore = await snapshotTree(chats);
      const recordsBefore = await readChatRecords(chats);
      const manifest = await readJson<{ readonly name: string }>(join(project, 'tau.json'));
      if (manifest === undefined) {
        throw new Error('The folder project has no readable manifest.');
      }

      const second = track(
        await launchDesktopApp({ token, profileRoot: profile, preserveProfile: true, pickedDirectories: [kept] }),
      );
      await expectHomeReady(second);
      await expectVisible(unavailableNotice(second.page).first(), homeReadyTimeout);
      /* Remove from Tau is offered in every state but Connected (D2), so the working folder is disconnected first. */
      await second.page.goto('app://tau/files');
      await second.page
        .getByRole('button', { name: /^Disconnect/u })
        .first()
        .click();
      await second.page
        .getByRole('button', { name: /^Remove from Tau/u })
        .first()
        .click();
      await expect.poll(async () => isGranted(profile, kept), { timeout: 60_000 }).toBe(false);
      expect(await snapshotTree(chats)).toEqual(chatsBefore);

      await second.page.goto('app://tau/');
      await connectNextFolder(second, kept);
      await second.page.goto('app://tau/projects');
      await second.page.getByRole('link', { name: `Open ${manifest.name}`, exact: true }).click();
      await expectVisible(second.page.getByText(folderPrompt).first(), homeReadyTimeout);
      /* Removal and re-adding wrote nothing (above); opening the chat may clear its accepted start intent. */
      await expectChatHistoryKept(chats, { tree: chatsBefore, records: recordsBefore });
      await closeSession(second);

      const third = track(await launchDesktopApp({ token, profileRoot: profile, preserveProfile: true }));
      await expectHomeReady(third);
      await expectNoStartFailure(third.page);
      /* The notice is shown once for each folder that newly becomes unavailable, never again on a later launch. */
      await wait(5000);
      expect(await unavailableNotice(third.page).count()).toBe(0);
    },
    rehearsalTimeout,
  );
});
