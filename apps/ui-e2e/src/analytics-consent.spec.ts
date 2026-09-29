import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { filesPane } from '#support/file-tree.js';

const consentCookieName = 'tau-cookie-consent';
const consentStatus = async (): Promise<string | undefined> => {
  const cookies = await target.cookies();
  const cookie = cookies.find(({ name }) => name === consentCookieName);
  return cookie ? (JSON.parse(decodeURIComponent(cookie.value)) as { status?: string }).status : undefined;
};

const hasCookiePrompt = async (): Promise<boolean> =>
  target.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3')].some(({ textContent }) => textContent === 'Cookies'),
  );

const posthogState = async (): Promise<{ cookies: string[]; storage: string[]; requests: string[] }> => {
  const cookies = await target.cookies();
  return {
    cookies: cookies.map(({ name }) => name).filter((name) => name.startsWith('ph_')),
    storage: await target.evaluate(() =>
      Object.keys(localStorage).filter((name) => name.startsWith('ph_') || name.startsWith('posthog')),
    ),
    requests: await target.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map(({ name }) => name)
        .filter((name) => /\/api\/ph(?:\/|$)|posthog\.com/iu.test(name)),
    ),
  };
};
const storedIdentifiers = async (): Promise<number> => {
  const { cookies, storage } = await posthogState();
  return cookies.length + storage.length;
};
const eventCount = async (name: string): Promise<number> => {
  const summary = await target.readPostHogSummary([]);
  return summary.events.filter((event) => event === name).length;
};
const hasEvent = async (name: string): Promise<boolean> => (await eventCount(name)) > 0;
const sentinelPresent = async (sentinel: string): Promise<boolean> => {
  const summary = await target.readPostHogSummary([sentinel]);
  return summary.present[sentinel] === true;
};
const postHogRequestCount = async (): Promise<number> => {
  const summary = await target.readPostHogSummary([]);
  return summary.requests.length;
};

test('requires a reversible web analytics choice and remembers it', async () => {
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('heading', { name: 'Cookies', exact: true }));
  expect(await posthogState()).toEqual({ cookies: [], storage: [], requests: [] });

  await target.click(selectors.getByRole('button', { name: 'Decline', exact: true }));
  await expect.poll(consentStatus).toBe('declined');
  expect(await posthogState()).toEqual({ cookies: [], storage: [], requests: [] });

  await target.navigate('/legal/cookies#preferences');
  await target.click(selectors.getByRole('checkbox', { name: 'Product analytics' }));
  await target.click(selectors.getByRole('button', { name: 'Save settings' }));
  await expect.poll(consentStatus).toBe('accepted');

  await target.reload();
  await expect.poll(hasCookiePrompt).toBe(false);
});

test('treats Global Privacy Control as a hard analytics decline', async () => {
  await target.navigate('/');
  await target.addCookies([
    {
      name: consentCookieName,
      value: encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 })),
      url: await target.currentUrl(),
    },
  ]);
  await target.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
  });
  await target.reload();

  expect(
    await target.evaluate(() => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl),
  ).toBe(true);
  expect(await hasCookiePrompt()).toBe(false);
  await target.navigate('/legal/cookies#preferences');
  await target.expectVisible(selectors.getByRole('checkbox', { name: 'Product analytics' }));
  expect(await target.evaluate(() => document.querySelector<HTMLButtonElement>('#analytics')?.disabled)).toBe(true);
  expect(await posthogState()).toEqual({ cookies: [], storage: [], requests: [] });
});

test('redacts invitation credentials from decoded replay and autocapture transport', async () => {
  const token = 'Replay-Bearer-123';
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  expect(
    await target.evaluate(
      () => (globalThis as typeof globalThis & { ENV?: { POSTHOG_CLIENT_KEY?: string } }).ENV?.POSTHOG_CLIENT_KEY,
    ),
  ).toBe('phc_test_key');
  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(consentStatus).toBe('accepted');
  await target.evaluate((invitationToken: string) => {
    const publicControl = document.createElement('span');
    publicControl.textContent = 'Public replay control';
    document.body.append(publicControl);
    const invitation = document.createElement('a');
    invitation.href = `/invitations/${invitationToken}`;
    invitation.textContent = 'Open invitation';
    invitation.addEventListener('click', (event) => {
      event.preventDefault();
    });
    document.body.append(invitation);
    const input = document.createElement('input');
    input.value = `https://tau.new/invitations/${invitationToken}`;
    document.body.append(input);
    history.pushState({}, '', `/invitations/${invitationToken}`);
    history.pushState({}, '', `/auth/sign-in?redirectTo=%2Finvitations%2F${invitationToken}`);
    invitation.click();
  }, token);
  await expect.poll(async () => eventCount('$snapshot'), { timeout: 30_000 }).toBeGreaterThan(0);
  const summary = await target.readPostHogSummary([token, 'Public replay control']);
  expect(summary.events).toContain('$snapshot');
  expect(summary.events).toContain('$autocapture');
  expect(summary.events.filter((event) => event === '$pageview').length).toBeGreaterThanOrEqual(2);
  expect(summary.present[token]).toBe(false);
  expect(summary.present['Public replay control']).toBe(true);
});

