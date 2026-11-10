import { describe, expect, it } from 'vitest';
import type { EmailTemplate } from '#email.types.js';
import { renderEmailTemplate, specForEmailTemplate, subjectForEmailTemplate } from '#email-templates.js';
import { describeDevice, expiresIn } from '#email-copy.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dark, light } from '#templates/email-palette.generated.js';
import { wordmarkSize } from '#templates/shared.js';

const layout = { siteUrl: 'https://tau.new', assetBase: 'https://tau.new' } as const;

const actionUrl: Record<EmailTemplate['kind'], string> = {
  'magic-link': 'https://tau.new/auth/magic-link/verify?token=secret&redirectTo=%2F',
  'reset-password': 'https://tau.new/auth/reset-password?token=secret',
  'password-changed': 'https://tau.new/auth/forgot-password',
  'verify-email': 'https://tau.new/auth/verify-email?token=secret&redirectTo=%2F',
  'account-exists': 'https://tau.new/auth/sign-in',
  'publication-invite': 'https://tau.new/s/tau~pub_123',
  'payment-failed': 'https://tau.new/?settings=billing',
  'auto-reload-disabled': 'https://tau.new/?settings=billing',
  'auto-reload-action-required': 'https://tau.new/?settings=billing',
};

const templates: EmailTemplate[] = [
  { kind: 'magic-link', email: 'user@example.com', url: actionUrl['magic-link'], device: 'Safari on macOS' },
  { kind: 'reset-password', email: 'user@example.com', url: actionUrl['reset-password'], device: 'Safari on macOS' },
  {
    kind: 'password-changed',
    email: 'user@example.com',
    changedAt: '16 Sep 2026, 10:57 UTC',
    url: actionUrl['password-changed'],
    device: 'Safari on macOS',
  },
  {
    kind: 'verify-email',
    email: 'user@example.com',
    url: actionUrl['verify-email'],
  },
  {
    kind: 'account-exists',
    email: 'user@example.com',
    url: actionUrl['account-exists'],
    resetUrl: 'https://tau.new/auth/forgot-password',
    device: 'Safari on macOS',
  },
  {
    kind: 'publication-invite',
    recipientEmail: 'friend@example.com',
    ownerName: 'Ada',
    publicationTitle: 'Bracket',
    url: actionUrl['publication-invite'],
  },
  {
    kind: 'payment-failed',
    email: 'user@example.com',
    billingUrl: actionUrl['payment-failed'],
    plan: 'Tau Pro · monthly',
    amount: 'US$20.00',
    nextAttemptAt: '19 Sep 2026',
    paymentMethodSummary: 'Visa ···· 8252',
  },
  { kind: 'auto-reload-disabled', email: 'user@example.com', billingUrl: actionUrl['auto-reload-disabled'] },
  {
    kind: 'auto-reload-action-required',
    email: 'user@example.com',
    billingUrl: actionUrl['auto-reload-action-required'],
  },
];

// Every colour the templates may emit. A hex outside this set means a hand-typed value crept back in
// (audit F3); regenerate the palette instead of widening the list.
const palette = new Set<string>(
  [...Object.values(light), ...Object.values(dark)].flatMap((value) => value.match(/#[0-9a-f]{6}/gu) ?? []),
);

describe.each(templates)('$kind email', (template) => {
  it('ships the shared layout contract', async () => {
    const { html } = await renderEmailTemplate(template, layout);
    const spec = specForEmailTemplate(template);

    // F1: the wordmark is a hosted raster, never an inline SVG Gmail and Outlook would drop.
    expect(html).toContain('alt="Tau"');
    expect(html).toContain('https://tau.new/wordmark.png');
    expect(html).not.toContain('<svg');
    // F13: both schemes are declared and the dark block exists.
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    // React-email's Preview would add a second <title> holding the preheader.
    expect(html.match(/<title>[^<]*<\/title>/gu)).toEqual([`<title>${spec.subject}</title>`]);
    // Gmail clips messages past 102 KB; 60 KB keeps the margin wide.
    expect(Buffer.byteLength(html)).toBeLessThan(60 * 1024);
  });

  it('starts the inbox preview at the preheader', async () => {
    const { html } = await renderEmailTemplate(template, layout);
    const spec = specForEmailTemplate(template);

    // Apple Mail starts its snippet at the first literal `<body>` in the raw HTML, wherever it sits.
    expect(html.match(/<body/gu)).toHaveLength(1);
    const afterBody = html.slice(html.indexOf('<body'));
    const firstText = afterBody
      .replaceAll(/<!--[\s\S]*?-->/gu, '')
      .replaceAll(/<[^>]+>/gu, '\n')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '')
      ?.replaceAll('&#x27;', "'")
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&');
    expect(firstText).toBe(spec.preheader);
  });

  it('ships stylesheets every client can keep', async () => {
    const { html } = await renderEmailTemplate(template, layout);
    const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/gu)].map(([, css]) => css ?? '');

    for (const css of blocks) {
      // Comments leak into Apple Mail previews and make Yahoo skip the next rule.
      expect(css).not.toContain('/*');
      expect(css).not.toContain('<');
      // Gmail drops a block over its size limit and every block after it.
      expect(css.length).toBeLessThan(8000);
    }
    // One purpose per block, in order of importance, so a block Gmail rejects takes nothing else with it.
    const purpose = (needle: string): number => blocks.findIndex((css) => css.includes(needle));
    expect(purpose('@media (max-width: 600px)')).toBeLessThan(purpose('prefers-color-scheme'));
    expect(purpose('prefers-color-scheme')).toBeLessThan(purpose('[data-ogsc]'));
    expect(purpose('[data-ogsc]')).toBeLessThan(purpose('@font-face'));
    expect(blocks.filter((css) => css.includes('[')).every((css) => !css.includes('@media'))).toBe(true);
    expect(blocks.filter((css) => css.includes('@font-face')).every((css) => !css.includes('@media'))).toBe(true);
  });

  it('holds the card at 560 px in Outlook for Windows', async () => {
    const { html } = await renderEmailTemplate(template, layout);

    expect(html).toContain('<!--[if mso]><table role="presentation" width="560"');
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
    expect(html).not.toContain('tau-mso-');
  });

  it('styles addresses itself so clients do not turn them blue', async () => {
    const { html } = await renderEmailTemplate(template, layout);
    const addresses = new Set(html.match(/[\w.+-]+@example\.com/gu) ?? []);

    for (const email of addresses) {
      // Every visible occurrence is inside a Tau link; the preheader is hidden and exempt.
      const visible = html.slice(html.indexOf('</div>', html.indexOf('data-skip-in-text')));
      const bare = visible.split(`mailto:${email}`).join('').split(`>${email}</a>`).join('');
      expect(bare, `${email} appears outside a Tau address link`).not.toContain(email);
    }
  });

  it('keeps the subject, preheader and action distinct', async () => {
    const spec = specForEmailTemplate(template);
    const { text } = await renderEmailTemplate(template, layout);

    // F8: the preheader is the second line of the inbox row, not an echo of the first.
    expect(spec.preheader).not.toBe(spec.subject);
    expect(spec.preheader.length).toBeLessThanOrEqual(90);
    expect(subjectForEmailTemplate(template)).toBe(spec.subject);
    // F12: the plain-text part names the sender, keeps the heading in sentence case and states the
    // action URL once — the button and its paste-me fallback must not both print it.
    expect(text.startsWith('Tau')).toBe(true);
    expect(text).toContain(spec.heading);
    expect(text.split(actionUrl[template.kind]).length - 1).toBe(1);
  });

  it('only paints generated palette colours', async () => {
    const { html } = await renderEmailTemplate(template, layout);

    for (const hex of new Set(html.match(/#[0-9a-f]{6}/gu) ?? [])) {
      expect(palette, `${hex} is not in the generated palette`).toContain(hex);
    }
  });
});

describe('wordmark', () => {
  it('keeps the drawn box at the asset ratio', () => {
    const png = readFileSync(resolve(import.meta.dirname, '../../../ui/public/wordmark.png'));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);

    expect(Math.abs(wordmarkSize.width / wordmarkSize.height / (width / height) - 1)).toBeLessThan(0.02);
  });
});

