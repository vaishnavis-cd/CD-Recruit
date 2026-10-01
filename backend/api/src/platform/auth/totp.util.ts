import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generate a random Base32 secret (160-bit, 32 characters)
 */
export function generateBase32Secret(length = 32): string {
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[bytes[i] % 32];
  }
  return secret;
}

/**
 * Decode Base32 string to Buffer
 */
export function base32ToBuffer(base32: string): Buffer {
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = '';
  for (let i = 0; i < cleanBase32.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleanBase32[i]);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: ${cleanBase32[i]}`);
    }
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate RFC 6238 TOTP code for a given timestamp and time-step (default: 30s)
 */
export function generateTotpCode(secret: string, timestampMs = Date.now(), timeStepSec = 30): string {
  const counter = Math.floor(timestampMs / 1000 / timeStepSec);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const secretBuffer = base32ToBuffer(secret);
  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  // Dynamic truncation (RFC 4226 / RFC 6238)
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
 * Verify TOTP code with time-step drift tolerance (default: window = 1 => +/- 30 seconds)
 */
export function verifyTotpCode(
  secret: string,
  candidateCode: string,
  window = 1,
  timeStepSec = 30,
  timestampMs = Date.now()
): boolean {
  if (!candidateCode || candidateCode.length !== 6) {
    return false;
  }

  const currentCounter = Math.floor(timestampMs / 1000 / timeStepSec);

  for (let i = -window; i <= window; i++) {
    const counterTimeMs = (currentCounter + i) * timeStepSec * 1000;
    try {
      const expectedCode = generateTotpCode(secret, counterTimeMs, timeStepSec);
      if (crypto.timingSafeEqual(Buffer.from(candidateCode), Buffer.from(expectedCode))) {
        return true;
      }
    } catch {
      // Continue checking next window interval
    }
  }

  return false;
}

/**
 * Build standard otpauth URI compatible with Microsoft Authenticator / Google Authenticator
 */
export function buildOtpAuthUri(
  accountEmail: string,
  secret: string,
  issuer = 'Proctora Platform'
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(accountEmail);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate QR code data URL (PNG) from otpauth URI
 */
export async function generateQrCodeDataUrl(otpAuthUri: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
    color: {
      dark: '#030712',
      light: '#ffffff',
    },
  });
}

/**
 * Symmetric AES-256-GCM encryption for TOTP secret storage
 */
export function encryptTotpSecret(secret: string, masterKey: string): string {
  const key = crypto.createHash('sha256').update(masterKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-gcm$${iv.toString('hex')}$${tag.toString('hex')}$${encrypted.toString('hex')}`;
}

/**
 * Symmetric AES-256-GCM decryption for TOTP secret retrieval
 */
export function decryptTotpSecret(encryptedString: string, masterKey: string): string {
  const parts = encryptedString.split('$');
  if (parts.length !== 4 || parts[0] !== 'aes-gcm') {
    // If plaintext or legacy format
    return encryptedString;
  }
  const key = crypto.createHash('sha256').update(masterKey).digest();
  const iv = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const encrypted = Buffer.from(parts[3], 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
