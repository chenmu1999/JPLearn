import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Stored as `scrypt$<saltHex>$<hashHex>`. Pure node:crypto so this module can be
// imported both from server code and from the Prisma seed (plain tsx, no Next
// "server-only" boundary).

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  const derived = scryptSync(password, salt, KEY_LENGTH);

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
