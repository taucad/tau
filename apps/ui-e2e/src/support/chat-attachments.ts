/* oxlint-disable eslint/no-await-in-loop -- Directory-handle traversal is path-ordered and inherently sequential. */
import { expect } from 'vitest';
import { page as selectors } from 'vitest/browser';
import { base64ToUint8Array } from 'uint8array-extras';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * Shared steps for the composer-record and attachment proofs
 * (`chat-attachments.spec.ts`, `chat-drafts.spec.ts`, `home-hydration.spec.ts`).
 *
 * Storage is read straight from the origin-private filesystem, where Chromium
 * pins Home, so an assertion about bytes on disk never goes through the code
 * under test. Home's `/x` is OPFS `x`.
 */

/** One stored file: its name, size and SHA-256. */
export type StoredFile = Readonly<{ name: string; size: number; sha256: string }>;

/** A file the spec hands to the page, as the picker, paste and drop helpers take it. */
export type FixtureFile = Readonly<{ base64: string; mimeType: string; name: string }>;

/** The ids the `[__e2e].chat-attachments` fixture seeded, kept in `localStorage` so they survive a reload. */
export type SeededChatIds = Readonly<{ projectId: string; chatIds: readonly string[] }>;

export const composerSelector = '[aria-label="Ask Tau to build anything..."]';
export const seededIdsStorageKey = 'tau:e2e:chat-attachments';
/** The Anthropic-wire catalog row the gateway fixture speaks; it reads images and PDFs. */
export const pdfModelName = 'Haiku 4.5';
/** A catalog row that reads images but not PDFs (D20). */
export const imageOnlyModelName = 'Gemini 3.1 Pro';

const fixtureRoot = '../desktop-e2e/fixtures';

/**
 * A fixture file's bytes, read on the Vitest server.
 *
 * @param name - The file under `apps/desktop-e2e/fixtures`.
 * @returns The file as the page helpers take it.
 */
export const fixtureFile = async (name: 'bracket-photo.jpg' | 'bracket-spec.pdf'): Promise<FixtureFile> => ({
  base64: await target.commands.readFile(`${fixtureRoot}/${name}`, 'base64'),
  mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
  name,
});

/**
 * The SHA-256 hex of base64 bytes, computed in the runner.
 *
 * @param base64 - The bytes.
 * @returns The digest, lowercase hex.
 */
export const sha256OfBase64 = async (base64: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', base64ToUint8Array(base64)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * List a Home directory's files, or `[]` when it does not exist.
 *
 * @param path - An absolute Home path, e.g. `/.tau/composers/new-project/attachments`.
 * @returns Its files (not recursive), sorted by name.
 */
export const listHomeDirectory = async (path: string): Promise<readonly StoredFile[]> =>
  target.evaluate(async (directoryPath) => {
    // A `*` segment matches whichever child directory holds the rest of the path.
    const resolve = async (
      from: FileSystemDirectoryHandle,
      segments: readonly string[],
    ): Promise<FileSystemDirectoryHandle | undefined> => {
      const [segment, ...rest] = segments;
      if (segment === undefined) {
        return from;
      }
      if (segment === '*') {
        for await (const handle of from.values()) {
          const found = handle.kind === 'directory' ? await resolve(handle, rest) : undefined;
          if (found) {
            return found;
          }
        }
        return undefined;
      }
      try {
        return await resolve(await from.getDirectoryHandle(segment), rest);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') {
          return undefined;
        }
        throw error;
      }
    };
    const directory = await resolve(await navigator.storage.getDirectory(), directoryPath.split('/').filter(Boolean));
    if (!directory) {
      return [];
    }
    const files: Array<{ name: string; size: number; sha256: string }> = [];
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== 'file') {
        continue;
      }
      const file = await handle.getFile();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      files.push({
        name,
        size: file.size,
        sha256: [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      });
    }
    return files.sort((left, right) => left.name.localeCompare(right.name));
  }, path);

/**
 * The names in a Home directory, or `[]` when it does not exist.
 *
 * @param path - An absolute Home path.
 * @returns The file names, sorted.
 */
export const homeFileNames = async (path: string): Promise<readonly string[]> => {
  const files = await listHomeDirectory(path);
  return files.map(({ name }) => name);
};

/**
 * How many elements a locator matches in the target page.
 *
 * @param locator - The locator.
 * @returns The match count.
 */
