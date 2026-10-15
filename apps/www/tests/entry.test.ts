import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { bootEntry } from '#www/entry.js';

const harness = ({
  cookie = '',
  persist = true,
  pathname = '/',
  search = '',
  hostname = 'taucad.dev',
}: {
  cookie?: string;
  persist?: boolean;
  pathname?: string;
  search?: string;
  hostname?: string;
} = {}) => {
  const classes = new Set<string>();

  const requests: Array<{ url: string; options: RequestInit }> = [];

  const replacements: string[] = [];

  let complete: ((response: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;

  let expire: (() => void) | undefined;

  let click: ((event: TestMouseEvent) => void) | undefined;
  class TestElement {
    public closest() {
      return this;
    }
  }
  class TestMouseEvent {
    public target: TestElement;
    public button: number;
    public metaKey: boolean;
    public prevented: boolean;
    public constructor(modified = false) {
      this.target = new TestElement();
      this.button = 0;
      this.metaKey = modified;
      this.prevented = false;
    }
    public preventDefault() {
      this.prevented = true;
    }
  }
  const document = {
    documentElement: {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
    },
    addEventListener(name: string, listener: (event: TestMouseEvent) => void) {
      if (name === 'click') {
        click = listener;
      }
    },
    get cookie() {
      return cookie;
    },
    set cookie(value) {
      if (persist) {
        cookie = value.split(';')[0] ?? '';
      }
    },
  };
  runInNewContext(`(${bootEntry.toString()})()`, {
    document,
    location: {
      hostname,
      pathname,
      search,
      protocol: 'https:',
      href: `https://${hostname}${pathname}${search}`,
      replace: (url: string) => replacements.push(url),
      assign: (url: string) => replacements.push(url),
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    Element: TestElement,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    MouseEvent: TestMouseEvent,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    URLSearchParams,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    AbortController,
    setTimeout: (callback: () => void) => {
      expire = callback;
      return 1;
    },
    clearTimeout: () => {
      expire = undefined;
    },
    fetch: async (url: string, options: RequestInit) => {
      requests.push({ url, options });
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  return {
    classes,
    requests,
    replacements,
    document,
    resolve: async (value: unknown, ok = true) => {
      assert.ok(complete);
      complete({ ok, json: async () => value });
      await new Promise(setImmediate);
    },
    expire: () => expire?.(),
    click: (modified = false) => {
      const event = new TestMouseEvent(modified);
      click?.(event);
      return event.prevented;
    },
  };
};

test('should hide marketing before fetching and resume a valid session once at the same URL', async () => {
  const view = harness({ search: '?utm_source=return' });
  assert.equal(view.classes.has('entry-pending'), true);
  assert.equal(view.requests[0]!.url, 'https://api.taucad.dev/v1/auth/get-session');
  assert.equal(view.requests[0]!.options.credentials, 'include');
  await view.resolve({
    session: { id: 'synthetic' },
    user: { id: 'synthetic' },
  });
  view.expire();
  assert.equal(view.classes.has('entry-pending'), true);
  assert.equal(view.document.cookie, 'tau-entry=app');
  assert.deepEqual(view.replacements, ['https://taucad.dev/?utm_source=return']);
  assert.equal(view.classes.has('entry-pending'), true);
  assert.equal(harness({ cookie: view.document.cookie }).requests.length, 0);
});
test('should reveal marketing for anonymous, invalid, HTTP failure and blocked cookies without a reload', async () => {
  await Promise.all(
    [
      { session: null, ok: true, persist: true },
      { session: { user: {} }, ok: true, persist: true },
      { session: null, ok: false, persist: true },
      { session: { session: {}, user: {} }, ok: true, persist: false },
    ].map(async ({ session, ok, persist }) => {
      const view = harness({ persist });
      await view.resolve(session, ok);
      assert.equal(view.classes.has('entry-pending'), false);
      assert.equal(view.replacements.length, 0);
    }),
  );
});
test('should settle on timeout and ignore a late authenticated response', async () => {
  const view = harness();
  view.expire();
  assert.equal(view.classes.has('entry-pending'), false);
  assert.equal(view.requests[0]!.options.signal?.aborted, true);
  await view.resolve({ session: {}, user: {} });
  assert.equal(view.replacements.length, 0);
  assert.equal(view.document.cookie, '');
});
test('should honor website choice, stale app responses, subpages and unknown preview hosts', () => {
  for (const options of [
    { cookie: 'tau-entry=website' },
    { cookie: 'tau-entry=app' },
    { search: '?website=1' },
    { pathname: '/pricing/' },
    { hostname: 'preview.netlify.app' },
  ]) {
    const view = harness(options);
    assert.equal(view.requests.length, 0);
    assert.equal(view.classes.size, 0);
  }
});
test('should not override website or successful logout intent with a late session response', async () => {
  const view = harness();
  view.document.cookie = 'tau-entry=website';
  await view.resolve({ session: {}, user: {} });
  assert.equal(view.replacements.length, 0);
  assert.equal(view.document.cookie, 'tau-entry=website');
});

test('should open the bare app while retaining direct fallback for stale edges, previews, blocked cookies and modified clicks', () => {
  const normal = harness({ cookie: 'tau-entry=website' });
  assert.equal(normal.click(), true);
  assert.deepEqual(normal.replacements, ['/']);
  for (const options of [{ cookie: 'tau-entry=app' }, { persist: false }, { hostname: 'preview.netlify.app' }]) {
    const view = harness(options);
    assert.equal(view.click(), false);
    assert.equal(view.replacements.length, 0);
  }
  for (const options of [
    { cookie: 'tau-entry=app', pathname: '/pricing/' },
    { cookie: 'tau-entry=app', search: '?website=1' },
  ]) {
    const view = harness(options);
    assert.equal(view.click(), true);
    assert.deepEqual(view.replacements, ['/']);
  }
  const modified = harness();
  assert.equal(modified.click(true), false);
  assert.equal(modified.replacements.length, 0);
});
