import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const envelopeVersion = 'v1';
const connectorSalt = 'tau-paseo-connector';

const deriveKey = (secret: string): Uint8Array<ArrayBuffer> =>
  Buffer.from(hkdfSync('sha256', secret, connectorSalt, 'connection-secret-encryption', 32));

export const encryptPaseoConnectionSecret = (plaintext: string, secret: string): string => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    envelopeVersion,
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptPaseoConnectionSecret = (payload: string, secret: string): string => {
  const [version, nonce, tag, ciphertext] = payload.split('.');
  if (version !== envelopeVersion || !nonce || !tag || ciphertext === undefined) {
    throw new Error('Invalid Paseo connection secret envelope');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(nonce, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
};
