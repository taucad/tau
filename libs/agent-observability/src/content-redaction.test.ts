import { describe, expect, it } from 'vitest';
import { evidenceLimits } from '#contract.js';
import { redactPersonal, redactSource, retainText } from '#content-redaction.js';

const account = { email: 'Jane.Doe@Example.com', name: 'Jane Fontaine' } as const;

describe('redactSource', () => {
  it.each([
    ['an API key', 'key sk-ant-api03-abcdefghijklmnopqrstuvwx here', 'key [credential] here'],
    ['a Langfuse secret', 'LANGFUSE_SECRET_KEY=sk-lf-1234567890abcdef', 'LANGFUSE_SECRET_KEY=[credential]'],
    ['a GitHub token', 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'token [credential]'],
    ['an AWS key id', 'AKIAABCDEFGHIJKLMNOP', '[credential]'],
    ['a bearer token', 'Authorization: Bearer abcdefghijklmnop.qrstuvwx', 'Authorization: Bearer [credential]'],
    [
      'a private key block',
      'a\n-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\nb',
      'a\n[private-key]\nb',
    ],
    [
      'a connection string',
      'postgres://tau:hunter22@db.internal:5432/tau',
      'postgres://[credential]@db.internal:5432/tau',
    ],
    ['a home directory', 'open /Users/jane/project/main.ts', 'open /Users/[user]/project/main.ts'],
    ['a Linux home directory', 'cd /home/jdoe/src', 'cd /home/[user]/src'],
    ['a Windows home directory', String.raw`C:\Users\jdoe\cad`, String.raw`C:\Users\[user]\cad`],
    ['an inline image', 'see data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', 'see [image/png, 16 bytes]'],
  ])('replaces %s', (_label, text, expected) => {
    expect(redactSource(text)).toEqual({ text: expected, redacted: true });
  });

  it('replaces a long base64 run with its size', () => {
    const run = 'QUJD'.repeat(400);

    expect(redactSource(`x ${run} y`)).toEqual({ text: 'x [binary, 1200 bytes] y', redacted: true });
  });

  it('leaves ordinary text and design source alone', () => {
    const source = 'const width = 40; // mm\nexport default box(width, 20, 10);';

    expect(redactSource(source)).toEqual({ text: source, redacted: false });
  });
});

describe('redactPersonal', () => {
  it.each([
    ['any email address', 'mail bob@corp.io now', 'mail [email] now'],
    ["the account's email, ignoring case", 'I am JANE.DOE@example.COM', 'I am [email]'],
    ["the account's full name as a phrase", 'Signed, jane   fontaine.', 'Signed, [name].'],
    ['a long single name token', 'Fontaine wrote this', '[name] wrote this'],
  ])('redacts %s', (_label, text, expected) => {
    expect(redactPersonal(text, account)).toEqual({ text: expected, redacted: true });
  });

  it('never redacts a short single name token, or a name inside a longer word', () => {
    const text = 'Jane asked; janet and fontaines are other words';

    expect(redactPersonal(text, account)).toEqual({ text, redacted: false });
  });

  it('redacts a short full name only as the whole phrase', () => {
    const shortName = { name: 'Li Wu' };

    expect(redactPersonal('Li said Wu; li wu agreed', shortName)).toEqual({
      text: 'Li said Wu; [name] agreed',
      redacted: true,
    });
    expect(redactPersonal('Li alone', { name: 'Li' })).toEqual({ text: 'Li alone', redacted: false });
  });

  it('treats regular-expression characters in a name literally', () => {
    expect(redactPersonal('a.b c+d', { name: 'a.b c+d' }).text).toBe('[name]');
    expect(redactPersonal('axb c+d', { name: 'a.b c+d' }).redacted).toBe(false);
  });
});

describe('retainText', () => {
  it('keeps short text whole and accounts for its bytes', () => {
    expect(retainText('héllo')).toEqual({ text: 'héllo', originalBytes: 6, retainedBytes: 6, redaction: 'none' });
  });

  it('labels redacted text', () => {
    expect(retainText('token ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toMatchObject({
      text: 'token [credential]',
      redaction: 'redacted',
    });
  });

  it('truncates at a character boundary and labels it', () => {
    const retained = retainText('é'.repeat(10), 5);

    expect(retained).toEqual({ text: 'éé', originalBytes: 20, retainedBytes: 4, redaction: 'truncated' });
  });

  it('caps text at the contract part limit by default', () => {
    const retained = retainText('lorem ipsum '.repeat(6000));

    expect(retained.retainedBytes).toBe(evidenceLimits.text);
    expect(retained.redaction).toBe('truncated');
  });
});
