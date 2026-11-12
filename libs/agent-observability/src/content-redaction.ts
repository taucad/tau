import { evidenceLimits } from '#contract.js';

/** The source redactor's version, written as the projection's `redactor` on a content envelope. @public */
export const contentRedactor = 'content-v1';

/** Text after a redactor ran, and whether it changed anything. @public */
export type Redacted = Readonly<{ text: string; redacted: boolean }>;

/** Text kept for a content part, with the byte accounting the contract checks. @public */
export type RetainedText = Readonly<{
  text: string;
  originalBytes: number;
  retainedBytes: number;
  redaction: 'none' | 'redacted' | 'truncated';
}>;

/** What the export pass knows about the account: its registered email and full name, when it has them. @public */
export type PersonalIdentity = Readonly<{ email?: string | undefined; name?: string | undefined }>;

const encoder = new TextEncoder();
const utf8Bytes = (text: string): number => encoder.encode(text).byteLength;

/* A base64 run this long (768 bytes decoded) with no break is a file, not prose. */
const base64Run = /(?<![\w+/=])[A-Za-z\d+/]{1024,}={0,2}(?![\w+/=])/gu;
const dataUrl = /data:([\w.+-]{1,64}\/[\w.+-]{1,64});base64,([A-Za-z\d+/]*={0,2})/gu;
const decodedBytes = (base64: string): number =>
  Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0));

/**
 * Credential and identity patterns removed at the source, before content is sealed. Each is replaced by a fixed
 * label, so a reader sees that something was there and never what.
 */
const sourcePatterns: ReadonlyArray<readonly [RegExp, string | ((...groups: string[]) => string)]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, '[private-key]'],
  [dataUrl, (_match, mime = 'application/octet-stream', body = '') => `[${mime}, ${decodedBytes(body)} bytes]`],
  [base64Run, (match = '') => `[binary, ${decodedBytes(match)} bytes]`],
  [/\b(Bearer)\s+[\w.~+/-]{8,}=*/giu, '$1 [credential]'],
  [
    /\b(?:sk-ant-[\w-]{16,}|sk-lf-[\w-]{8,}|pk-lf-[\w-]{8,}|sk-(?:proj-)?[\w-]{20,}|(?:sk|rk|pk)_(?:live|test)_[\dA-Za-z]{16,}|whsec_[\dA-Za-z]{16,}|gh[opsur]_[\dA-Za-z]{30,}|github_pat_\w{30,}|xox[abpr]-[\w-]{10,}|AKIA[\dA-Z]{16}|AIza[\w-]{35}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/gu,
    '[credential]',
  ],
  [/\b([a-z][\d+.a-z-]*:\/\/)[^\s:/@]+:[^\s/@]+@/giu, '$1[credential]@'],
  [/(\/(?:Users|home)\/)(?!\[user\])[^\s/]+/gu, '$1[user]'],
  [/([A-Za-z]:\\Users\\)(?!\[user\])[^\s\\]+/gu, '$1[user]'],
];

/**
 * The source redactor (`content-v1`): removes credentials (keys, bearer tokens, private-key blocks, connection-string
 * passwords), home-directory user names in paths, and inline base64 bodies, which become their type and size.
 *
 * @param text - Text a model was given or produced.
 * @returns The redacted text, and whether anything was removed.
 * @public
 */
export const redactSource = (text: string): Redacted => {
  let result = text;
  for (const [pattern, replacement] of sourcePatterns) {
    result =
      typeof replacement === 'string'
        ? result.replaceAll(pattern, replacement)
        : result.replaceAll(pattern, (...groups: unknown[]) =>
            replacement(...groups.filter((group): group is string => typeof group === 'string')),
          );
  }
  return { text: result, redacted: result !== text };
};

const escapeRegExp = (value: string): string => value.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
/* Word boundaries that know letters outside ASCII, so a name is matched as a whole word in any script. */
const wholeWord = (body: string): RegExp => new RegExp(String.raw`(?<![\p{L}\p{N}_])${body}(?![\p{L}\p{N}_])`, 'giu');
const anyEmail = /[\w.%+-]+@[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)+/gu;
/** A name token shorter than this is too common to redact on its own (LQ13). */
const shortestNameToken = 6;

/**
 * The export pass (LQ13): any email address by pattern, the account's registered email ignoring case, and the
 * account's registered full name as a whole phrase on word boundaries ignoring case. A single name token is redacted on
 * its own only when it has 6 or more characters. The caller never runs it over design source or tool arguments.
 *
 * @param text - Text that is not design source or a tool's arguments.
 * @param identity - The account's registered email and full name.
 * @returns The redacted text, and whether anything was removed.
 * @public
 */
export const redactPersonal = (text: string, identity: PersonalIdentity): Redacted => {
  let result = text;
  if (identity.email !== undefined && identity.email.length > 0) {
    result = result.replaceAll(new RegExp(escapeRegExp(identity.email), 'giu'), '[email]');
  }
  result = result.replaceAll(anyEmail, '[email]');
  const tokens =
    identity.name
      ?.trim()
      .split(/\s+/u)
      .filter((token) => token.length > 0) ?? [];
  if (tokens.length > 1) {
    result = result.replaceAll(wholeWord(tokens.map((token) => escapeRegExp(token)).join(String.raw`\s+`)), '[name]');
  }
  for (const token of tokens) {
    if ([...token].length >= shortestNameToken) {
      result = result.replaceAll(wholeWord(escapeRegExp(token)), '[name]');
    }
  }
  return { text: result, redacted: result !== text };
};

/**
 * The longest prefix of `text` that fits `limit` UTF-8 bytes without splitting a character.
 *
 * @param text - The text to cut.
 * @param limit - The byte budget.
 * @returns The prefix.
 * @public
 */
export const utf8Prefix = (text: string, limit: number): string => {
  const bytes = encoder.encode(text);
  if (bytes.byteLength <= limit) {
    return text;
  }
  let end = Math.max(0, limit);
  /* Step back over continuation bytes (10xxxxxx) to a character's first byte. */
  while (end > 0 && bytes[end]! >= 0x80 && bytes[end]! < 0xc0) {
    end--;
  }
  return new TextDecoder().decode(bytes.subarray(0, end));
};

/**
 * Text kept for one content part: source-redacted, then cut to the part cap.
 *
 * @param text - The part's original text.
 * @param limit - The byte cap; the contract's part limit (64 KiB) by default.
 * @returns The kept text with its byte accounting and label.
 * @public
 */
export const retainText = (text: string, limit: number = evidenceLimits.text): RetainedText => {
  const originalBytes = utf8Bytes(text);
  const redacted = redactSource(text);
  const kept = utf8Prefix(redacted.text, Math.min(limit, evidenceLimits.text));
  const retainedBytes = utf8Bytes(kept);
  const truncated = kept.length < redacted.text.length;
  return {
    text: kept,
    originalBytes,
    retainedBytes,
    redaction: truncated ? 'truncated' : redacted.redacted ? 'redacted' : 'none',
  };
};
