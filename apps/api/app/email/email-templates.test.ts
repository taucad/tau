import { describe, expect, it } from 'vitest';
import type { EmailTemplate } from '#email/email.types.js';
import { renderEmailTemplate, subjectForEmailTemplate } from '#email/email-templates.js';

const templates: EmailTemplate[] = [
  { kind: 'magic-link', email: 'user@example.com', url: 'https://tau.new/auth/callback?token=secret' },
  { kind: 'reset-password', email: 'user@example.com', url: 'https://tau.new/auth/reset-password?token=secret' },
  { kind: 'verify-email', email: 'user@example.com', url: 'https://tau.new/auth/verify-email?token=secret' },
  {
    kind: 'publication-invite',
    recipientEmail: 'friend@example.com',
    ownerName: 'Ada',
    publicationTitle: 'Bracket',
    url: 'https://tau.new/v/pub_123',
  },
];

describe('renderEmailTemplate', () => {
  it.each(templates)('renders html and plain text for %s', async (template) => {
    const rendered = await renderEmailTemplate(template);

    expect(subjectForEmailTemplate(template)).toMatch(/\S/u);
    expect(rendered.html).toContain('Tau');
    expect(rendered.html).toContain('href=');
    expect(rendered.text).toContain('Tau');
    expect(rendered.text).not.toContain('<html');
  });

  it('renders publication invite recipient and title', async () => {
    const rendered = await renderEmailTemplate({
      kind: 'publication-invite',
      recipientEmail: 'friend@example.com',
      ownerName: 'Ada',
      publicationTitle: 'Bracket',
      url: 'https://tau.new/v/pub_123',
    });

    expect(rendered.text).toContain('Bracket');
    expect(rendered.text).toContain('friend@example.com');
    expect(rendered.html).toContain('Open design');
  });

  it('renders verification email with Tau branding and frontend verification URL', async () => {
    const rendered = await renderEmailTemplate({
      kind: 'verify-email',
      email: 'user@example.com',
      url: 'https://tau.new/auth/verify-email?token=secret&redirectTo=%2F',
    });

    expect(rendered.html).toContain('Tau logo');
    expect(rendered.html).toContain('#00987c');
    expect(rendered.html).toContain('https://tau.new/auth/verify-email?token=secret');
    expect(rendered.html).not.toContain('/v1/auth/verify-email');
    expect(rendered.text).toMatch(/verify your email/iu);
    expect(rendered.text).toContain('https://tau.new/auth/verify-email?token=secret');
  });
});