export const countOf = async (locator: Locator): Promise<number> => {
  const state = await target.read(locator);
  return state.count;
};

/**
 * Read a Home file as text, or `undefined` when it does not exist.
 *
 * @param path - An absolute Home path.
 * @returns The file's text.
 */
export const readHomeText = async (path: string): Promise<string | undefined> =>
  target.evaluate(async (filePath) => {
    const segments = filePath.split('/').filter(Boolean);
    const fileName = segments.pop();
    try {
      let directory = await navigator.storage.getDirectory();
      for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment);
      }
      const fileHandle = await directory.getFileHandle(fileName!);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return undefined;
      }
      throw error;
    }
  }, path);

/**
 * Read a Home JSON file, or `undefined` when it does not exist.
 *
 * @param path - An absolute Home path.
 * @returns The parsed value.
 */
export const readHomeJson = async <Value>(path: string): Promise<Value | undefined> => {
  const text = await readHomeText(path);
  return text === undefined ? undefined : (JSON.parse(text) as Value);
};

/** The record layout (`composer-record-store.ts`), restated so the proof does not trust the code under test. */
export const recordPaths = {
  newProject: '/.tau/composers/new-project.json',
  newProjectAttachments: '/.tau/composers/new-project/attachments',
  chat: (projectId: string, chatId: string): string => `/.tau/composers/chats/${projectId}/${chatId}.json`,
  chatDraftAttachments: (projectId: string, chatId: string): string =>
    `/.tau/composers/chats/${projectId}/${chatId}/attachments`,
  unread: (projectId: string): string => `/.tau/composers/chats/${projectId}/unread.json`,
  /** Home stores a project under its directory name, not its id; chat ids are unique, so any directory will do. */
  chatAttachments: (chatId: string): string => `/*/.tau/chats/${chatId}/attachments`,
} as const;

/** The composer record's shape, as far as these proofs read it. */
export type RecordFile = Readonly<{
  version: number;
  draft?: Readonly<{ parts: ReadonlyArray<Readonly<{ type: string; text?: string; url?: string }>> }>;
  messageEdits?: Readonly<
    Record<string, Readonly<{ parts: ReadonlyArray<Readonly<{ type: string; text?: string }>> }>>
  >;
  toolChoice?: unknown;
  mode?: string;
  unread?: Readonly<Record<string, boolean>>;
}>;

