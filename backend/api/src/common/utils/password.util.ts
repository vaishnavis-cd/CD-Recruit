import * as crypto from "crypto";

/**
 * Hash a plaintext password using Node.js crypto.scrypt (memory-hard, timing-safe).
 * Output format: scrypt$<salt_hex>$<derived_key_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string");
  }

  const salt = crypto.randomBytes(16);
  const keylen = 64;

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Verify a plaintext password against a stored scrypt hash in timing-safe constant time.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!password || !storedHash || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const salt = Buffer.from(parts[1], "hex");
  const expectedKey = Buffer.from(parts[2], "hex");
  const keylen = expectedKey.length;

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        if (derivedKey.length !== expectedKey.length) {
          return resolve(false);
        }
        resolve(crypto.timingSafeEqual(derivedKey, expectedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Computes a SHA-256 hash of a raw token for secure database storage.
 */
export function hashToken(rawToken: string): string {
  if (!rawToken) return "";
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
}

/**
 * Generates a cryptographically secure random refresh token.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}
