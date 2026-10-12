import type { EncryptedBlob, VaultMeta } from './types';

const ITERATIONS = 250_000;
const CHECK_TEXT = 'apmix-team-assist';
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function exportRaw(key: CryptoKey): Promise<string> {
  return b64(await crypto.subtle.exportKey('raw', key));
}

export async function importRaw(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export async function encrypt(key: CryptoKey, text: string): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: b64(iv), data: b64(data) };
}

export async function decrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.data));
  return dec.decode(plain);
}

export async function createVault(passphrase: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  if (passphrase.length < 8) throw new Error('口令至少 8 位');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  return { meta: { salt: b64(salt), check: await encrypt(key, CHECK_TEXT) }, key };
}

export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<CryptoKey> {
  const key = await deriveKey(passphrase, unb64(meta.salt));
  try {
    if ((await decrypt(key, meta.check)) === CHECK_TEXT) return key;
  } catch { /* fallthrough */ }
  throw new Error('口令错误');
}
