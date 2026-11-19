/**
 * Copying from a click without losing the click.
 *
 * Browsers let a page write to the clipboard only while the person's gesture is
 * still current. Safari ends it at the first `await`, and Chrome ends it a few
 * seconds later, so a button that makes a link (publishes, rebuilds, mints a
 * token) and only then calls `writeText` is refused, often on iOS. The way
 * through is to start the write inside the click and let the text arrive later:
 * a `ClipboardItem` takes a promise of its data, and the browser keeps the
 * gesture's permission while that promise settles.
 */

/**
 * What a copy did.
 *
 * @public
 */
export type CopyTextOutcome = Readonly<{
  /** The text that was copied, or that the clipboard refused. */
  text: string;
  /** Whether the clipboard took it. When it did not, show the text selected so a second press or the person copies it. */
  isCopied: boolean;
}>;

const settles = async (writing: Promise<void>): Promise<boolean> => {
  try {
    await writing;
    return true;
  } catch {
    return false;
  }
};

/**
 * Writes known text. `navigator.clipboard` is absent on an insecure origin, so the member access throws there; that is
 * the same answer as a refusal.
 *
 * @param text - What goes on the clipboard, already in hand.
 * @returns Whether the clipboard took it.
 */
const writeKnownText = async (text: string): Promise<boolean> => {
  try {
    return await settles(navigator.clipboard.writeText(text));
  } catch {
    return false;
  }
};

/**
 * Starts a write of text that is still on its way, as a `ClipboardItem` holding a promise of it.
 *
 * @param text - The promise of the text.
 * @returns Whether the clipboard took it, or `undefined` where the browser cannot write a pending item.
 */
const writePendingText = (text: PromiseLike<string>): Promise<boolean> | undefined => {
  try {
    if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard.write !== 'function') {
      return undefined;
    }
    const blob = (async () => new Blob([await text], { type: 'text/plain' }))();
    /* The item is the blob's only reader in a browser; a test double may not read it, and a failed share is the
       caller's to report through `copyText`'s own rejection. */
    // oxlint-disable-next-line promise/prefer-await-to-then -- marks the rejection handled without awaiting the item.
    blob.catch(() => undefined);
    return settles(navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]));
  } catch {
    return undefined;
  }
};

/**
 * Copies text from inside a click, including text the click is still making.
 *
 * Call it synchronously from the event handler, before any `await`: it starts the clipboard write at once. Known text
 * goes through `writeText`; a promise of text goes into a `ClipboardItem`, so the work behind it (a publish, a rebuild)
 * can finish after the gesture without the browser refusing the copy. Where a pending item cannot be written, it tries
 * `writeText` once the text arrives.
 *
 * @param text - The text, or a promise of it.
 * @returns The text and whether the clipboard took it. It rejects only when `text` rejects, so a failed share is told
 * apart from a refused copy.
 *
 * @public
 * @example <caption>Copy a link a click is still making.</caption>
 * ```typescript
 * import { copyText } from '@taucad/ui/utils/clipboard';
 *
 * declare const makeLink: () => Promise<string>;
 *
 * const onClick = async (): Promise<void> => {
 *   const { isCopied } = await copyText(makeLink());
 *   console.log(isCopied ? 'Link copied' : 'Select the link and copy it.');
 * };
 * ```
 */
export const copyText = async (text: string | PromiseLike<string>): Promise<CopyTextOutcome> => {
  if (typeof text === 'string') {
    return { text, isCopied: await writeKnownText(text) };
  }
  // One native promise for both readers: a bare thenable may settle differently for each subscriber.
  const pending = Promise.resolve(text);
  const writing = writePendingText(pending);
  const resolved = await pending;
  if (writing !== undefined && (await writing)) {
    return { text: resolved, isCopied: true };
  }
  return { text: resolved, isCopied: await writeKnownText(resolved) };
};
