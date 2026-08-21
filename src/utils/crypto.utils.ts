import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

/**
 * Derives a 256-bit encryption key from application secrets.
 * @returns {Buffer} SHA-256 derived key buffer
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.BETTER_AUTH_SECRET ||
    "ieltsly-secure-encryption-key-fallback-32b";
  return crypto.createHash("sha256").update(secret).digest();
}

export interface EncryptedPayload {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts sensitive string data using AES-256-GCM.
 * @param {string} text Plaintext input to encrypt
 * @returns {EncryptedPayload} Encrypted payload object containing ciphertext, IV, and auth tag
 */
export function encrypt(text: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag,
  };
}

/**
 * Decrypts an AES-256-GCM payload back to plaintext.
 * @param {EncryptedPayload} payload Ciphertext, IV, and auth tag
 * @returns {string} Decrypted plaintext string
 */
export function decrypt(payload: EncryptedPayload): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(payload.encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Returns a masked representation of an API key for display.
 * @param {string} key Plaintext API key
 * @returns {string} Masked string with visible prefix and suffix
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  const start = key.slice(0, 4);
  const end = key.slice(-4);
  return `${start}••••••••••••${end}`;
}
