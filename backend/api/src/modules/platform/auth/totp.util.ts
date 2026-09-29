import * as crypto from 'crypto';

/**
 * RFC 6238 Time-based One-Time Password (TOTP) utility
 * Pure Node.js crypto implementation - zero external dependencies
 */
export class TotpUtil {
  private static readonly BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /**
   * Generates a secure random 20-byte Base32 secret for TOTP setup
   */
  static generateSecret(byteLength = 20): string {
    const buffer = crypto.randomBytes(byteLength);
    return this.base32Encode(buffer);
  }

  /**
   * Generates an otpauth:// URI for QR code generation
   */
  static generateOtpauthUrl(email: string, secret: string, issuer = 'Proctora Platform'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Generates a 6-digit TOTP code for the given secret at the specified timestamp
   */
  static generateCode(secret: string, timestampMs = Date.now(), timeStepSeconds = 30): string {
    const key = this.base32Decode(secret);
    const counter = Math.floor(timestampMs / 1000 / timeStepSeconds);

    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(buffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  }

  /**
   * Verifies a 6-digit TOTP code with time-drift allowance (+-1 step = +-30s window)
   */
  static verifyCode(
    secret: string,
    token: string,
    windowSteps = 1,
    timestampMs = Date.now(),
    timeStepSeconds = 30
  ): boolean {
    if (!token || token.length !== 6 || !/^\d{6}$/.test(token)) {
      return false;
    }

    for (let step = -windowSteps; step <= windowSteps; step++) {
      const checkTimestamp = timestampMs + step * timeStepSeconds * 1000;
      const expectedCode = this.generateCode(secret, checkTimestamp, timeStepSeconds);
      if (crypto.timingSafeEqual(Buffer.from(expectedCode), Buffer.from(token))) {
        return true;
      }
    }
    return false;
  }

  // ---------- Base32 Helpers ----------

  private static base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        output += this.BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += this.BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  private static base32Decode(base32: string): Buffer {
    const cleaned = base32.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < cleaned.length; i++) {
      const idx = this.BASE32_ALPHABET.indexOf(cleaned[i]);
      if (idx === -1) {
        throw new Error(`Invalid Base32 character: ${cleaned[i]}`);
      }
      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }
}
