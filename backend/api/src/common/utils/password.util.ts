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
 * Validates that a password satisfies the Super Admin platform security policy:
 * - Minimum 12 characters
 * - Contains uppercase letter
 * - Contains lowercase letter
 * - Contains numeric digit
 * - Contains special symbol
 * - Not equal to current password (if provided)
 * - Does not contain the user's email or username prefix
 */
export function validatePasswordPolicy(
  password: string,
  email?: string,
  currentPassword?: string,
): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required and must be a string.' };
  }

  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters long.' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter.' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter.' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one digit.' };
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one symbol/special character.' };
  }

  if (currentPassword && password === currentPassword) {
    return { valid: false, error: 'New password cannot be identical to current password.' };
  }

  if (email && typeof email === 'string') {
    const emailLower = email.toLowerCase();
    const fullPrefix = emailLower.split('@')[0];
    const passLower = password.toLowerCase();

    const prefixParts = fullPrefix.split(/[-._+]/).filter((p) => p.length >= 3);
    const hasEmailMatch =
      passLower.includes(emailLower) ||
      (fullPrefix.length >= 3 && passLower.includes(fullPrefix)) ||
      prefixParts.some((part) => passLower.includes(part));

    if (hasEmailMatch) {
      return { valid: false, error: 'Password cannot contain the account email or username.' };
    }
  }

  return { valid: true };
}

/**
 * Generate a cryptographically secure random refresh token string (40 bytes -> 80 hex chars).
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

