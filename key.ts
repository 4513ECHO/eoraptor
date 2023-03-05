import { base64 } from "./deps.ts";

/**
Get some key material to use as input to the deriveKey method.
The key material is a password not stored in the DB.
*/
async function getKeyMaterial(password: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"],
  );
}

/** Given some key material and some random salt derive an AES-KW key using PBKDF2 */
async function getKey(
  keyMaterial: CryptoKey,
  salt: ArrayBuffer,
): Promise<CryptoKey> {
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 10000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

/** Wrap the given key */
async function wrapCryptoKey(
  keyToWrap: CryptoKey,
  userKEK: string,
): Promise<{ wrappedPrivKey: ArrayBuffer; salt: Uint8Array }> {
  // get the key encryption key
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrappedPrivKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: salt },
    await getKey(await getKeyMaterial(userKEK), salt),
    await crypto.subtle.exportKey("pkcs8", keyToWrap),
  );

  return { wrappedPrivKey, salt };
}

/** Generate a new wrapped user key */
export async function generateUserKey(
  userKEK: string,
): Promise<{ wrappedPrivKey: ArrayBuffer; salt: Uint8Array; pubKey: string }> {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

  const { wrappedPrivKey, salt } = await wrapCryptoKey(privateKey, userKEK);
  const pubKey = `-----BEGIN PUBLIC KEY-----\n${
    base64.encode(await crypto.subtle.exportKey("spki", publicKey))
  }\n-----END PUBLIC KEY-----`;

  return { wrappedPrivKey, salt, pubKey };
}

export async function importPublicKey(exportedKey: string): Promise<CryptoKey> {
  const trimmed = exportedKey.trim();
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  const pemContents = trimmed.substring(
    pemHeader.length,
    trimmed.length - pemFooter.length,
  );

  return await crypto.subtle.importKey(
    "spki",
    base64.decode(pemContents),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["verify"],
  );
}

/** Unwrap and import private key */
export async function unwrapPrivateKey(
  userKEK: string,
  wrappedPrivKey: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const keyBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: salt },
    await getKey(await getKeyMaterial(userKEK), salt),
    wrappedPrivKey,
  );
  return await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"],
  );
}