test.each(['/invitations/Replay-Bearer-123', '/auth/sign-in?redirectTo=%2Finvitations%2FReplay-Bearer-123'])(
  'redacts rrweb Meta URL on an accepted initial route: %s',
  async (path) => {
    await target.installPostHogFixture('phc_test_key');
    await target.navigate('/');
    await target.addCookies([
      {
        name: consentCookieName,
        value: encodeURIComponent(JSON.stringify({ status: 'accepted', version: 1 })),
        url: await target.currentUrl(),
      },
    ]);
    await target.navigate(path);
    await expect.poll(async () => eventCount('$snapshot'), { timeout: 30_000 }).toBeGreaterThan(0);
    const summary = await target.readPostHogSummary(['Replay-Bearer-123']);
    expect(summary.events).toContain('$snapshot');
    expect(summary.present['Replay-Bearer-123']).toBe(false);
  },
);

test('blocks replay from mounted editor, chat and file surfaces', async () => {
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await target.navigate('/projects/new');
  await target.fill(selectors.getByCss('input#project-name'), 'Private workspace');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/[^/]+\/[^/]+$/u, 60_000);
  const sourceTab = selectors.getByRole('tab', { name: 'main.scad', exact: true }).last();
  await target.expectVisible(sourceTab, 60_000);
  await target.click(sourceTab);
  await target.expectVisible(selectors.getByCss('.monaco-editor .view-lines').first(), 60_000);
  if (!(await target.isVisible(filesPane()))) {
    await target.click(selectors.getByRole('button', { name: /Search/u }));
    const search = selectors.getByPlaceholder('Search projects, chats, and actions…');
    await target.fill(search, 'Open files');
    await target.click(selectors.getByText('Open files', { exact: true }));
  }
  await target.expectVisible(filesPane(), 60_000);
  const chatToggle = selectors.getByRole('button', { name: 'Toggle Chat lane' });
  if ((await target.getAttribute(chatToggle, 'aria-pressed')) === 'false') {
    await target.click(chatToggle);
  }
  await target.fill(
    selectors.getByCss('.tiptap[contenteditable="true"], textarea[placeholder="Ask Tau to build anything..."]').last(),
    'Private prompt sentinel',
  );
  const surfaces = await target.evaluate(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>('.ph-no-capture')];
    const editor = blocks.find((block) => block.classList.contains('editor-container'));
    const chat = blocks.find((block) => block.classList.contains('overflow-hidden'));
    const files = blocks.find((block) => block.querySelector('[role="treeitem"]') !== null);
    for (const [block, sentinel] of [
      [editor, 'Private source sentinel'],
      [chat, 'Private chat sentinel'],
      [files, 'Private filename sentinel'],
    ] as const) {
      if (!block) {
        continue;
      }
      const probe = document.createElement('span');
      probe.textContent = sentinel;
      block.append(probe);
    }
    const control = document.createElement('span');
    control.textContent = 'Public project control';
    document.body.append(control);
    return { editor: Boolean(editor), chat: Boolean(chat), files: Boolean(files) };
  });
  expect(surfaces).toStrictEqual({ editor: true, chat: true, files: true });
  await expect.poll(async () => sentinelPresent('Public project control'), { timeout: 30_000 }).toBe(true);
  const summary = await target.readPostHogSummary([
    'Private prompt sentinel',
    'Private source sentinel',
    'Private chat sentinel',
    'Private filename sentinel',
    'Public project control',
  ]);
  expect(summary.events).toContain('$snapshot');
  expect(summary.present['Public project control']).toBe(true);
  for (const sensitive of [
    'Private prompt sentinel',
    'Private source sentinel',
    'Private chat sentinel',
    'Private filename sentinel',
  ]) {
    expect(summary.present[sensitive]).toBe(false);
  }
});

test('withdraws an accepted first tab when a second tab saves preferences', async () => {
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(storedIdentifiers).toBeGreaterThan(0);
  await target.evaluate(() => {
    const messages: unknown[] = [];
    (globalThis as typeof globalThis & { tauConsentMessages?: unknown[] }).tauConsentMessages = messages;
    const channel = new BroadcastChannel('tau-cookie-consent');
    channel.addEventListener('message', ({ data }) => messages.push(data));
  });
  await target.openSecondary('/legal/cookies#preferences');
  await target.click(selectors.getByRole('checkbox', { name: 'Product analytics' }), undefined, 'secondary');
  await target.click(selectors.getByRole('button', { name: 'Save settings' }), undefined, 'secondary');
  await expect.poll(consentStatus).toBe('declined');
  await expect
    .poll(async () =>
      target.evaluate(() =>
        (globalThis as typeof globalThis & { tauConsentMessages?: unknown[] }).tauConsentMessages?.includes('declined'),
      ),
    )
    .toBe(true);
  await expect.poll(storedIdentifiers).toBe(0);
  await target.closeSecondary();
});

