import "server-only";

import { prisma } from "@/lib/db/client";

import { verifyPassword } from "./password";

/**
 * Verify a login (username + password) against the Account table.
 * Returns the linked UserProfile id on success, otherwise null. Designed to take
 * roughly constant time whether or not the username exists, to avoid leaking
 * which usernames are registered.
 */
export async function verifyAccountCredentials(
  username: string,
  password: string,
): Promise<string | null> {
  const account = await prisma.account.findUnique({
    where: { username },
  });

  // Always run a hash comparison so a missing account is not obviously faster.
  const stored =
    account?.passwordHash ?? "scrypt$0000000000000000$00000000000000000000";
  const ok = verifyPassword(password, stored);

  return account && ok ? account.userProfileId : null;
}