describe('detail rows', () => {
  it('drops a row whose value is absent and keeps the ones present', async () => {
    const withDevice = await renderEmailTemplate(
      { kind: 'magic-link', email: 'user@example.com', url: actionUrl['magic-link'], device: 'Safari on macOS' },
      layout,
    );
    const withoutDevice = await renderEmailTemplate(
      { kind: 'magic-link', email: 'user@example.com', url: actionUrl['magic-link'] },
      layout,
    );

    expect(withDevice.text).toContain('Safari on macOS');
    expect(withDevice.html).toContain('Device');
    // The whole block goes when nothing is left to show, rather than rendering an empty card.
    expect(withoutDevice.html).not.toContain('Device');
    expect(withoutDevice.html).not.toContain('tau-detail-row');
  });

  it('renders the payment rows it was given', async () => {
    const { text } = await renderEmailTemplate(
      {
        kind: 'payment-failed',
        email: 'user@example.com',
        billingUrl: actionUrl['payment-failed'],
        amount: 'US$20.00',
      },
      layout,
    );

    expect(text).toContain('Amount   US$20.00');
    expect(text).not.toContain('Next attempt');
  });
});

describe('automatic reload notices', () => {
  it('says reload is off, that credits stay, and where to set it up again', async () => {
    const { text } = await renderEmailTemplate(
      { kind: 'auto-reload-disabled', email: 'user@example.com', billingUrl: actionUrl['auto-reload-disabled'] },
      layout,
    );

    expect(text).toContain("Automatic credit reload for user@example.com couldn't charge your saved card");
    expect(text).toContain('Your current credits are not affected.');
    expect(text).toContain('Open billing settings');
  });

  it('says the card was not charged and how to finish the payment', async () => {
    const { text } = await renderEmailTemplate(
      {
        kind: 'auto-reload-action-required',
        email: 'user@example.com',
        billingUrl: actionUrl['auto-reload-action-required'],
      },
      layout,
    );

    expect(text).toContain('Your card was not charged, and no credits were added.');
    expect(text).toContain('Finish the payment');
  });
});

describe('copy derived from configuration', () => {
  it('states the deadline the auth config enforces', () => {
    expect(expiresIn('magicLink')).toBe('5 minutes');
    expect(expiresIn('resetPassword')).toBe('1 hour');
  });

  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0', 'Edge on Windows'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0', 'Chrome on iOS'],
  ])('labels %s as %s', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it('omits the device when the agent is missing or unrecognised', () => {
    expect(describeDevice(undefined)).toBeUndefined();
    expect(describeDevice('curl/8.4.0')).toBeUndefined();
  });
});

describe('rendered fixtures', () => {
  it.each(templates)('matches the committed $kind render', async (template) => {
    const { html } = await renderEmailTemplate(template, layout);

    // `.snap`, not `.html`: vitest runs prettier over file snapshots whose extension prettier knows, so an
    // `.html` snapshot is rewritten on write and can never match the raw render again.
    await expect(html).toMatchFileSnapshot(`./__email-snapshots__/${template.kind}.html.snap`);
  });
});