/** The draft's text, joined, from a record file. */
export const recordDraftText = (record: RecordFile | undefined): string =>
  (record?.draft?.parts ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');

/**
 * Wait for the fixture's seeded ids.
 *
 * @returns The project and chat ids, in creation order.
 */
export const seededChatIds = async (): Promise<SeededChatIds> => {
  let ids: SeededChatIds | undefined;
  await expect
    .poll(
      async () => {
        const stored = await target.evaluate((key) => localStorage.getItem(key), seededIdsStorageKey);
        ids = stored ? (JSON.parse(stored) as SeededChatIds) : undefined;
        return ids;
      },
      { timeout: 60_000 },
    )
    .toBeDefined();
  return ids!;
};

/** Enable the plan-mode selector and decline the consent banner before any page loads. */
export const prepareComposerPage = async (): Promise<void> => {
  await target.addInitScript(() => {
    localStorage.setItem('tau:flags', JSON.stringify({ planMode: true }));
  });
};

/** Dismiss the cookie banner when it is shown. */
export const dismissCookies = async (): Promise<void> => {
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

/**
 * Pick a catalog model through the composer's own selector.
 *
 * @param name - The catalog name.
 * @returns Nothing.
 */
export const selectModel = async (name: string): Promise<void> => {
  await target.click(selectors.getByCss(composerSelector).first());
  await target.keyboardPress('ControlOrMeta+Slash');
  await target.click(selectors.getByRole('option', { name, exact: true }).first());
};

/** The composer's attachment rail. */
export const composerRail = (): Locator => selectors.getByCss(`[aria-label="Attachments"]`).first();

/**
 * Choose a file through the composer's paperclip.
 *
 * @param file - The file.
 * @returns Nothing.
 */
export const chooseAttachment = async (file: FixtureFile): Promise<void> => {
  await target.chooseFile(selectors.getByRole('button', { name: 'Add image or PDF' }).first(), file);
};

/**
 * Paste a file into the composer editor, as a clipboard paste would.
 *
 * @param file - The file.
 * @returns Nothing.
 */
export const pasteAttachment = async (file: FixtureFile): Promise<void> => {
  await target.evaluateLocator(
    selectors.getByCss(composerSelector).first(),
    (element, pasted) => {
      // oxlint-disable-next-line no-restricted-globals -- This callback runs in the page, where no module import reaches.
      const bytes = Uint8Array.from(atob(pasted.base64), (character) => character.codePointAt(0)!);
      const data = new DataTransfer();
      data.items.add(new File([bytes], pasted.name, { type: pasted.mimeType }));
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    },
    file,
  );
};

/**
 * Drop a file onto the composer, as an OS drag would.
 *
 * @param file - The file.
 * @returns Nothing.
 */
export const dropAttachment = async (file: FixtureFile): Promise<void> => {
  await target.evaluateLocator(
    selectors.getByCss(composerSelector).first(),
    (element, dropped) => {
      const zone = element.closest('[class~="group/chat-textarea"]');
      if (!zone) {
        throw new Error('The composer drop zone is not rendered.');
      }
      // oxlint-disable-next-line no-restricted-globals -- This callback runs in the page, where no module import reaches.
      const bytes = Uint8Array.from(atob(dropped.base64), (character) => character.codePointAt(0)!);
      const data = new DataTransfer();
      data.items.add(new File([bytes], dropped.name, { type: dropped.mimeType }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
      }
    },
    file,
  );
};

/**
 * Drop a PDF one byte over the 16 MiB document cap (D17), built in the page so
 * the bytes never cross the command channel.
 *
 * @returns Nothing.
 */
export const dropOverCapPdf = async (): Promise<void> => {
  await target.evaluateLocator(selectors.getByCss(composerSelector).first(), (element) => {
    const zone = element.closest('[class~="group/chat-textarea"]');
    if (!zone) {
      throw new Error('The composer drop zone is not rendered.');
    }
    const bytes = new Uint8Array(16 * 1024 * 1024 + 1);
    bytes.set(new TextEncoder().encode('%PDF-1.4\n'));
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'over-cap.pdf', { type: 'application/pdf' }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
  });
};

/**
 * Wait until the rail shows exactly this many image thumbnails and PDF chips.
 *
 * @param expected - The counts.
 * @returns Nothing.
 */
export const expectRail = async (expected: Readonly<{ images: number; pdfs: number }>): Promise<void> => {
  await expect
    .poll(
      async () => ({
        images: await countOf(selectors.getByRole('button', { name: /^Open uploaded image \d+$/u })),
        pdfs: await countOf(composerRail().getByText(/^PDF · /u)),
      }),
      { timeout: 30_000 },
    )
    .toEqual(expected);
};

/**
 * Every text of the toasts shown so far.
 *
 * @returns The toast texts, in order.
 */
export const toastTexts = async (): Promise<readonly string[]> =>
  target.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((toast) => toast.textContent.trim()));

/**
 * Wait for a toast containing this text.
 *
 * @param text - A substring of the toast.
 * @returns Nothing.
 */
export const expectToast = async (text: string): Promise<void> => {
  await expect
    .poll(
      async () => {
        const toasts = await toastTexts();
        return toasts.some((toast) => toast.includes(text));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
};

/**
 * Send the composer's draft with the given text.
 *
 * @param text - The text to type first.
 * @returns Nothing.
 */
export const sendDraft = async (text: string): Promise<void> => {
  await target.type(selectors.getByCss(composerSelector).first(), text);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
};

/** An Anthropic request body, as far as these proofs read it. */
export type AnthropicRequest = Readonly<{
  messages?: ReadonlyArray<Readonly<{ role?: string; content?: unknown }>>;
}>;

type WireBlock = Readonly<{
  type?: string;
  source?: Readonly<{ type?: string; media_type?: string; data?: string }>;
}>;

/**
 * The media blocks one request's last user message carries.
 *
 * @param request - The captured request.
 * @returns Its `image` and `document` blocks.
 */
export const lastUserMediaBlocks = (request: AnthropicRequest): readonly WireBlock[] => {
  const user = (request.messages ?? []).findLast((message) => message.role === 'user');
  return Array.isArray(user?.content)
    ? (user.content as readonly WireBlock[]).filter((block) => block.type === 'image' || block.type === 'document')
    : [];
};
