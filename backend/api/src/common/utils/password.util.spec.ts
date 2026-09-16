import {
  hashPassword,
  verifyPassword,
  hashToken,
  generateRefreshToken,
} from "./password.util";

describe("Password and Token Utilities", () => {
  describe("hashPassword & verifyPassword", () => {
    it("should hash a password and verify successfully", async () => {
      const password = "StrongPassword@123!";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash.startsWith("scrypt$")).toBe(true);
      expect(hash).not.toEqual(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const password = "CorrectPassword123";
      const hash = await hashPassword(password);

      const isValid = await verifyPassword("WrongPassword123", hash);
      expect(isValid).toBe(false);
    });

    it("should return false for null, undefined, or malformed hashes", async () => {
      expect(await verifyPassword("password", null)).toBe(false);
      expect(await verifyPassword("password", undefined)).toBe(false);
      expect(await verifyPassword("password", "")).toBe(false);
      expect(await verifyPassword("password", "invalid-hash-format")).toBe(false);
      expect(await verifyPassword("", "scrypt$1234$5678")).toBe(false);
    });

    it("should throw error if attempting to hash empty or invalid password", async () => {
      await expect(hashPassword("")).rejects.toThrow();
      await expect(hashPassword(null as any)).rejects.toThrow();
    });

    it("should generate distinct hashes for the same password due to random salts", async () => {
      const password = "SamePassword123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toEqual(hash2);
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });
  });

  describe("hashToken", () => {
    it("should compute SHA-256 hash deterministically", () => {
      const token = "my-secret-refresh-token";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBeDefined();
      expect(hash1.length).toBe(64); // SHA-256 hex length
      expect(hash1).toEqual(hash2);
    });

    it("should return empty string for empty input", () => {
      expect(hashToken("")).toBe("");
    });
  });

  describe("generateRefreshToken", () => {
    it("should generate cryptographically random 80-char hex string (40 bytes)", () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();

      expect(token1).toBeDefined();
      expect(token1.length).toBe(80);
      expect(token2.length).toBe(80);
      expect(token1).not.toEqual(token2);
    });
  });
});
