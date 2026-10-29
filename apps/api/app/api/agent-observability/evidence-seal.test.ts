import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openEvidence, sealEvidence } from '#api/agent-observability/evidence-seal.js';
import type { EvidenceSealBinding } from '#api/agent-observability/evidence-seal.js';

const binding: EvidenceSealBinding = {
  environment: 'staging',
  principal: 'user-a',
  project: 'project-a',
  receipt: 'evr_1',
  plane: 'content',
};
const key = { version: 3, key: Uint8Array.from(randomBytes(32)) };
const keys = new Map([[3, key.key]]);
const bytes = new TextEncoder().encode('PRIVATE_DESIGN_MARKER');

describe('evidence seal', () => {
  it('opens under the binding and key it was sealed with, and hides the plaintext', () => {
    const sealed = sealEvidence(bytes, binding, key);

    expect(sealed.startsWith('3.')).toBe(true);
    expect(sealed).not.toContain('PRIVATE');
    expect(Buffer.from(sealed.split('.')[3]!, 'base64url').toString('utf8')).not.toContain('PRIVATE');
    expect(openEvidence(sealed, binding, keys)).toEqual(Uint8Array.from(bytes));
  });

  it.each<[string, Partial<EvidenceSealBinding>]>([
    ['another environment', { environment: 'prod-us' }],
    ['another owner', { principal: 'user-b' }],
    ['another project', { project: 'project-b' }],
    ['another receipt', { receipt: 'evr_2' }],
    ['another plane', { plane: 'summary' }],
  ])('refuses %s', (_name, change) => {
    const sealed = sealEvidence(bytes, binding, key);

    expect(openEvidence(sealed, { ...binding, ...change }, keys)).toBeUndefined();
  });

  it('refuses tampering, a retired key and malformed values without throwing', () => {
    const sealed = sealEvidence(bytes, binding, key);
    const [version, nonce, tag, ciphertext] = sealed.split('.');
    /* A different first character changes the first ciphertext byte. */
    const tampered = `${ciphertext!.startsWith('A') ? 'B' : 'A'}${ciphertext!.slice(1)}`;

    expect(openEvidence([version, nonce, tag, tampered].join('.'), binding, keys)).toBeUndefined();
    expect(openEvidence(sealed, binding, new Map([[4, key.key]]))).toBeUndefined();
    expect(openEvidence(`${sealed}.extra`, binding, keys)).toBeUndefined();
    expect(openEvidence('not-sealed', binding, keys)).toBeUndefined();
    expect(openEvidence(sealed, binding, new Map([[3, Uint8Array.from(randomBytes(32))]]))).toBeUndefined();
  });
});
