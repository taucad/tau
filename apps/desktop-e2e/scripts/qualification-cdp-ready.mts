/* oxlint-disable no-await-in-loop -- One bounded, sequential poll of the debugging endpoint. */
/**
 * Attach readiness for the app's debugging endpoint.
 *
 * Playwright's `connectOverCDP` asks each page for its frame tree. A page whose frame tree still shows the initial
 * empty document (an empty URL) is taken to be mid-navigation, and Playwright waits for a `Page.frameNavigated`
 * before it reports the page. When the attach lands while the window's first document is committing, Chromium
 * never sends that event, so the attach waits until its timeout with every command answered and every target
 * responsive. That matches the macOS ZIP `c/reinstall-ui` stall (runs 42536450184 and 42563760774): the relaunched
 * app publishes its debugging port before `window.loadURL('/')` has committed. Locally, attaching to a launching
 * Chromium hung 3 of 60 times, each with an empty frame URL, and 0 of 60 after waiting for the committed document.
 *
 * Waiting here reads `location.href` over each page target's own socket with one `Runtime.evaluate`; it enables no
 * domain and leaves the page running.
 */
import { setTimeout as wait } from 'node:timers/promises';

type Target = {
  readonly type?: string;
  readonly webSocketDebuggerUrl?: string;
};

/**
 * Read one page's committed document URL over its own debugging socket.
 * @param url - The target's `webSocketDebuggerUrl`.
 * @param timeout - How long to wait for the socket and the answer together, in milliseconds.
 * @returns The page's `location.href`, or undefined when it did not answer with a string.
 */
export const readDocumentUrl = async (url: string, timeout = 2000): Promise<string | undefined> =>
  new Promise((resolve) => {
    const socket = new WebSocket(url);
    const finish = (value: string | undefined): void => {
      clearTimeout(timer);
      socket.close();
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish(undefined);
    }, timeout);
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression: 'location.href', returnByValue: true },
        }),
      );
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };
      if (message.id === 1) {
        const value = message.result?.result?.value;
        finish(typeof value === 'string' ? value : undefined);
      }
    });
    socket.addEventListener('error', () => {
      finish(undefined);
    });
  });

/**
 * Wait until a page on the debugging endpoint has committed a document the caller accepts.
 * @param input - The debugging port, the accepted document test, and the absolute deadline in epoch milliseconds.
 * @returns The accepted document URL.
 */
export const waitForCommittedDocument = async (input: {
  readonly port: number;
  readonly accept: (href: string) => boolean;
  readonly deadline: number;
}): Promise<string> => {
  let seen: string[] = [];
  while (Date.now() < input.deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${input.port}/json/list`, { signal: AbortSignal.timeout(5000) });
      const targets = (await response.json()) as Target[];
      const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      seen = [];
      for (const page of pages) {
        const href = await readDocumentUrl(page.webSocketDebuggerUrl!);
        seen.push(href ?? '<no answer>');
        if (href !== undefined && input.accept(href)) {
          return href;
        }
      }
    } catch (error) {
      seen = [String(error).slice(0, 200)];
    }
    await wait(100);
  }
  throw new Error(`No page committed an accepted document before the deadline; last seen: ${JSON.stringify(seen)}`);
};
