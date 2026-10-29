import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** What a sealed payload is bound to. Opening it under any other binding fails. */
export type EvidenceSealBinding = Readonly<{
  environment: string;
  principal: string;
  project: string;
  receipt: string;
  plane: 'summary' | 'content';
}>;

/** One configured payload key. */
export type EvidenceSealKey = Readonly<{ version: number; key: Uint8Array<ArrayBuffer> }>;

const associatedData = (binding: EvidenceSealBinding, version: number): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(
    JSON.stringify([
      'agent-evidence',
      binding.environment,
      binding.principal,
      binding.project,
      binding.receipt,
      binding.plane,
      version,
    ]),
  );

/**
 * Seal accepted evidence for the delivery backlog with AES-256-GCM, binding
 * environment, owner, project, receipt and plane as associated data, so a
 * row copied to another owner or environment cannot be opened there.
 *
 * @param bytes - The canonical evidence bytes.
 * @param binding - What the payload belongs to.
 * @param key - The current payload key.
 * @returns `version.nonce.tag.ciphertext`, each part unpadded base64url.
 */
export const sealEvidence = (
  bytes: Uint8Array<ArrayBuffer>,
  binding: EvidenceSealBinding,
  key: EvidenceSealKey,
): string => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.key, nonce);
  cipher.setAAD(associatedData(binding, key.version));
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return [
    String(key.version),
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

/**
 * Open a sealed payload. Any mismatch (key version, binding, tampering)
 * answers `undefined`; the caller decides the disposition, and nothing about
 * the payload reaches an error message.
 *
 * @param sealed - The stored value.
 * @param binding - The binding the caller expects.
 * @param keys - Keys still able to open pending payloads, by version.
 * @returns The evidence bytes, or `undefined`.
 */
export const openEvidence = (
  sealed: string,
  binding: EvidenceSealBinding,
  keys: ReadonlyMap<number, Uint8Array<ArrayBuffer>>,
): Uint8Array<ArrayBuffer> | undefined => {
  const [encodedVersion, nonce, tag, ciphertext, extra] = sealed.split('.');
  const version = Number(encodedVersion);
  const key = keys.get(version);
  if (key === undefined || !nonce || !tag || ciphertext === undefined || extra !== undefined) {
    return undefined;
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
    decipher.setAAD(associatedData(binding, version));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Uint8Array.from(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]));
  } catch {
    return undefined;
  }
};