test('uses focus when an external cookie change has no channel message', async () => {
  await target.addInitScript(() => {
    Object.defineProperty(globalThis, 'cookieStore', { configurable: true, value: undefined });
  });
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(storedIdentifiers).toBeGreaterThan(0);
  await target.addCookies([
    {
      name: consentCookieName,
      value: encodeURIComponent(JSON.stringify({ status: 'declined', version: 1 })),
      url: new URL('/', await target.currentUrl()).toString(),
    },
  ]);
  await expect.poll(consentStatus).toBe('declined');
  expect(await storedIdentifiers()).toBeGreaterThan(0);
  await target.evaluate(() => globalThis.dispatchEvent(new Event('focus')));
  await expect.poll(storedIdentifiers).toBe(0);
});

test('stops the recorder on foreground consent-cookie removal without focus', async () => {
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(storedIdentifiers).toBeGreaterThan(0);
  const before = await postHogRequestCount();
  await target.evaluate(async () => {
    await cookieStore.delete('tau-cookie-consent');
  });
  await expect.poll(consentStatus).toBeUndefined();
  await expect.poll(storedIdentifiers).toBe(0);
  await target.evaluate(() => {
    history.pushState({}, '', '/legal/cookies');
  });
  expect(await postHogRequestCount()).toBe(before);
});

test('delivers pageleave on an accepted document exit signal', async () => {
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(async () => hasEvent('$pageview')).toBe(true);
  await target.evaluate(() => {
    globalThis.dispatchEvent(new Event('pagehide'));
    globalThis.dispatchEvent(new Event('unload'));
  });
  await expect.poll(async () => hasEvent('$pageleave')).toBe(true);
});

/*
 * Consent changes must not remount the product. The old boundary switched
 * element type above <html>, so accepting analytics discarded every editor draft.
 * Withdrawal and re-acceptance arrive as another tab would deliver them: a
 * cookie write followed by focus.
 */
test('keeps the application mounted through acceptance, withdrawal and re-acceptance', async () => {
  await target.installPostHogFixture('phc_test_key');
  await target.navigate('/');
  await target.expectVisible(selectors.getByRole('heading', { name: 'Cookies', exact: true }));
  const editor = selectors
    .getByCss('.tiptap[contenteditable="true"], textarea[placeholder="Ask Tau to build anything..."]')
    .first();
  await target.fill(editor, 'unsaved design');
  await target.evaluate(() => {
    (globalThis as typeof globalThis & { tauMountedEditor?: Element }).tauMountedEditor =
      document.querySelector('.tiptap[contenteditable="true"], textarea[placeholder="Ask Tau to build anything..."]') ??
      undefined;
  });
  const stillMounted = async (): Promise<boolean> =>
    target.evaluate(() => {
      const mounted = (globalThis as typeof globalThis & { tauMountedEditor?: Element }).tauMountedEditor;
      if (!mounted) {
        return false;
      }
      const draft = mounted instanceof HTMLTextAreaElement ? mounted.value : mounted.textContent;
      return (
        mounted.isConnected &&
        mounted ===
          document.querySelector(
            '.tiptap[contenteditable="true"], textarea[placeholder="Ask Tau to build anything..."]',
          ) &&
        draft.includes('unsaved design')
      );
    });
  const writeDecision = async (status: 'accepted' | 'declined'): Promise<void> => {
    await target.addCookies([
      {
        name: consentCookieName,
        value: encodeURIComponent(JSON.stringify({ status, version: 1 })),
        url: new URL('/', await target.currentUrl()).toString(),
      },
    ]);
    await target.evaluate(() => {
      globalThis.dispatchEvent(new Event('focus'));
    });
  };

  await target.click(selectors.getByRole('button', { name: 'Accept', exact: true }));
  await expect.poll(consentStatus).toBe('accepted');
  expect(await stillMounted()).toBe(true);
  await expect.poll(async () => eventCount('$pageview')).toBe(1);

  await writeDecision('declined');
  await expect.poll(hasCookiePrompt).toBe(false);
  expect(await stillMounted()).toBe(true);

  await writeDecision('accepted');
  expect(await stillMounted()).toBe(true);
  expect(await eventCount('$pageview')).toBe(1);
  await target.evaluate(() => {
    history.pushState({}, '', '/legal/cookies');
  });
  await expect.poll(async () => eventCount('$pageview')).toBe(2);
  await expect.poll(storedIdentifiers, { timeout: 15_000 }).toBeGreaterThan(0);

  await writeDecision('declined');
  await expect.poll(consentStatus).toBe('declined');
  await expect.poll(storedIdentifiers, { timeout: 15_000 }).toBe(0);
  expect(await stillMounted()).toBe(true);
});
